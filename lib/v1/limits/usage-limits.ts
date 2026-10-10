// M-C — per-org usage-limits voor V1. Drie limieten, alle drie per org instelbaar
// in het admin-dashboard (organizations-kolommen):
//  * vragen per dag   (daily_question_limit,   migr 0027) — zichtbaar voor de klant
//  * vragen per maand (monthly_question_limit, migr 0027) — zichtbaar voor de klant
//  * EUR per dag      (daily_budget_eur,       migr 0009) — onzichtbaar kosten-vangnet
// Een "vraag" = één query_log-rij (V1 heeft geen gesprek-entiteit).
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

// Fallbacks als een kolom null/onleesbaar is — spiegelen de migratie-defaults (0027).
export const DEFAULT_DAILY_BUDGET_EUR = 2.0;
export const DEFAULT_DAILY_QUESTION_LIMIT = 250;
export const DEFAULT_MONTHLY_QUESTION_LIMIT = 2000;

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

/** Pure: ruwe kolomwaarde → geldige cap. null/undefined/NaN/negatief → default (€2);
 *  0 blijft 0 (geldige "uit"-waarde die over-budget forceert). LET OP: `Number(null) === 0`,
 *  dus een kale `Number()` zou null naar €0 mappen (= bot offline) — vandaar de expliciete
 *  null-check vóór de coercion (fail-open op een ontbrekende waarde, niet fail-closed). */
export function resolveDailyBudgetEur(raw: unknown): number {
  if (raw == null) return DEFAULT_DAILY_BUDGET_EUR;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_EUR;
}

/** Pure: ruwe kolomwaarde → geldige vragen-limiet (geheel getal). Zelfde fail-open-
 *  regel als resolveDailyBudgetEur: null/NaN/negatief → `fallback`, 0 blijft 0 (= dicht). */
export function resolveQuestionLimit(raw: unknown, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Lees organizations.daily_budget_eur. Fallback → €2/dag bij null/NaN/lees-fout
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
      '[limits] getOrgDailyBudgetEur faalde (fallback → €2):',
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

export type QuestionLimits = { daily: number; monthly: number };

/** Lees de vragen-limieten van een org (één select). Fallback → defaults bij lees-fout
 *  (een hapering mag de bot niet platleggen). */
export async function getOrgQuestionLimits(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<QuestionLimits> {
  try {
    const { data, error } = await serviceClient
      .from('organizations')
      .select('daily_question_limit, monthly_question_limit')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { daily_question_limit: unknown; monthly_question_limit: unknown } | null;
    return {
      daily: resolveQuestionLimit(row?.daily_question_limit, DEFAULT_DAILY_QUESTION_LIMIT),
      monthly: resolveQuestionLimit(row?.monthly_question_limit, DEFAULT_MONTHLY_QUESTION_LIMIT),
    };
  } catch (err) {
    console.error(
      '[limits] getOrgQuestionLimits faalde (fallback → defaults):',
      err instanceof Error ? err.message : err,
    );
    return { daily: DEFAULT_DAILY_QUESTION_LIMIT, monthly: DEFAULT_MONTHLY_QUESTION_LIMIT };
  }
}

/** Head-count van query_log-rijen (= vragen) voor `orgId` vanaf `sinceIso`.
 *  Fail-open → 0 bij lees-/DB-fout. */
async function countQuestionsSince(
  serviceClient: SupabaseClient,
  orgId: string,
  sinceIso: string,
  label: string,
): Promise<number> {
  try {
    const { count, error } = await serviceClient
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', sinceIso);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error(
      `[limits] ${label} faalde (fail-open → 0):`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

/** Aantal vragen van `orgId` sinds UTC-middernacht. */
export function getOrgQuestionsToday(serviceClient: SupabaseClient, orgId: string): Promise<number> {
  return countQuestionsSince(serviceClient, orgId, startOfUtcDayIso(new Date()), 'getOrgQuestionsToday');
}

/** Aantal vragen van `orgId` deze kalendermaand (UTC). */
export function getOrgQuestionsThisMonth(serviceClient: SupabaseClient, orgId: string): Promise<number> {
  return countQuestionsSince(serviceClient, orgId, startOfUtcMonthIso(new Date()), 'getOrgQuestionsThisMonth');
}

export type QuestionVerdict = { over: boolean; count: number; limit: number };

/** Pure: vragen-oordeel. `>=` zodat een exact bereikte limiet dichtklapt (0 = altijd dicht). */
export function questionVerdict(count: number, limit: number): QuestionVerdict {
  return { over: count >= limit, count, limit };
}

/** Dag-oordeel. `limit` meegeven als de caller de org-rij al gelezen heeft. */
export async function checkOrgDailyQuestions(
  serviceClient: SupabaseClient,
  orgId: string,
  limit?: number,
): Promise<QuestionVerdict> {
  const cap = limit ?? (await getOrgQuestionLimits(serviceClient, orgId)).daily;
  return questionVerdict(await getOrgQuestionsToday(serviceClient, orgId), cap);
}

/** Maand-oordeel. `limit` meegeven als de caller de org-rij al gelezen heeft. */
export async function checkOrgMonthlyQuestions(
  serviceClient: SupabaseClient,
  orgId: string,
  limit?: number,
): Promise<QuestionVerdict> {
  const cap = limit ?? (await getOrgQuestionLimits(serviceClient, orgId)).monthly;
  return questionVerdict(await getOrgQuestionsThisMonth(serviceClient, orgId), cap);
}
