import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreProcessOutput } from '../preprocess-parse';

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
