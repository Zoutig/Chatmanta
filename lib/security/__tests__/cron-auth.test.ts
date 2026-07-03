// Self-check voor isAuthorizedCron. Puur (geen env, geen Date.now()) → deterministisch.
// Run: node --import tsx --test lib/security/__tests__/cron-auth.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isAuthorizedCron } from '../cron-auth';

test('correct secret → true', () => {
  assert.equal(isAuthorizedCron('Bearer s3cret', 's3cret'), true);
});

test('verkeerd secret → false', () => {
  assert.equal(isAuthorizedCron('Bearer fout', 's3cret'), false);
});

test('header zonder Bearer-prefix → false', () => {
  assert.equal(isAuthorizedCron('s3cret', 's3cret'), false);
});

test('lege of null header → false', () => {
  assert.equal(isAuthorizedCron('', 's3cret'), false);
  assert.equal(isAuthorizedCron(null, 's3cret'), false);
  assert.equal(isAuthorizedCron(undefined, 's3cret'), false);
});

test('geen secret (undefined of leeg) → false (fail-closed)', () => {
  assert.equal(isAuthorizedCron('Bearer s3cret', undefined), false);
  assert.equal(isAuthorizedCron('Bearer s3cret', ''), false);
});

test('correct secret met extra suffix → false', () => {
  assert.equal(isAuthorizedCron('Bearer s3cret2', 's3cret'), false);
});
