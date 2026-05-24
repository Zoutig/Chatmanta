#!/usr/bin/env node
// Command Center "schone lei": wis open taken + alle milestones.
//
// Verwijdert ALLE cc_milestones en alle cc_tasks met status <> 'Klaar'. Voltooide
// ('Klaar') taken blijven staan als archief (o.a. de gh-pr-* backfill-taken en de
// /commandcenter/completed-weergave). Bedoeld als eenmalige reset zodat je met een
// schone lei zelf taken + milestones opnieuw kunt invoeren.
//
// Veiligheid: dry-run is de DEFAULT. Zonder --confirm wordt NIETS verwijderd; het
// script telt alleen wat het zou wissen. De verwijdering is onomkeerbaar.
//
// Let op: auto-seed is sinds deze feature opt-in (CC_ENABLE_SEED=true). Zolang die
// env-var niet gezet is komt de demo-data NIET terug na het wissen.
//
// Usage:
//   node scripts/cc/clean-slate.mjs              (dry-run, wist niets)
//   node scripts/cc/clean-slate.mjs --confirm    (voert de verwijdering uit)

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CONFIRM = process.argv.includes('--confirm');

// ---------------------------------------------------------------------------
// .env.local loader (geen dotenv-dependency — zelfde patroon als backfill-prs.mjs)
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Matcht ELKE rij (delete vereist een filter; dit is de "alles"-filter).
const ALL = ['id', 'is', null];

async function countTasks(filter) {
  let q = sb.from('cc_tasks').select('id', { count: 'exact', head: true });
  if (filter === 'open') q = q.neq('status', 'Klaar');
  else if (filter === 'klaar') q = q.eq('status', 'Klaar');
  const { count, error } = await q;
  if (error) throw new Error(`count cc_tasks (${filter}) failed: ${error.message}`);
  return count ?? 0;
}

async function countMilestones() {
  const { count, error } = await sb
    .from('cc_milestones')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`count cc_milestones failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  // Toon het doel-project (alleen de host, geen key) zodat je kunt verifiëren dat
  // dit de juiste database is vóór je --confirm draait.
  const host = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return SUPABASE_URL;
    }
  })();
  console.log(`mode:     ${CONFIRM ? 'CONFIRM (verwijdert!)' : 'DRY-RUN (wist niets)'}`);
  console.log(`database: ${host}`);
  console.log('---');

  const openTasks = await countTasks('open');
  const klaarTasks = await countTasks('klaar');
  const milestones = await countMilestones();

  console.log(`open taken (status <> 'Klaar')  → te wissen: ${openTasks}`);
  console.log(`milestones (alle)               → te wissen: ${milestones}`);
  console.log(`voltooide taken ('Klaar')       → BLIJFT:    ${klaarTasks}`);
  console.log('---');

  if (!CONFIRM) {
    console.log('DRY-RUN: er is niets verwijderd. Draai met --confirm om door te zetten.');
    return;
  }

  const { count: delTasks, error: tErr } = await sb
    .from('cc_tasks')
    .delete({ count: 'exact' })
    .neq('status', 'Klaar');
  if (tErr) throw new Error(`delete open tasks failed: ${tErr.message}`);

  const { count: delMs, error: mErr } = await sb
    .from('cc_milestones')
    .delete({ count: 'exact' })
    .not(...ALL);
  if (mErr) throw new Error(`delete milestones failed: ${mErr.message}`);

  // Eindtelling ter bevestiging.
  const remainingOpen = await countTasks('open');
  const remainingMs = await countMilestones();
  const remainingKlaar = await countTasks('klaar');

  console.log(`verwijderd: ${delTasks ?? 0} open taken, ${delMs ?? 0} milestones`);
  console.log(
    `na afloop:  open=${remainingOpen}, milestones=${remainingMs}, klaar(behouden)=${remainingKlaar}`,
  );
  if (remainingOpen !== 0 || remainingMs !== 0) {
    console.error('WAARSCHUWING: er staan nog open taken of milestones — verwijdering onvolledig.');
    process.exit(1);
  }
  console.log('Schone lei gereed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
