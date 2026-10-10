// M-C — gecombineerde pre-pipeline gate die beide V1-chat-callers (askV1 +
// /api/v1/chat) delen. Eén plek, één volgorde, DRY.
//
// Volgorde (eerste failure wint):
//   0. operator-suspend    — expliciete opschort-status (organizations.suspended_at)
//   1. per-org rate-limit  — geen DB-call (Upstash/in-memory)
//   2. maand-limiet vragen — head-count op query_log vs organizations.monthly_question_limit
//   3. dag-limiet vragen   — head-count op query_log vs organizations.daily_question_limit
//   4. dag-budget (EUR)    — onzichtbaar kosten-vangnet: som query_log.cost_eur vs cap
// 3 en 4 geven allebei BUDGET_EXHAUSTED ("daglimiet bereikt, probeer morgen"): voor de
// bezoeker en de klant is het één daglimiet; euro's komen nooit in beeld.
//
// WP5c: suspend + limieten lezen sámen één organizations-rij (suspended_at +
// limiet-kolommen) bovenaan i.p.v. twee losse selects per chat-turn. Voor een verzoek
// dat de budget-check bereikt is dit netto GEEN extra query (die read gebeurde daar al,
// nu één kolom erbij + eerder in de flow); voor een verzoek dat op de rate-limit sneuvelt
// kost het één PK-select extra — verwaarloosbaar, en de zwaarste abuse wordt al eerder
// geschud door de per-IP-limiter op de widget-route. Fail-open op een lees-fout: een DB-
// hapering mag de bot niet platleggen (suspend is een ops/billing-concern, geen security-
// grens) → niet-gesuspendeerd + default-budget, net als getOrgDailyBudgetEur's fallback.
//
// De rate-limiter (V0's getOrgRateLimiter) heeft z'n eigen in-memory fail-safe;
// budget/maand failen-open op DB-fouten in usage-limits zelf. `message` = klant-
// vriendelijke NL-tekst (widget toont 'm direct; askV1 mapt de code in de UI).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import {
  DEFAULT_DAILY_QUESTION_LIMIT,
  DEFAULT_MONTHLY_QUESTION_LIMIT,
  checkOrgDailyQuestions,
  checkOrgMonthlyQuestions,
  getOrgSpendTodayEur,
  resolveDailyBudgetEur,
  resolveQuestionLimit,
  isOverBudget,
} from './usage-limits';

export type ChatGateResult =
  | { ok: true }
  | {
      ok: false;
      code: 'ORG_SUSPENDED' | 'RATE_LIMITED' | 'BUDGET_EXHAUSTED' | 'MONTHLY_LIMIT';
      retryAfterSec?: number;
      message: string;
    };

export async function checkOrgChatGates(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<ChatGateResult> {
  // Eén org-read voor de suspend-check (0) en alle limieten (2-4). Fail-open:
  // niet-gesuspendeerd + defaults bij een lees-fout.
  let suspendedAt: string | null = null;
  let dailyBudgetRaw: number | string | null = null;
  let dailyQuestionsRaw: unknown = null;
  let monthlyQuestionsRaw: unknown = null;
  try {
    const { data, error } = await serviceClient
      .from('organizations')
      .select('suspended_at, daily_budget_eur, daily_question_limit, monthly_question_limit')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    const row = data as {
      suspended_at: string | null;
      daily_budget_eur: number | string | null;
      daily_question_limit: unknown;
      monthly_question_limit: unknown;
    } | null;
    suspendedAt = row?.suspended_at ?? null;
    dailyBudgetRaw = row?.daily_budget_eur ?? null;
    dailyQuestionsRaw = row?.daily_question_limit ?? null;
    monthlyQuestionsRaw = row?.monthly_question_limit ?? null;
  } catch (err) {
    console.error(
      '[chat-gates] organizations-read faalde (fail-open → actief, default-budget):',
      err instanceof Error ? err.message : err,
    );
  }

  // 0. Operator-suspend (eerlijke melding — géén misleidend "probeer morgen").
  if (suspendedAt) {
    return {
      ok: false,
      code: 'ORG_SUSPENDED',
      message: 'Deze chatbot is momenteel niet beschikbaar. Neem contact op met de website-eigenaar.',
    };
  }

  // 1. Per-org rate-limit (eigen 'org:'-bucket, los van de crawl-bucket).
  const rl = await getOrgRateLimiter().check(`org:${orgId}`);
  if (!rl.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      retryAfterSec: rl.retryAfterSec,
      message: `Het is nu erg druk. Probeer het over ${rl.retryAfterSec} ${rl.retryAfterSec === 1 ? 'seconde' : 'seconden'} opnieuw.`,
    };
  }

  // 2. Maand-limiet (vragen deze kalendermaand).
  const month = await checkOrgMonthlyQuestions(
    serviceClient,
    orgId,
    resolveQuestionLimit(monthlyQuestionsRaw, DEFAULT_MONTHLY_QUESTION_LIMIT),
  );
  if (month.over) {
    return {
      ok: false,
      code: 'MONTHLY_LIMIT',
      message:
        'De maandlimiet van deze chatbot is bereikt. Probeer het volgende maand opnieuw of neem contact op.',
    };
  }

  const dailyLimitHit = {
    ok: false,
    code: 'BUDGET_EXHAUSTED',
    message: 'De daglimiet van deze chatbot is bereikt. Probeer het morgen opnieuw.',
  } as const;

  // 3. Dag-limiet (vragen sinds UTC-middernacht).
  const day = await checkOrgDailyQuestions(
    serviceClient,
    orgId,
    resolveQuestionLimit(dailyQuestionsRaw, DEFAULT_DAILY_QUESTION_LIMIT),
  );
  if (day.over) return dailyLimitHit;

  // 4. Kosten-vangnet (EUR-som vs per-org cap). Cap uit de reeds-gelezen org-rij; de
  //    dag-som blijft een eigen query_log-aggregatie (fail-open → 0 in usage-limits).
  const capEur = resolveDailyBudgetEur(dailyBudgetRaw);
  const spentEur = await getOrgSpendTodayEur(serviceClient, orgId);
  if (isOverBudget(spentEur, capEur)) return dailyLimitHit;

  return { ok: true };
}
