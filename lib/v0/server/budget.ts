// C3 (v0.10) — per-org dag-budget-cap in USD. De publieke widget doet echte
// (betaalde) OpenAI-calls; zonder rem kan één org of een misbruiker de kosten laten
// ontsporen. Vóór de RAG-pipeline sommeren we query_log.cost_usd voor de org over de
// huidige dag; bij overschrijding van de cap weigeren we de LLM-call (HTTP 402 /
// BUDGET_EXHAUSTED) i.p.v. te genereren.
//
// Twee bewuste correctheids-grenzen (zie spec C3):
//  1. logQuery is best-effort/never-throws en draait post-stream in after(). Faalt die
//     insert, dan landt cost_usd niet en telt de cap die call niet mee. Daarom is dit
//     een BACKSTOP, geen exacte meter — de route logt een cap-hit ook luid (capture).
//  2. Naïef "lees de dag-som" is racy: N gelijktijdige streams lezen dezelfde pre-
//     increment-som en passeren allemaal. We accepteren een kleine overschoot, maar
//     onder aanhoudende load groeit de som en klapt de cap alsnog dicht.
//
// Reken in USD (query_log.cost_usd bestaat al; de EUR-laag hangt aan de niet-gebouwde
// callLLM()).

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/service-role';

// Ruime default zodat legitiem gebruik (incl. interne test-tool) er praktisch nooit
// tegenaan loopt — ~$2/dag ≈ duizenden gpt-4o-mini-vragen. Override via env voor een
// strakkere of ruimere per-deploy-cap.
const DEFAULT_DAILY_BUDGET_USD = 2.0;

/** De geconfigureerde dag-cap (env-override > default). Ongeldige/≤0 env → default. */
export function getDailyBudgetUsd(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.CHATMANTA_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_BUDGET_USD;
}

/** Pure cap-beslissing. `>=` zodat een exact bereikte cap dichtklapt. */
export function isOverBudget(spentUsd: number, capUsd: number): boolean {
  return spentUsd >= capUsd;
}

/** ISO-string van UTC-middernacht van `now` — de ondergrens voor "vandaag". UTC
 *  gekozen voor determinisme (geen tz-afhankelijke dag-grens). */
export function startOfUtcDayIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** Som van query_log.cost_usd voor `organizationId` sinds UTC-middernacht. Fail-open:
 *  bij een lees-/DB-fout → 0 (de cap mag de bot niet platleggen bij een transiente
 *  fout), maar log luid zodat het niet onopgemerkt blijft. */
// PostgREST levert per request maximaal ~1000 rijen (Supabase db-max-rows). Een plat
// .select() + JS-sum zou de dag-som dus afkappen rond 1000 rijen → bij goedkope
// gpt-4o-mini-vragen (~$0,0003) zadelt de som zich ruim ONDER de cap vast en klapt de
// rem nooit dicht — precies de high-volume-abuse die de cap moet stoppen. Daarom
// pagineren we met .range() tot de pagina niet meer vol is. Stabiele volgorde
// (created_at asc) zodat pagina-grenzen kloppen; een rij die tijdens het pagineren
// binnenkomt mag een paar cent over/onder tellen — acceptabel voor een backstop.
const PAGE_SIZE = 1000;
// Veiligheidsplafond tegen een eindeloze loop: 100 pagina's = 100k vragen/dag. Wie daar
// overheen gaat zit hoe dan ook mijlenver over elke cap → de tot-dan-som klapt 'm dicht.
const MAX_PAGES = 100;

export async function getOrgSpendTodayUsd(organizationId: string): Promise<number> {
  try {
    const sinceIso = startOfUtcDayIso(new Date());
    let sum = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await getServiceRoleClient()
        .from('query_log')
        .select('cost_usd')
        .eq('organization_id', organizationId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const r of rows) sum += Number((r as { cost_usd: number | null }).cost_usd) || 0;
      if (rows.length < PAGE_SIZE) break; // laatste (incomplete) pagina
    }
    return sum;
  } catch (err) {
    console.error(
      '[budget] getOrgSpendTodayUsd faalde (fail-open → 0):',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export type BudgetVerdict = { over: boolean; spentUsd: number; capUsd: number };

/** Lees de dag-som + vergelijk met de cap. Combineert getOrgSpendTodayUsd +
 *  getDailyBudgetUsd + isOverBudget tot één route-beslissing. */
export async function checkOrgDailyBudget(organizationId: string): Promise<BudgetVerdict> {
  const capUsd = getDailyBudgetUsd();
  const spentUsd = await getOrgSpendTodayUsd(organizationId);
  return { over: isOverBudget(spentUsd, capUsd), spentUsd, capUsd };
}
