// Run: node --import tsx --test lib/rag/__tests__/cache-language.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedAnswerLanguageMismatch } from '../cache-language';

const NL_ANSWER = 'Hier zijn de handleidingen van de FRENIC Mega. Je kunt ze direct downloaden.';
const EN_ANSWER = 'Here are the manuals for the FRENIC Mega. You can download them directly.';

test('EN-vraag op een NL-antwoord → mismatch (miss)', () => {
  assert.equal(cachedAnswerLanguageMismatch('Where can I find the FRENIC Mega manual?', NL_ANSWER), true);
});

test('NL-vraag op een EN-antwoord → mismatch (miss)', () => {
  assert.equal(cachedAnswerLanguageMismatch('Waar vind ik de handleiding van de FRENIC Mega?', EN_ANSWER), true);
});

test('zelfde taal → geen mismatch', () => {
  assert.equal(cachedAnswerLanguageMismatch('Where can I find the FRENIC Mega manual?', EN_ANSWER), false);
  assert.equal(cachedAnswerLanguageMismatch('Waar vind ik de handleiding van de FRENIC Mega?', NL_ANSWER), false);
});

test('onzekere vraagtaal (alleen productnaam) → hit blijft geldig', () => {
  assert.equal(cachedAnswerLanguageMismatch('FRENIC Mega manual', NL_ANSWER), false);
  assert.equal(cachedAnswerLanguageMismatch('FRENIC Mega', EN_ANSWER), false);
});

test('onzekere antwoordtaal → hit blijft geldig', () => {
  assert.equal(cachedAnswerLanguageMismatch('Where can I find the manual?', '- [FRENIC Mega](https://x.nl/a.pdf)'), false);
});
