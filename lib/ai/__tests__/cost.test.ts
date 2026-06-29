import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costUsdToEur } from '../llm';

// Money-path self-check (ponytail): costUsdToEur voedt query_log.cost_eur en
// daarmee de per-org budget-cap (M-C). Env-onafhankelijk (geen exacte FX-assert).
test('costUsdToEur — guards + rounding + lineariteit', () => {
  // guards: niet-zinnige input → 0 (geen NaN/negatief in de kolom)
  assert.equal(costUsdToEur(0), 0);
  assert.equal(costUsdToEur(-5), 0);
  assert.equal(costUsdToEur(Number.NaN), 0);
  // positief bedrag → positieve EUR
  assert.ok(costUsdToEur(1) > 0);
  // afronding op 6 decimalen (matcht numeric(10,6)): sub-µ bedrag → 0
  assert.equal(costUsdToEur(0.0000001), 0);
  // ~lineair in het bedrag (rounding-tolerant) — onafhankelijk van USD_EUR_RATE
  assert.ok(Math.abs(costUsdToEur(1000) - costUsdToEur(1) * 1000) < 1e-2);
});
