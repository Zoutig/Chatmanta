// C3 (v0.10) — test voor de per-org dag-budget-cap.
//
// Twee lagen:
//   1. PURE: getDailyBudgetUsd (env-parsing) + isOverBudget (cap-beslissing) +
//      startOfUtcDayIso (dag-grens). Deterministisch, geen DB.
//   2. INTEGRATIE: insert een query_log-rij met bekende cost_usd voor een sandbox-org,
//      verifieer dat getOrgSpendTodayUsd de som meeneemt en de cap-beslissing klopt,
//      en ruim de rij daarna op. Bewijst de echte DB-query + sum tegen het echte schema.
//
// Run: npm run test:budget
import { createClient } from '@supabase/supabase-js';
import {
  getDailyBudgetUsd,
  isOverBudget,
  startOfUtcDayIso,
  getOrgSpendTodayUsd,
} from '../lib/v0/server/budget';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    console.error(`✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

// --- 1. PURE -----------------------------------------------------------------
check('getDailyBudgetUsd: default', getDailyBudgetUsd({}), 2.0);
check('getDailyBudgetUsd: env-override', getDailyBudgetUsd({ CHATMANTA_DAILY_BUDGET_USD: '5' }), 5);
check('getDailyBudgetUsd: ongeldig → default', getDailyBudgetUsd({ CHATMANTA_DAILY_BUDGET_USD: 'abc' }), 2.0);
check('getDailyBudgetUsd: 0 → default', getDailyBudgetUsd({ CHATMANTA_DAILY_BUDGET_USD: '0' }), 2.0);
check('getDailyBudgetUsd: negatief → default', getDailyBudgetUsd({ CHATMANTA_DAILY_BUDGET_USD: '-3' }), 2.0);

check('isOverBudget: onder cap', isOverBudget(0.5, 2.0), false);
check('isOverBudget: exact op cap (dichtklappen)', isOverBudget(2.0, 2.0), true);
check('isOverBudget: boven cap', isOverBudget(2.5, 2.0), true);

check(
  'startOfUtcDayIso: middernacht UTC',
  startOfUtcDayIso(new Date('2026-06-03T14:37:00Z')),
  '2026-06-03T00:00:00.000Z',
);

// --- 2. INTEGRATIE (echte DB) ------------------------------------------------
async function integration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✗ integratie: Supabase env ontbreekt — skip (draai met --env-file=.env.local)');
    failed++;
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const orgId = '00000000-0000-0000-0000-0000000000d0'; // DEV_ORG_ID (sandbox)
  const COST = 0.05;

  const baseline = await getOrgSpendTodayUsd(orgId);
  if (!Number.isFinite(baseline) || baseline < 0) {
    console.error(`✗ integratie: getOrgSpendTodayUsd gaf geen geldig getal (${baseline})`);
    failed++;
    return;
  }
  console.log(`✓ getOrgSpendTodayUsd draait tegen echte DB (baseline vandaag: $${baseline.toFixed(4)})`);

  const { data: ins, error: insErr } = await sb
    .from('query_log')
    .insert({
      organization_id: orgId,
      bot_version: 'v0.10',
      kind: 'answer',
      question: '__budget-cap-test__ (auto-cleanup)',
      answer: 'test',
      cost_usd: COST,
    })
    .select('id')
    .single();
  if (insErr || !ins) {
    console.error('✗ integratie: insert query_log faalde:', insErr?.message);
    failed++;
    return;
  }
  const insertedId = (ins as { id: string }).id;

  try {
    const after = await getOrgSpendTodayUsd(orgId);
    const delta = after - baseline;
    check('getOrgSpendTodayUsd telt de nieuwe cost mee (~+0.05)', Math.abs(delta - COST) < 1e-6, true);
    check('cap onder de besteding → over', isOverBudget(after, after - 0.01), true);
    check('cap boven de besteding → niet over', isOverBudget(after, after + 1), false);
  } finally {
    const { error: delErr } = await sb.from('query_log').delete().eq('id', insertedId);
    if (delErr) {
      console.error(`✗ CLEANUP faalde — verwijder handmatig query_log id=${insertedId}:`, delErr.message);
      failed++;
    } else {
      console.log(`✓ cleanup: test-rij ${insertedId} verwijderd`);
    }
  }
}

integration()
  .then(() => {
    if (failed > 0) {
      console.error(`\n✗ ${failed} budget-test(s) gefaald`);
      process.exit(1);
    }
    console.log('\n✓ alle budget-cap tests PASS');
  })
  .catch((err) => {
    console.error('✗ onverwachte fout:', err);
    process.exit(1);
  });
