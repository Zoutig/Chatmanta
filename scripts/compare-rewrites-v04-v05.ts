// V0.5 ext analyse — vergelijk rewrites tussen v0.4 en v0.5 op identieke
// eval-vragen. Doel: zien of de uitgebreidere v0.5 preProcessSystem (STAP 0
// multi-turn instructie) zelfs zonder history de pre-processor anders laat
// rewriten op single-turn queries.
//
// Run: npx tsx scripts/compare-rewrites-v04-v05.ts

import { createClient } from '@supabase/supabase-js';

async function main() {
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Trek de meest recente eval-rijen voor v0.4 en v0.5 op.
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const { data: v04Rows, error: e1 } = await sb
  .from('query_log')
  .select('question, rewritten, kind, top_similarity, total_ms')
  .eq('bot_version', 'v0.4')
  .gte('created_at', twoHoursAgo)
  .order('created_at', { ascending: false });
if (e1) throw new Error(`v0.4 select: ${e1.message}`);

const { data: v05Rows, error: e2 } = await sb
  .from('query_log')
  .select('question, rewritten, kind, top_similarity, total_ms')
  .eq('bot_version', 'v0.5')
  .gte('created_at', twoHoursAgo)
  .order('created_at', { ascending: false });
if (e2) throw new Error(`v0.5 select: ${e2.message}`);

console.log(`v0.4 rows: ${v04Rows?.length ?? 0}, v0.5 rows: ${v05Rows?.length ?? 0}`);

// Dedup op question — neem laatste rij per vraag (door order DESC + Map).
const v04ByQ = new Map<string, (typeof v04Rows)[number]>();
for (const r of v04Rows ?? []) if (!v04ByQ.has(r.question as string)) v04ByQ.set(r.question as string, r);
const v05ByQ = new Map<string, (typeof v05Rows)[number]>();
for (const r of v05Rows ?? []) if (!v05ByQ.has(r.question as string)) v05ByQ.set(r.question as string, r);

let sameRewrite = 0;
let diffRewrite = 0;
const diffs: Array<{ question: string; v04: string | null; v05: string | null; v04Kind: string; v05Kind: string; v04TopSim: number | null; v05TopSim: number | null }> = [];

for (const [question, v04r] of v04ByQ) {
  const v05r = v05ByQ.get(question);
  if (!v05r) continue;
  const r04 = (v04r.rewritten as string | null)?.trim() ?? null;
  const r05 = (v05r.rewritten as string | null)?.trim() ?? null;
  if (r04 === r05) sameRewrite++;
  else {
    diffRewrite++;
    diffs.push({
      question,
      v04: r04,
      v05: r05,
      v04Kind: v04r.kind as string,
      v05Kind: v05r.kind as string,
      v04TopSim: v04r.top_similarity as number | null,
      v05TopSim: v05r.top_similarity as number | null,
    });
  }
}

console.log(`\nSame rewrite: ${sameRewrite}, Different rewrite: ${diffRewrite}\n`);
console.log('=== Cases waar v0.5 anders rewrite dan v0.4 ===\n');
for (const d of diffs) {
  console.log(`Q: ${d.question}`);
  console.log(`  v0.4 [${d.v04Kind}, top_sim=${d.v04TopSim ?? 'n/a'}]: ${d.v04 ?? '(no rewrite)'}`);
  console.log(`  v0.5 [${d.v05Kind}, top_sim=${d.v05TopSim ?? 'n/a'}]: ${d.v05 ?? '(no rewrite)'}`);
  if (d.v04Kind !== d.v05Kind) console.log(`  ⚠ KIND-VERSCHIL: ${d.v04Kind} → ${d.v05Kind}`);
  if (d.v04TopSim !== null && d.v05TopSim !== null) {
    const delta = d.v05TopSim - d.v04TopSim;
    if (Math.abs(delta) >= 0.05) console.log(`  ⚠ TOP_SIM verschilt ${delta > 0 ? '+' : ''}${delta.toFixed(3)}`);
  }
  console.log('');
}
}
void main();
