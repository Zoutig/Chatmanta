// V0.5 ext analyse — parse eval-out markdown om cases te vinden waar v0.5
// grounding significant zakte vs v0.4. Onderzoeksvraag: zit de dip op
// specifieke case-types?
//
// Run: npx tsx scripts/analyze-v05-grounding-dip.ts

import { readFileSync } from 'node:fs';

const REPORT = 'eval-out/eval-2026-05-12-15-20-22Z.md';
const text = readFileSync(REPORT, 'utf8');

// Split op '### ' headers (case-slugs).
const cases = text.split(/^### /m).slice(1);

type CaseRow = {
  slug: string;
  tags: string;
  v04: { c: number; p: number; g: number; kind: string } | null;
  v05: { c: number; p: number; g: number; kind: string } | null;
};

const rows: CaseRow[] = [];
for (const block of cases) {
  const slugMatch = block.match(/^([^\n]+)/);
  const tagsMatch = block.match(/\*\*Tags:\*\* ([^\n]+)/);
  const slug = slugMatch?.[1].trim() ?? 'unknown';
  const tags = tagsMatch?.[1].trim() ?? '';
  // selective row is the most relevant for v0.4 vs v0.5 comparison
  const v04Match = block.match(/\|\s*v0\.4\s*\|\s*selective\s*\|\s*(-|\d+)\s*\|\s*(-|\d+)\s*\|\s*(-|\d+)\s*\|\s*([a-z]+)/);
  const v05Match = block.match(/\|\s*v0\.5\s*\|\s*selective\s*\|\s*(-|\d+)\s*\|\s*(-|\d+)\s*\|\s*(-|\d+)\s*\|\s*([a-z]+)/);
  const v04 = v04Match
    ? { c: parseScore(v04Match[1]), p: parseScore(v04Match[2]), g: parseScore(v04Match[3]), kind: v04Match[4] }
    : null;
  const v05 = v05Match
    ? { c: parseScore(v05Match[1]), p: parseScore(v05Match[2]), g: parseScore(v05Match[3]), kind: v05Match[4] }
    : null;
  rows.push({ slug, tags, v04, v05 });
}

function parseScore(s: string): number {
  if (s === '-' || s === '—') return NaN;
  return parseInt(s, 10);
}

// Buckets: grounding-delta = v05.g - v04.g
const dips: CaseRow[] = [];
const same: CaseRow[] = [];
const wins: CaseRow[] = [];
for (const r of rows) {
  if (!r.v04 || !r.v05 || Number.isNaN(r.v04.g) || Number.isNaN(r.v05.g)) continue;
  const delta = r.v05.g - r.v04.g;
  if (delta <= -2) dips.push(r);
  else if (delta >= 2) wins.push(r);
  else same.push(r);
}

console.log(`Total cases met v0.4+v0.5 scores: ${dips.length + same.length + wins.length}`);
console.log(`Grounding DIP (v0.5 -2 of meer onder v0.4): ${dips.length}`);
console.log(`Grounding gelijk (binnen ±1): ${same.length}`);
console.log(`Grounding WIN (v0.5 +2 of meer boven v0.4): ${wins.length}\n`);

if (dips.length > 0) {
  console.log('=== Dips: v0.5 grounding minstens 2 punten lager ===\n');
  for (const r of dips.sort((a, b) => (a.v05!.g - a.v04!.g) - (b.v05!.g - b.v04!.g))) {
    console.log(`${r.slug.padEnd(40)} v0.4: G=${r.v04!.g}  v0.5: G=${r.v05!.g}  Δ=${r.v05!.g - r.v04!.g}  [${r.v05!.kind}]  tags: ${r.tags}`);
  }
  console.log('');
}

if (wins.length > 0) {
  console.log('=== Wins: v0.5 grounding minstens 2 punten hoger ===\n');
  for (const r of wins.sort((a, b) => (b.v05!.g - b.v04!.g) - (a.v05!.g - a.v04!.g))) {
    console.log(`${r.slug.padEnd(40)} v0.4: G=${r.v04!.g}  v0.5: G=${r.v05!.g}  Δ=+${r.v05!.g - r.v04!.g}  [${r.v05!.kind}]  tags: ${r.tags}`);
  }
  console.log('');
}

// Aggregeer per tag
console.log('=== Per-tag aggregaat (alleen non-NaN cases) ===\n');
const byTag = new Map<string, { count: number; v04g: number; v05g: number }>();
for (const r of rows) {
  if (!r.v04 || !r.v05 || Number.isNaN(r.v04.g) || Number.isNaN(r.v05.g)) continue;
  const tags = r.tags.split(',').map((t) => t.trim());
  for (const t of tags) {
    const cur = byTag.get(t) ?? { count: 0, v04g: 0, v05g: 0 };
    cur.count += 1;
    cur.v04g += r.v04.g;
    cur.v05g += r.v05.g;
    byTag.set(t, cur);
  }
}
const tagRows = [...byTag.entries()]
  .filter(([, v]) => v.count >= 2)
  .map(([t, v]) => ({
    tag: t,
    n: v.count,
    v04gAvg: v.v04g / v.count,
    v05gAvg: v.v05g / v.count,
    delta: v.v05g / v.count - v.v04g / v.count,
  }))
  .sort((a, b) => a.delta - b.delta);
for (const t of tagRows) {
  const arrow = t.delta < -0.3 ? ' ⚠' : t.delta > 0.3 ? ' ✓' : '';
  console.log(`${t.tag.padEnd(30)} n=${t.n.toString().padStart(2)}  v04g=${t.v04gAvg.toFixed(2)}  v05g=${t.v05gAvg.toFixed(2)}  Δ=${t.delta >= 0 ? '+' : ''}${t.delta.toFixed(2)}${arrow}`);
}
