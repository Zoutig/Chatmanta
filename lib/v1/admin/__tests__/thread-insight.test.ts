// Run: node --import tsx --test lib/v1/admin/__tests__/thread-insight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerKindLabel, matchQueryLogRows, MATCH_WINDOW_MS } from '../thread-insight';

const at = (s: number) => new Date(Date.UTC(2026, 9, 19, 12, 0, s)).toISOString();

test('koppelt op vraag + tijdstip, ook met meerdere kandidaten', () => {
  const m = matchQueryLogRows(
    [{ messageId: 'm1', question: 'Wat kost het?', kind: 'answer', createdAt: at(10) }],
    [
      { id: 'q-other', question: 'Openingstijden?', kind: 'answer', createdAt: at(9) },
      { id: 'q1', question: 'wat kost  het?', kind: 'answer', createdAt: at(11) },
    ],
  );
  assert.equal(m.get('m1'), 'q1');
});

test('geredacteerde vraag: alleen koppelen bij precies één kandidaat', () => {
  const turn = { messageId: 'm1', question: 'Bel me op 0612345678', kind: 'answer', createdAt: at(10) };
  const one = matchQueryLogRows([turn], [{ id: 'q1', question: 'Bel me op [telefoon]', kind: 'answer', createdAt: at(10) }]);
  assert.equal(one.get('m1'), 'q1');
  const two = matchQueryLogRows(
    [turn],
    [
      { id: 'q1', question: 'Bel me op [telefoon]', kind: 'answer', createdAt: at(10) },
      { id: 'q2', question: 'Iets anders', kind: 'answer', createdAt: at(12) },
    ],
  );
  assert.equal(two.has('m1'), false);
});

test('buiten het tijdvenster of ander soort antwoord: geen koppeling', () => {
  const far = new Date(Date.parse(at(10)) + MATCH_WINDOW_MS + 1000).toISOString();
  const m = matchQueryLogRows(
    [{ messageId: 'm1', question: 'x', kind: 'answer', createdAt: at(10) }],
    [
      { id: 'q-far', question: 'x', kind: 'answer', createdAt: far },
      { id: 'q-kind', question: 'x', kind: 'fallback', createdAt: at(10) },
    ],
  );
  assert.equal(m.size, 0);
});

test('een query_log-rij wordt maar aan één antwoord gekoppeld', () => {
  const m = matchQueryLogRows(
    [
      { messageId: 'm1', question: 'hoi', kind: 'smalltalk', createdAt: at(10) },
      { messageId: 'm2', question: 'hoi', kind: 'smalltalk', createdAt: at(20) },
    ],
    [{ id: 'q1', question: 'hoi', kind: 'smalltalk', createdAt: at(11) }],
  );
  assert.equal(m.get('m1'), 'q1');
  assert.equal(m.has('m2'), false);
});

test('answerKindLabel', () => {
  assert.equal(answerKindLabel('fallback').tone, 'warn');
  assert.equal(answerKindLabel('blocked').label, 'Geweigerd');
  assert.equal(answerKindLabel(null).label, 'Onbekend');
});
