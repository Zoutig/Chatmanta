// Statistiek voor A/B-besluiten (plan 016 §4). Alles gepaard op vraag-niveau: de vraag is de
// eenheid (cluster), niet het losse feit of de losse run — dat negeren maakte fase B
// "p=0,001" terwijl het geclusterd p≈0,04 was.

/** Deterministische RNG (mulberry32) zodat een rapport reproduceerbaar is bij dezelfde seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Eén vraag: scores per run voor A en voor B (bv. feitdekking 0..1 per run). */
export type PairedCluster = { id: string; stratum: string; a: number[]; b: number[] };

export type BootstrapResult = { delta: number; lo: number; hi: number; n: number; iters: number };

/**
 * Geclusterde bootstrap van Δ = mean(B) − mean(A) per vraag. Resamplet vragen (met
 * teruglegging) binnen elke stratum (org), zodat de org-mix gelijk blijft. Percentiel-
 * interval op niveau `level` (tweezijdig).
 */
export function clusteredBootstrapDelta(
  clusters: PairedCluster[],
  opts: { iters?: number; seed?: number; level?: number } = {},
): BootstrapResult {
  const iters = opts.iters ?? 10_000;
  const level = opts.level ?? 0.95;
  const rand = rng(opts.seed ?? 1);
  if (clusters.length === 0) throw new Error('clusteredBootstrapDelta: geen clusters');
  for (const c of clusters) {
    if (c.a.length === 0 || c.b.length === 0) throw new Error(`cluster ${c.id}: lege a of b`);
  }
  const deltas = clusters.map((c) => ({ stratum: c.stratum, d: mean(c.b) - mean(c.a) }));
  const strata = new Map<string, number[]>();
  for (const x of deltas) strata.set(x.stratum, [...(strata.get(x.stratum) ?? []), x.d]);
  const groups = [...strata.values()];
  const n = deltas.length;

  const stats: number[] = new Array(iters);
  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (const g of groups) for (let k = 0; k < g.length; k++) sum += g[Math.floor(rand() * g.length)];
    stats[i] = sum / n;
  }
  stats.sort((x, y) => x - y);
  const alpha = (1 - level) / 2;
  return { delta: mean(deltas.map((x) => x.d)), lo: quantile(stats, alpha), hi: quantile(stats, 1 - alpha), n, iters };
}

// Standaardnormaal-CDF (Abramowitz-Stegun 7.1.26, |fout| < 1,5e-7).
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Wilcoxon signed-rank op gepaarde verschillen (normale benadering met tie- en
 * continuïteitscorrectie; nullen vallen weg). `alternative: 'greater'` toetst B > A.
 */
export function wilcoxonSignedRank(
  diffs: number[],
  alternative: 'two-sided' | 'greater' | 'less' = 'two-sided',
): { p: number; n: number; w: number } {
  const nz = diffs.filter((d) => d !== 0);
  const n = nz.length;
  if (n === 0) return { p: 1, n: 0, w: 0 };
  const abs = nz.map((d, i) => ({ a: Math.abs(d), s: Math.sign(d), i })).sort((x, y) => x.a - y.a);
  const ranks = new Array<number>(n);
  let tieTerm = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && abs[j + 1].a === abs[i].a) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const t = j - i + 1;
    tieTerm += t * t * t - t;
    i = j + 1;
  }
  let wPlus = 0;
  abs.forEach((x, k) => {
    if (x.s > 0) wPlus += ranks[k];
  });
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieTerm / 48);
  if (sigma === 0) return { p: 1, n, w: wPlus };
  const zOf = (cc: number) => (wPlus - mu + cc) / sigma;
  let p: number;
  if (alternative === 'greater') p = 1 - normalCdf(zOf(-0.5));
  else if (alternative === 'less') p = normalCdf(zOf(0.5));
  else p = Math.min(1, 2 * (1 - normalCdf(Math.max(0, Math.abs(wPlus - mu) - 0.5) / sigma)));
  return { p, n, w: wPlus };
}

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** Exacte binomiale sign-test. wins = B beter, losses = B slechter (gelijk telt niet). */
export function signTest(
  wins: number,
  losses: number,
  alternative: 'two-sided' | 'greater' | 'less' = 'two-sided',
): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const pmf = (k: number) => Math.exp(logChoose(n, k) - n * Math.LN2);
  const upper = (k: number) => {
    let s = 0;
    for (let i = k; i <= n; i++) s += pmf(i);
    return s;
  };
  const lower = (k: number) => {
    let s = 0;
    for (let i = 0; i <= k; i++) s += pmf(i);
    return s;
  };
  if (alternative === 'greater') return Math.min(1, upper(wins));
  if (alternative === 'less') return Math.min(1, lower(wins));
  return Math.min(1, 2 * Math.min(upper(wins), lower(wins)));
}

/**
 * Kleinste gepaarde effect dat met `n` vragen te zien is (normale benadering):
 * MDE = (z_{1-α/2} + z_{power}) · sd(Δ) / √n.
 */
export function mdePaired(sdDelta: number, n: number, opts: { alpha?: number; power?: number } = {}): number {
  const z = (p: number) => {
    // inverse normaal via bisectie — klein en voldoende nauwkeurig voor MDE
    let lo = -10;
    let hi = 10;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (normalCdf(mid) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.8;
  return ((z(1 - alpha / 2) + z(power)) * sdDelta) / Math.sqrt(n);
}

export function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
