// M-C — per-org usage-limits voor V1. Port van lib/v0/server/budget.ts naar EUR +
// een per-org kolom (organizations.daily_budget_eur, migr 0009) + een maand-cap op
// het aantal query_log-rijen.
//
// Bewuste correctheids-grenzen (zie ook V0 budget.ts):
//  * BACKSTOP, geen exacte meter: logRagQuery is best-effort/never-throws en draait
//    post-stream in after(). Faalt die insert, dan landt cost_eur/de rij niet en telt
//    de cap die call niet mee.
//  * Naïef "lees de dag-som" is racy onder gelijktijdige streams — kleine overschoot
//    geaccepteerd; onder aanhoudende load klapt de som de cap alsnog dicht.
//
// Client-geïnjecteerd: neemt een V1-service-role `SupabaseClient` mee (betrouwbaar,
// org-expliciet gefilterd — geen client-input). Daarom GEEN service-role-factory-import
// hier en GEEN `import 'server-only'`: de pure helpers blijven zo unit-testbaar (zelfde
// patroon als lib/rag/chunker.ts). De DB-helpers worden in de praktijk alleen
// server-side aangeroepen (chat-gates + smoke-script).

import type { SupabaseClient } from '@supabase/supabase-js';

// Fallback-cap als de kolom null/onleesbaar is — spiegelt de migratie-default (€1/dag).
const DEFAULT_DAILY_BUDGET_EUR = 1.0;

// V1 heeft GEEN conversatie/thread-entiteit → we tellen query_log-rijen (= turns) per
// org per kalendermaand. Dit is dus effectief een maandelijkse turn/message-cap, niet
// distinct-conversations. Constant makkelijk te verhogen (admin-editor = later).
export const MONTHLY_CONVERSATION_LIMIT = 300;

// PostgREST levert per request max ~1000 rijen (db-max-rows). Een plat .select()+JS-sum
// zou de dag-som rond 1000 rijen afkappen → bij goedkope vragen blijft de som ver onder
// de cap en klapt de rem nooit dicht. Daarom pagineren we (created_at asc, stabiele
// volgorde). Plafond 100 pagina's = 100k rijen/dag → wie daaroverheen gaat zit hoe dan
// ook mijlenver over elke cap.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

/** ISO-string van UTC-middernacht van `now` — ondergrens voor "vandaag". UTC voor
 *  determinisme (geen tz-afhankelijke dag-grens). Pure → testbaar. */
export function startOfUtcDayIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** ISO-string van de 1e van de maand 00:00 UTC van `now`. Pure → testbaar. */
export function startOfUtcMonthIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Pure cap-beslissing. `>=` zodat een exact bereikte cap dichtklapt. */
export function isOverBudget(spentEur: number, capEur: number): boolean {
  return spentEur >= capEur;
}

/** Pure: ruwe kolomwaarde → geldige cap. null/undefined/NaN/negatief → default (€1);
 *  0 blijft 0 (geldige "uit"-waarde die over-budget forceert). LET OP: `Number(null) === 0`,
 *  dus een kale `Number()` zou null naar €0 mappen (= bot offline) — vandaar de expliciete
 *  null-check vóór de coercion (fail-open op een ontbrekende waarde, niet fail-closed). */
export function resolveDailyBudgetEur(raw: unknown): number {
  if (raw == null) return DEFAULT_DAILY_BUDGET_EUR;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_EUR;
}

/** Lees organizations.daily_budget_eur. Fallback → €1/dag bij null/NaN/lees-fout
 *  (een hapering mag de bot niet platleggen). */
export async function getOrgDailyBudgetEur(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    const { data, error } = await serviceClient
      .from('organizations')
      .select('daily_budget_eur')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    const val = (data as { daily_budget_eur: number | string | null } | null)?.daily_budget_eur;
    return resolveDailyBudgetEur(val);
  } catch (err) {
    console.error(
      '[limits] getOrgDailyBudgetEur faalde (fallback → €1):',
      err instanceof Error ? err.message : err,
    );
    return DEFAULT_DAILY_BUDGET_EUR;
  }
}

/** Gepagineerde som van query_log.cost_eur voor `orgId` vanaf `sinceIso`. Gooit door
 *  bij DB-fout — de publieke wrappers vangen + fail-open → 0. Pagineer-patroon: zie de
 *  PAGE_SIZE/MAX_PAGES-noot hierboven (PostgREST capt ~1000 rijen/request). */
async function sumQueryLogCostEurSince(
  serviceClient: SupabaseClient,
  orgId: string,
  sinceIso: string,
): Promise<number> {
  let sum = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await serviceClient
      .from('query_log')
      .select('cost_eur')
      .eq('organization_id', orgId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) sum += Number((r as { cost_eur: number | null }).cost_eur) || 0;
    if (rows.length < PAGE_SIZE) break; // laatste (incomplete) pagina
  }
  return sum;
}

/** Gepagineerde som van query_log.cost_eur voor `orgId` sinds UTC-middernacht.
 *  Fail-open → 0 bij lees-/DB-fout (cap mag de bot niet platleggen), maar log luid. */
export async function getOrgSpendTodayEur(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    return await sumQueryLogCostEurSince(serviceClient, orgId, startOfUtcDayIso(new Date()));
  } catch (err) {
    console.error(
      '[limits] getOrgSpendTodayEur faalde (fail-open → 0):',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

/** Gepagineerde som van query_log.cost_eur voor `orgId` deze kalendermaand (admin-
 *  deep-dive). Spiegelt getOrgSpendTodayEur met de maand-grens. Fail-open → 0. */
export async function getOrgSpendThisMonthEur(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    return await sumQueryLogCostEurSince(serviceClient, orgId, startOfUtcMonthIso(new Date()));
  } catch (err) {
    console.error(
      '[limits] getOrgSpendThisMonthEur faalde (fail-open → 0):',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export type BudgetVerdict = { over: boolean; spentEur: number; capEur: number };

/** Lees dag-som + per-org cap en vel het oordeel. */
export async function checkOrgDailyBudget(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<BudgetVerdict> {
  const capEur = await getOrgDailyBudgetEur(serviceClient, orgId);
  const spentEur = await getOrgSpendTodayEur(serviceClient, orgId);
  return { over: isOverBudget(spentEur, capEur), spentEur, capEur };
}

/** Head-count van query_log-rijen (= turns) voor `orgId` deze kalendermaand.
 *  Fail-open → 0 bij lees-/DB-fout. */
export async function getOrgConversationsThisMonth(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    const sinceIso = startOfUtcMonthIso(new Date());
    const { count, error } = await serviceClient
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', sinceIso);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error(
      '[limits] getOrgConversationsThisMonth faalde (fail-open → 0):',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export type MonthlyVerdict = { over: boolean; count: number; limit: number };

/** Maand-cap-oordeel: `over` zodra de turn-count de limiet bereikt. */
export async function checkOrgMonthlyLimit(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MonthlyVerdict> {
  const count = await getOrgConversationsThisMonth(serviceClient, orgId);
  return { over: count >= MONTHLY_CONVERSATION_LIMIT, count, limit: MONTHLY_CONVERSATION_LIMIT };
}
