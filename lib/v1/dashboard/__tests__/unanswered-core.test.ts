import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveUnanswered,
  isUnansweredLogRow,
  normalizeQuestionKey,
  openQuestions,
  pairFallbackTurns,
  threadsWithOpenQuestions,
  type FallbackTurn,
  type LogRow,
  type QaRow,
} from '../unanswered-core';

const T = (min: number) => new Date(Date.parse('2026-10-15T10:00:00Z') + min * 60_000).toISOString();
const fb = (question: string, min: number, extra: Partial<LogRow> = {}): LogRow => ({
  question,
  kind: 'fallback',
  category: null,
  gap_kind: 'zero_hits',
  created_at: T(min),
  ...extra,
});
const ans = (question: string, min: number): LogRow => ({ question, kind: 'answer', created_at: T(min) });
const qa = (question: string, min: number, extra: Partial<QaRow> = {}): QaRow => ({
  id: `qa-${question}`,
  question,
  active: true,
  ingested_document_id: 'doc',
  updated_at: T(min),
  ...extra,
});

test('normalizeQuestionKey — hoofdletters, witruimte, leestekens en PII gelijkgetrokken', () => {
  assert.equal(normalizeQuestionKey('  Wat  kost een DAK?? '), 'wat kost een dak');
  // Gesprek (ruw) en query_log (geredigeerd) geven dezelfde sleutel.
  assert.equal(normalizeQuestionKey('Bel me op 0612345678'), normalizeQuestionKey('Bel me op [telefoon]'));
  assert.equal(normalizeQuestionKey(null), '');
});

test('isUnansweredLogRow — fallback telt, off-topic en antwoorden niet', () => {
  assert.equal(isUnansweredLogRow(fb('x', 0)), true);
  assert.equal(isUnansweredLogRow(fb('x', 0, { category: 'off_topic' })), false);
  assert.equal(isUnansweredLogRow(fb('x', 0, { gap_kind: 'off_topic' })), false);
  assert.equal(isUnansweredLogRow(ans('x', 0)), false);
  assert.equal(isUnansweredLogRow({ question: 'x', kind: 'answer', gap_kind: 'low_grounding', created_at: T(0) }), false);
});

test('deriveUnanswered — groepeert op vraag, telt beurten, nieuwste formulering', () => {
  const qs = deriveUnanswered({
    logRows: [fb('Wat kost een dak?', 0), fb('wat kost een dak', 5), fb('Parkeren?', 1)],
    qaItems: [],
    turns: [],
  });
  assert.equal(qs.length, 2);
  assert.equal(qs[0].key, 'wat kost een dak');
  assert.equal(qs[0].occurrences, 2);
  assert.equal(qs[0].question, 'wat kost een dak');
  assert.equal(qs[0].lastSeenAt, T(5));
  assert.ok(qs.every((q) => q.status === 'open'));
});

test('deriveUnanswered — off-topic-vragen staan er niet in', () => {
  const qs = deriveUnanswered({ logRows: [fb('Wie wint het WK?', 0, { category: 'off_topic' })], qaItems: [], turns: [] });
  assert.equal(qs.length, 0);
});

test('deriveUnanswered — Q&A ná de laatste fallback = afgehandeld; ervóór = nog open (qaExists)', () => {
  const after = deriveUnanswered({ logRows: [fb('Wat kost een dak?', 0)], qaItems: [qa('Wat kost een dak?', 10)], turns: [] });
  assert.equal(after[0].status, 'qa');
  assert.equal(after[0].qaId, 'qa-Wat kost een dak?');

  const before = deriveUnanswered({ logRows: [fb('Wat kost een dak?', 20)], qaItems: [qa('Wat kost een dak?', 10)], turns: [] });
  assert.equal(before[0].status, 'open');
  assert.equal(before[0].qaExists, true);
});

test('deriveUnanswered — Q&A die niet is ingelezen of inactief is, handelt niets af', () => {
  for (const extra of [{ ingested_document_id: null }, { active: false }]) {
    const qs = deriveUnanswered({ logRows: [fb('Wat kost een dak?', 0)], qaItems: [qa('Wat kost een dak?', 10, extra)], turns: [] });
    assert.equal(qs[0].status, 'open');
  }
});

test('deriveUnanswered — vergelijkbare Q&A-formulering telt ook (token-overlap)', () => {
  const qs = deriveUnanswered({
    logRows: [fb('Wat zijn de openingstijden?', 0)],
    qaItems: [qa('openingstijden', 10)],
    turns: [],
  });
  assert.equal(qs[0].status, 'qa');
});

test('deriveUnanswered — later wél beantwoord = afgehandeld', () => {
  const qs = deriveUnanswered({ logRows: [fb('Parkeren?', 0), ans('parkeren', 30)], qaItems: [], turns: [] });
  assert.equal(qs[0].status, 'answered');
  const earlier = deriveUnanswered({ logRows: [ans('parkeren', 0), fb('Parkeren?', 30)], qaItems: [], turns: [] });
  assert.equal(earlier[0].status, 'open');
});

const turn = (question: string, min: number, threadId: string, closed: boolean, lastMin = min): FallbackTurn => ({
  threadId,
  question,
  at: T(min),
  threadClosed: closed,
  threadLastMessageAt: T(lastMin),
});

test('deriveUnanswered — "Markeer als opgelost" op het gesprek handelt de vraag af; nieuwe fallback heropent', () => {
  const closed = deriveUnanswered({
    logRows: [fb('Parkeren?', 0)],
    qaItems: [],
    turns: [turn('Parkeren?', 0, 't1', true)],
  });
  assert.equal(closed[0].status, 'resolved');
  assert.deepEqual(closed[0].threadIds, []);

  const reopened = deriveUnanswered({
    logRows: [fb('Parkeren?', 0), fb('parkeren', 60)],
    qaItems: [],
    turns: [turn('Parkeren?', 0, 't1', true), turn('parkeren', 60, 't2', false)],
  });
  assert.equal(reopened[0].status, 'open');
  assert.deepEqual(reopened[0].threadIds, ['t2']);
});

test('deriveUnanswered — nieuwe fallback in HETZELFDE opgeloste gesprek: open (appendTurn heropent het gesprek)', () => {
  // lib/v1/conversations/write.ts zet een gesloten gesprek bij een fallback-beurt terug
  // op 'open'. De loader ziet het gesprek dan als open, dus de vraag komt terug.
  const qs = deriveUnanswered({
    logRows: [fb('Parkeren?', 0), fb('parkeren', 60)],
    qaItems: [],
    turns: [turn('Parkeren?', 0, 't1', false, 60), turn('parkeren', 60, 't1', false, 60)],
  });
  assert.equal(qs[0].status, 'open');
  assert.deepEqual(qs[0].threadIds, ['t1']);
});

test('openQuestions + threadsWithOpenQuestions — tellers op dezelfde definitie', () => {
  const qs = deriveUnanswered({
    logRows: [fb('A?', 0), fb('B?', 1), fb('C?', 2, { category: 'off_topic' })],
    qaItems: [qa('B', 10)],
    turns: [turn('A?', 0, 't1', false), turn('B?', 1, 't2', false), turn('C?', 2, 't3', false)],
  });
  assert.deepEqual(openQuestions(qs).map((q) => q.key), ['a']);
  assert.deepEqual([...threadsWithOpenQuestions(qs)], ['t1']);
  // Volgorde: open eerst, daarna afgehandeld.
  assert.equal(qs[0].status, 'open');
  assert.equal(qs[1].status, 'qa');
});

test('pairFallbackTurns — fallback krijgt de bezoekersvraag ervoor; onbekende gesprekken vallen weg', () => {
  const threads = new Map([
    ['t1', { closed: false, lastMessageAt: T(10) }],
    ['t2', { closed: true, lastMessageAt: T(3) }],
  ]);
  const turns = pairFallbackTurns(
    [
      { thread_id: 't1', created_at: T(5) },
      { thread_id: 't2', created_at: T(2) },
      { thread_id: 'weg', created_at: T(2) },
    ],
    [
      { thread_id: 't1', content: 'Eerste vraag', created_at: T(1) },
      { thread_id: 't1', content: 'Tweede vraag', created_at: T(5) },
      { thread_id: 't1', content: 'Derde vraag', created_at: T(8) },
      { thread_id: 't2', content: 'Andere vraag', created_at: T(2) },
    ],
    threads,
  );
  assert.equal(turns.length, 2);
  assert.equal(turns[0].question, 'Tweede vraag');
  assert.equal(turns[0].threadClosed, false);
  assert.equal(turns[1].question, 'Andere vraag');
  assert.equal(turns[1].threadClosed, true);
});
