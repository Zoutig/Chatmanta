import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROI_DEFAULTS,
  adviseTier,
  computeRoi,
  formatAdvice,
  formatHours,
  formatNet,
  formatSaved,
} from '../calc';

test('startwaarden geven de uitkomst uit COPY.md §9', () => {
  const r = computeRoi(ROI_DEFAULTS);
  assert.equal(formatHours(r.savedHours), '±6 uur');
  assert.equal(formatSaved(r.savedEuro), '±€170');
  assert.equal(formatNet(r.netEuro), '±€140');
  assert.equal(formatAdvice(r.tier, r.tierPrice), 'Start (€29 p/m)');
});

test('pakketadvies volgt de maandlimieten uit pricing.ts', () => {
  assert.equal(adviseTier(500).id, 'start');
  assert.equal(adviseTier(501).id, 'groei');
  assert.equal(adviseTier(2000).id, 'groei');
  assert.equal(adviseTier(2001).id, 'compleet');
  assert.equal(adviseTier(99999).id, 'compleet');
  // 200 vragen/week ≈ 866/mnd → Groei (€57)
  const r = computeRoi({ ...ROI_DEFAULTS, questionsPerWeek: 200 });
  assert.equal(formatAdvice(r.tier, r.tierPrice), 'Groei (€57 p/m)');
});

test('negatieve netto-uitkomst krijgt een echt minteken', () => {
  const r = computeRoi({ questionsPerWeek: 5, minutesPerQuestion: 1, hourlyRate: 20, sharePct: 20 });
  assert.ok(r.netEuro < 0);
  assert.equal(formatNet(r.netEuro), '−€30');
});
