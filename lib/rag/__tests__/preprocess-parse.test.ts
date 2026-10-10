import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreProcessOutput, parseSubQueries } from '../preprocess-parse';

test('off_topic action → kind off_topic', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: off_topic'), { kind: 'off_topic' });
});

test('off_topic is hoofdletter-ongevoelig en negeert trailing tekst', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: OFF_TOPIC\nrest'), { kind: 'off_topic' });
});

test('smalltalk blijft werken', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: smalltalk\nREPLY: Hoi!'), {
    kind: 'smalltalk',
    reply: 'Hoi!',
  });
});

test('search blijft werken', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: search\nQUERY: wat zijn de tarieven'), {
    kind: 'search',
    query: 'wat zijn de tarieven',
  });
});

test('onbekende action → null', () => {
  assert.equal(parsePreProcessOutput('ACTION: foobar'), null);
});

test('parseSubQueries — max 2, ontdubbeld, niet gelijk aan hoofdvraag; QUERY blijft één regel', () => {
  const raw = [
    'ACTION: search',
    'QUERY: tarief dakreparatie Acme',
    'SUB: tarief bitumen dak',
    'SUB: Tarief  dakreparatie acme',
    'SUB: levertijd dakreparatie',
    'SUB: garantie',
  ].join('\n');
  assert.deepEqual(parsePreProcessOutput(raw), { kind: 'search', query: 'tarief dakreparatie Acme' });
  assert.deepEqual(parseSubQueries(raw, 'tarief dakreparatie Acme'), [
    'tarief bitumen dak',
    'levertijd dakreparatie',
  ]);
  assert.deepEqual(parseSubQueries(['ACTION: search', 'QUERY: x'].join('\n'), 'x'), []);
});
