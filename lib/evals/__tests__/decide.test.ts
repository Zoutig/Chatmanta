import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, type DecisionInput } from '../decide';

const base: DecisionInput = {
  promotionReason: 'quality',
  veto: { zeroTolerance: [], perCase: [], diffuseP: 0.5 },
  coverage: { delta: 0.04, lo: 0.01, hi: 0.07, n: 300, iters: 10000 },
  nonInferiority: { criticalRateDeltaHi: 0, overRefusalDeltaHi: 0.01, ttftP90Ratio: 1, totalP95Ratio: 1, costRatioHi: 1 },
};

test('aantoonbaar beter + alles gehaald → JA', () => {
  assert.equal(decide(base).verdict, 'JA');
});

test('interval omvat 0 → GELIJK', () => {
  assert.equal(decide({ ...base, coverage: { ...base.coverage, lo: -0.01 } }).verdict, 'GELIJK');
});

test('kosten/snelheid: ondergrens −1,5 pp → JA, −2,5 pp → GELIJK', () => {
  const c = { ...base, promotionReason: 'cost_or_speed' as const };
  assert.equal(decide({ ...c, coverage: { ...base.coverage, lo: -0.015 } }).verdict, 'JA');
  assert.equal(decide({ ...c, coverage: { ...base.coverage, lo: -0.025 } }).verdict, 'GELIJK');
});

test('veto per case 4/5 vs 0/5 → NEE; 4/5 vs 1/5 niet', () => {
  assert.equal(decide({ ...base, veto: { ...base.veto, perCase: [{ caseId: 'x', kA: 0, kB: 4, R: 5 }] } }).verdict, 'NEE');
  assert.equal(decide({ ...base, veto: { ...base.veto, perCase: [{ caseId: 'x', kA: 1, kB: 4, R: 5 }] } }).verdict, 'JA');
});

test('nultolerantie, diffuus of niet-slechter geschonden → NEE', () => {
  assert.equal(decide({ ...base, veto: { ...base.veto, zeroTolerance: ['lek'] } }).verdict, 'NEE');
  assert.equal(decide({ ...base, veto: { ...base.veto, diffuseP: 0.01 } }).verdict, 'NEE');
  assert.equal(decide({ ...base, nonInferiority: { ...base.nonInferiority, ttftP90Ratio: 1.2 } }).verdict, 'NEE');
});
