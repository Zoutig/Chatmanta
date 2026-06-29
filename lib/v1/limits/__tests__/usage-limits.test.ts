// Self-check voor de pure M-C limits-helpers. Vaste datums meegegeven → deterministisch
// (geen Date.now() in de asserts). Run:
//   node --import tsx --test lib/v1/limits/__tests__/usage-limits.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { startOfUtcDayIso, startOfUtcMonthIso, isOverBudget } from '../usage-limits';

test('startOfUtcDayIso → UTC-middernacht van de dag', () => {
  assert.equal(
    startOfUtcDayIso(new Date('2026-06-29T15:30:45.123Z')),
    '2026-06-29T00:00:00.000Z',
  );
  // Net na middernacht UTC blijft dezelfde dag.
  assert.equal(
    startOfUtcDayIso(new Date('2026-06-29T00:00:00.001Z')),
    '2026-06-29T00:00:00.000Z',
  );
});

test('startOfUtcMonthIso → 1e van de maand 00:00 UTC', () => {
  assert.equal(
    startOfUtcMonthIso(new Date('2026-06-29T15:30:45.123Z')),
    '2026-06-01T00:00:00.000Z',
  );
  // Jaargrens: december → die december, niet januari.
  assert.equal(
    startOfUtcMonthIso(new Date('2026-12-31T23:59:59.999Z')),
    '2026-12-01T00:00:00.000Z',
  );
});

test('isOverBudget — exact-cap sluit (>=)', () => {
  assert.equal(isOverBudget(0.99, 1.0), false);
  assert.equal(isOverBudget(1.0, 1.0), true); // exact bereikt → dicht
  assert.equal(isOverBudget(1.01, 1.0), true);
  assert.equal(isOverBudget(0, 0), true); // cap 0 → altijd over (forceer-over-budget pad)
});
