// Quick progress check voor de v0.6.3 eval-run.
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v063-eval-progress.ts

import { createClient } from '@supabase/supabase-js';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const sinceISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function main() {
  const { data, error } = await sb
    .from('eval_runs')
    .select('id, bot_version, run_index, created_at')
    .eq('organization_id', DEV_ORG_ID)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`Total eval_runs in laatste uur: ${rows.length}`);
  console.log(`Verwacht totaal: 69 cases × 4 versies × 2 runs = 552`);
  console.log(`Voortgang: ${((rows.length / 552) * 100).toFixed(1)}%\n`);

  // Per versie
  const byVer = new Map<string, number>();
  for (const r of rows) byVer.set(r.bot_version, (byVer.get(r.bot_version) ?? 0) + 1);
  for (const [v, n] of [...byVer.entries()].sort()) {
    console.log(`  ${v}: ${n} / 138 (= 69 × 2 runs)`);
  }

  // Tijd-indicatie
  if (rows.length > 1) {
    const oldest = new Date(rows[rows.length - 1].created_at).getTime();
    const newest = new Date(rows[0].created_at).getTime();
    const elapsedMs = newest - oldest;
    const ratePerMin = (rows.length / (elapsedMs / 60000));
    const remaining = 552 - rows.length;
    const etaMin = remaining / ratePerMin;
    console.log(`\nElapsed (oldest→newest run): ${(elapsedMs / 60000).toFixed(1)} min`);
    console.log(`Rate: ${ratePerMin.toFixed(1)} runs/min`);
    console.log(`ETA tot voltooiing: ~${etaMin.toFixed(1)} min`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
