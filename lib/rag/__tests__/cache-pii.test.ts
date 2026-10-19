// Unit-test: answer-cache overslaan bij PII of zelfintroductie (security-audit 2026-10, #13).
// Run: node --import tsx --test lib/rag/__tests__/cache-pii.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { shouldBypassAnswerCache } from '../cache-pii';

test('PII in de vraag → cache overslaan', () => {
  assert.equal(shouldBypassAnswerCache('Kunnen jullie mailen naar jan@example.com?'), true);
  assert.equal(shouldBypassAnswerCache('Bel me op 06 12345678 a.u.b.'), true);
  assert.equal(shouldBypassAnswerCache('Mijn IBAN is NL91ABNA0417164300'), true);
});

test('zelfintroductie (NL en EN) → cache overslaan', () => {
  assert.equal(shouldBypassAnswerCache('Hoi, ik ben Jan. Wat kost een abonnement?'), true);
  assert.equal(shouldBypassAnswerCache('Mijn naam is Petra, hebben jullie plek?'), true);
  assert.equal(shouldBypassAnswerCache('Hello, I am Sarah from Utrecht'), true);
  assert.equal(shouldBypassAnswerCache('My name is Tom'), true);
  assert.equal(shouldBypassAnswerCache('IK BEN benieuwd naar de prijzen'), true);
});

test('gewone vragen blijven cachebaar', () => {
  assert.equal(shouldBypassAnswerCache('Wat zijn de openingstijden?'), false);
  assert.equal(shouldBypassAnswerCache('Hoeveel kost een weekend in het park?'), false);
  assert.equal(shouldBypassAnswerCache('Do you have parking?'), false);
  assert.equal(shouldBypassAnswerCache('Ham of kaas op de pizza?'), false);
  assert.equal(shouldBypassAnswerCache('Is er een miami-thema?'), false);
  assert.equal(shouldBypassAnswerCache(''), false);
});
