import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusteredBootstrapDelta, mdePaired, signTest, wilcoxonSignedRank } from '../stats';

test('bootstrap: constante Δ geeft een smal interval op Δ', () => {
  const cl = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, stratum: i < 5 ? 'x' : 'y', a: [0.5, 0.5], b: [0.6, 0.6] }));
  const r = clusteredBootstrapDelta(cl, { iters: 500 });
  assert.ok(Math.abs(r.delta - 0.1) < 1e-9);
  assert.ok(Math.abs(r.lo - 0.1) < 1e-9 && Math.abs(r.hi - 0.1) < 1e-9);
});

test('bootstrap: reproduceerbaar per seed, interval omvat Δ, ruis rond 0 omvat 0', () => {
  const cl = Array.from({ length: 60 }, (_, i) => ({ id: `q${i}`, stratum: `o${i % 3}`, a: [0.5], b: [i % 2 ? 0.7 : 0.3] }));
  const r1 = clusteredBootstrapDelta(cl, { iters: 2000, seed: 7 });
  const r2 = clusteredBootstrapDelta(cl, { iters: 2000, seed: 7 });
  assert.deepEqual(r1, r2);
  assert.ok(r1.lo <= r1.delta && r1.delta <= r1.hi);
  assert.ok(r1.lo < 0 && r1.hi > 0);
});

test('bootstrap: lege run gooit (fail-closed)', () => {
  assert.throws(() => clusteredBootstrapDelta([{ id: 'q', stratum: 's', a: [], b: [1] }]));
});

test('wilcoxon: [1..5] tweezijdig ≈ 0,059 (normale benadering)', () => {
  const r = wilcoxonSignedRank([1, 2, 3, 4, 5]);
  assert.equal(r.w, 15);
  assert.ok(r.p > 0.05 && r.p < 0.07, `p=${r.p}`);
  assert.ok(wilcoxonSignedRank([1, 2, 3, 4, 5], 'greater').p < 0.05);
  assert.equal(wilcoxonSignedRank([0, 0]).p, 1);
});

test('sign-test exact: 9 tegen 1 tweezijdig = 22/1024', () => {
  assert.ok(Math.abs(signTest(9, 1) - 22 / 1024) < 1e-12);
  assert.ok(Math.abs(signTest(9, 1, 'greater') - 11 / 1024) < 1e-12);
  assert.equal(signTest(0, 0), 1);
});

test('MDE: sd 0,22, n 300 ≈ 3,6 pp (plan 016 §4)', () => {
  const m = mdePaired(0.22, 300);
  assert.ok(m > 0.034 && m < 0.038, `mde=${m}`);
});
