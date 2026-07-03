// Besluitlogica van de cache-epoch-guard (plan 006). De DB-lees-helper is een
// dunne wrapper; de write/skip-beslissing is het gedrag dat vast moet liggen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipCacheWrite } from '../cache-epoch';

test('gelijke epoch → write gaat door', () => {
  assert.equal(shouldSkipCacheWrite(0, 0), false);
  assert.equal(shouldSkipCacheWrite(3, 3), false);
});

test('epoch gebumpt tijdens de pipeline → skip', () => {
  assert.equal(shouldSkipCacheWrite(3, 4), true);
  assert.equal(shouldSkipCacheWrite(0, 1), true);
});

test('fail-closed: onleesbare epoch aan een van beide kanten → skip', () => {
  assert.equal(shouldSkipCacheWrite(null, 3), true);
  assert.equal(shouldSkipCacheWrite(3, null), true);
  assert.equal(shouldSkipCacheWrite(null, null), true);
});
