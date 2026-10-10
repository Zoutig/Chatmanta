// Self-check voor de pure M-C limits-helpers. Vaste datums meegegeven → deterministisch
// (geen Date.now() in de asserts). Run:
//   node --import tsx --test lib/v1/limits/__tests__/usage-limits.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  startOfUtcDayIso,
  startOfUtcMonthIso,
  isOverBudget,
  resolveDailyBudgetEur,
  resolveQuestionLimit,
  questionVerdict,
} from '../usage-limits';

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

test('resolveDailyBudgetEur — null/NaN/negatief → €2, 0 blijft 0', () => {
  // KRITISCH: null mag NIET naar 0 (Number(null)===0 zou de bot offline forceren).
  assert.equal(resolveDailyBudgetEur(null), 2.0);
  assert.equal(resolveDailyBudgetEur(undefined), 2.0);
  assert.equal(resolveDailyBudgetEur('niet-een-getal'), 2.0);
  assert.equal(resolveDailyBudgetEur(-5), 2.0);
  assert.equal(resolveDailyBudgetEur(0), 0); // geldige "uit"-waarde (admin zet budget op 0)
  assert.equal(resolveDailyBudgetEur(5), 5);
  assert.equal(resolveDailyBudgetEur('2.50'), 2.5); // numeric komt als string uit PostgREST
});

test('resolveQuestionLimit — null/NaN/negatief → fallback, 0 blijft 0, afronden naar beneden', () => {
  assert.equal(resolveQuestionLimit(null, 250), 250);
  assert.equal(resolveQuestionLimit(undefined, 250), 250);
  assert.equal(resolveQuestionLimit('abc', 250), 250);
  assert.equal(resolveQuestionLimit(-1, 250), 250);
  assert.equal(resolveQuestionLimit(0, 250), 0); // admin zet de bot dicht
  assert.equal(resolveQuestionLimit(1500, 250), 1500);
  assert.equal(resolveQuestionLimit('99.9', 250), 99);
});

test('questionVerdict — exact bereikte limiet sluit (>=), limiet 0 = altijd dicht', () => {
  assert.deepEqual(questionVerdict(249, 250), { over: false, count: 249, limit: 250 });
  assert.equal(questionVerdict(250, 250).over, true);
  assert.equal(questionVerdict(0, 0).over, true);
});
