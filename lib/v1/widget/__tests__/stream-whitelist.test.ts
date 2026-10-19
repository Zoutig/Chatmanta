// Unit-test voor de publieke widget-stream-whitelist (security-audit 2026-10, #2).
// Run: node --import tsx --test lib/v1/widget/__tests__/stream-whitelist.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { publicStreamLine, toPublicStreamEvent } from '../stream-whitelist';

const SECRET_EXCERPT = 'GEHEIM-FRAGMENT uit een intern document';
const source = {
  id: 'chunk-1',
  filename: 'intern-prijsbeleid.pdf',
  similarity: 0.61,
  contentExcerpt: SECRET_EXCERPT,
  parentExcerpt: SECRET_EXCERPT + ' (parent)',
  parentIndex: 2,
  url: 'https://klant.example/pagina',
};

const answerResponse = {
  kind: 'answer',
  answer: 'Het antwoord.',
  rewrite: { original: 'q', rewritten: 'q2' },
  sources: [source],
  threshold: 0.4,
  embedTokens: 12,
  chatInputTokens: 900,
  chatOutputTokens: 80,
  totalCostUsd: 0.0123,
  botVersion: 'v0.15',
  extras: { phaseTimingsMs: { total_ms: 1200 } },
};

const fallbackResponse = {
  kind: 'fallback',
  answer: 'Daar kan ik je niet mee helpen.',
  reason: 'no-relevant-chunks',
  topSimilarity: 0.31,
  rewrite: null,
  sources: [source],
  threshold: 0.4,
  embedTokens: 12,
  totalCostUsd: 0.0004,
};

const FORBIDDEN = [
  'sources',
  'totalCostUsd',
  'parentExcerpt',
  'contentExcerpt',
  'threshold',
  'botVersion',
  'intern-prijsbeleid.pdf',
  'GEHEIM-FRAGMENT',
  'phaseTimingsMs',
  'costUsd',
  'inputTokens',
  'topSimilarity',
  'rewrite',
];

const allEvents = [
  { kind: 'status', phase: 'retrieve' },
  { kind: 'answer-start', botVersion: 'v0.15', sources: [source], rewrite: null, threshold: 0.4 },
  { kind: 'answer-delta', text: 'Het ' },
  { kind: 'answer-done', response: answerResponse },
  { kind: 'followups-done', followUps: ['Wat kost het?'], inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
  { kind: 'replacement', response: answerResponse, reason: 'claim-regenerate', regeneratedVerifiedRatio: 0.5 },
  { kind: 'metrics-done', phaseTimingsMs: { total_ms: 1200 } },
  { kind: 'fallback', response: fallbackResponse },
  { kind: 'smalltalk', response: { kind: 'smalltalk', answer: 'Hoi!', totalCostUsd: 0.0001, preProcessTokens: { in: 1, out: 1 } } },
  { kind: 'error', code: 'LLM_TIMEOUT', retryAfterSec: 3 },
];

test('widget-stream bevat geen chunks, bestandsnamen, kosten, threshold of botversie', () => {
  const body = allEvents.map((e) => publicStreamLine(e, 'req-1')).join('');
  for (const needle of FORBIDDEN) {
    assert.ok(!body.includes(needle), `respons bevat verboden "${needle}": ${body}`);
  }
});

test('velden die de V1-widget leest blijven behouden', () => {
  assert.deepEqual(toPublicStreamEvent({ kind: 'answer-start' }, 'r'), { kind: 'answer-start' });
  assert.deepEqual(toPublicStreamEvent({ kind: 'answer-delta', text: 'x' } as never, 'r'), {
    kind: 'answer-delta',
    text: 'x',
  });
  assert.deepEqual(toPublicStreamEvent({ kind: 'answer-done', response: answerResponse } as never, 'r'), {
    kind: 'answer-done',
    response: { kind: 'answer', answer: 'Het antwoord.' },
  });
  assert.deepEqual(toPublicStreamEvent({ kind: 'fallback', response: fallbackResponse } as never, 'r'), {
    kind: 'fallback',
    response: { kind: 'fallback', answer: 'Daar kan ik je niet mee helpen.' },
  });
  assert.deepEqual(toPublicStreamEvent({ kind: 'status', phase: 'embed' } as never, 'r'), {
    kind: 'status',
    phase: 'embed',
  });
  assert.deepEqual(
    toPublicStreamEvent({ kind: 'followups-done', followUps: ['a'], costUsd: 1 } as never, 'r'),
    { kind: 'followups-done', followUps: ['a'] },
  );
});

test('error-event: alleen code (+retryAfterSec) en requestId', () => {
  assert.deepEqual(toPublicStreamEvent({ kind: 'error', code: 'INTERNAL', detail: 'stack' } as never, 'req-9'), {
    kind: 'error',
    code: 'INTERNAL',
    requestId: 'req-9',
  });
});

test('metrics-done en onbekende events gaan niet naar buiten', () => {
  assert.equal(publicStreamLine({ kind: 'metrics-done' }, 'r'), '');
  assert.equal(publicStreamLine({ kind: 'iets-nieuws' }, 'r'), '');
});

test('demo-optie: alleen brontitel/url/similarity bij een answer, nooit fragmenten', () => {
  const ev = toPublicStreamEvent({ kind: 'answer-done', response: answerResponse } as never, 'r', {
    includeSourceTitles: true,
  });
  assert.deepEqual(ev, {
    kind: 'answer-done',
    response: {
      kind: 'answer',
      answer: 'Het antwoord.',
      sources: [{ filename: 'intern-prijsbeleid.pdf', url: 'https://klant.example/pagina', similarity: 0.61 }],
    },
  });
  const fb = publicStreamLine({ kind: 'fallback', response: fallbackResponse } as never, 'r', {
    includeSourceTitles: true,
  });
  assert.ok(!fb.includes('sources'), 'fallback (weigering) toont geen bronnen');
  assert.ok(!JSON.stringify(ev).includes('GEHEIM-FRAGMENT'));
});
