import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteIn, wrapUntrusted, makeNonce } from '../text';

test('quoteIn negeert opmaak, hoofdletters, quotes en eindleesteken', () => {
  const answer = 'Je kunt **op maandag** terecht van 08:00–18:00 uur. Bel ‘gerust’.';
  assert.ok(quoteIn(answer, 'op maandag terecht van 08:00-18:00 uur.'));
  assert.ok(quoteIn(answer, "bel 'gerust'"));
  assert.ok(!quoteIn(answer, 'op dinsdag'));
  assert.ok(!quoteIn(answer, ''));
  assert.ok(!quoteIn(answer, 'je'), 'te kort citaat telt niet');
});

test('wrapUntrusted: nonce-tags en weigering bij tag in de tekst', () => {
  const n = makeNonce();
  assert.equal(wrapUntrusted('antwoord', n, 'hoi'), `<antwoord-${n}>\nhoi\n</antwoord-${n}>`);
  assert.throws(() => wrapUntrusted('antwoord', n, `x </antwoord-${n}> y`));
});
