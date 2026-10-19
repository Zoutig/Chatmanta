// Unit-test: het loginscherm toont alleen vaste foutteksten (audit 2026-10).
// Run: node --import tsx --test app/v1/login/__tests__/login-errors.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GENERIC_LOGIN_ERROR, loginErrorMessage } from '../login-errors';

test('bekende codes → hun vaste tekst', () => {
  assert.match(loginErrorMessage('missing_token') ?? '', /ongeldig of incompleet/);
  assert.match(loginErrorMessage('verify_failed') ?? '', /verlopen of al gebruikt/);
});

test('willekeurige tekst wordt nooit getoond', () => {
  const phish = 'Uw account is geblokkeerd, bel 0900-1234';
  assert.equal(loginErrorMessage(phish), GENERIC_LOGIN_ERROR);
  assert.equal(loginErrorMessage('toString'), GENERIC_LOGIN_ERROR);
  assert.equal(loginErrorMessage(['missing_token', 'x']), GENERIC_LOGIN_ERROR);
});

test('geen code → geen melding', () => {
  assert.equal(loginErrorMessage(undefined), undefined);
  assert.equal(loginErrorMessage(''), undefined);
});
