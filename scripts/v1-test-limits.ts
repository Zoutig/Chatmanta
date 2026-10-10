// M-C usage-limits DoD-bewijs (NON-billable — geen LLM/embedding-call). Tegen de
// V1-seed-org:
//   (a) zet daily_budget_eur=0 → checkOrgDailyBudget → over:true (forceer-over-budget)
//   (b) zet daily_budget_eur=999999 → checkOrgDailyBudget → over:false (sanity)
//   (c) vragen vandaag / deze maand vs de org-limieten (informatief)
//   (d) reset daily_budget_eur terug naar de oorspronkelijke waarde (finally)
//
// Vereist: migratie 0009 toegepast op V1-prod + V1_SEED_ORG_ID gezet.
// Draai met: npm run v1:test-limits

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import {
  checkOrgDailyBudget,
  checkOrgDailyQuestions,
  checkOrgMonthlyQuestions,
  getOrgDailyBudgetEur,
} from '../lib/v1/limits/usage-limits';

const ORG = process.env.V1_SEED_ORG_ID;
if (!ORG) {
  console.error('✗ V1_SEED_ORG_ID vereist');
  process.exit(1);
}

async function setBudget(svc: ReturnType<typeof getV1ServiceRoleClient>, eur: number) {
  const { error } = await svc.from('organizations').update({ daily_budget_eur: eur }).eq('id', ORG as string);
  if (error) throw new Error(`organizations.daily_budget_eur update faalde: ${error.message}`);
}

async function main() {
  const svc = getV1ServiceRoleClient();
  const original = await getOrgDailyBudgetEur(svc, ORG as string);
  console.log(`ℹ️ oorspronkelijke daily_budget_eur = ${original}`);

  try {
    // (a) cap=0 → altijd over (spent >= 0).
    await setBudget(svc, 0);
    const over = await checkOrgDailyBudget(svc, ORG as string);
    if (!over.over) throw new Error(`(a) cap=0 gaf over:false (spent=${over.spentEur}, cap=${over.capEur})`);
    console.log(`✅ (a) cap=0 → over:true (spentEur=${over.spentEur.toFixed(6)}, capEur=${over.capEur})`);

    // (b) ruime cap → niet over.
    await setBudget(svc, 999999);
    const under = await checkOrgDailyBudget(svc, ORG as string);
    if (under.over) throw new Error(`(b) cap=999999 gaf over:true (spent=${under.spentEur})`);
    console.log(`✅ (b) cap=999999 → over:false (spentEur=${under.spentEur.toFixed(6)})`);

    // (c) vragen-limieten (informatief; query_log-rijen vandaag / deze maand).
    const day = await checkOrgDailyQuestions(svc, ORG as string);
    const month = await checkOrgMonthlyQuestions(svc, ORG as string);
    console.log(`ℹ️ (c) vandaag=${day.count}/${day.limit} (over:${day.over}), maand=${month.count}/${month.limit} (over:${month.over})`);

    console.log('\n✅ M-C limits BEWEZEN: dag-budget-cap sluit op cap=0 en opent op een ruime cap.');
  } finally {
    // (d) reset.
    await setBudget(svc, original);
    console.log(`✓ daily_budget_eur teruggezet op ${original}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ LIMITS-PROEF FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
