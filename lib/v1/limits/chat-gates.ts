// M-C — gecombineerde pre-pipeline gate die beide V1-chat-callers (askV1 +
// /api/v1/chat) delen. Eén plek, één volgorde, DRY.
//
// Volgorde (eerste failure wint):
//   0. operator-suspend    — expliciete opschort-status (organizations.suspended_at)
//   1. per-org rate-limit  — geen DB-call (Upstash/in-memory)
//   2. maand-cap           — head-count op query_log
//   3. dag-budget          — gepagineerde som van query_log.cost_eur vs per-org cap
//
// WP5c: suspend + dag-budget lezen sámen één organizations-rij (suspended_at +
// daily_budget_eur) bovenaan i.p.v. twee losse selects per chat-turn. Voor een verzoek
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
  checkOrgMonthlyLimit,
  getOrgSpendTodayEur,
  resolveDailyBudgetEur,
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
  // Eén org-read voor zowel de suspend-check (0) als het dag-budget (3). Fail-open:
  // niet-gesuspendeerd + null-budget (→ default €1) bij een lees-fout.
  let suspendedAt: string | null = null;
  let dailyBudgetRaw: number | string | null = null;
  try {
    const { data, error } = await serviceClient
      .from('organizations')
      .select('suspended_at, daily_budget_eur')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { suspended_at: string | null; daily_budget_eur: number | string | null } | null;
    suspendedAt = row?.suspended_at ?? null;
    dailyBudgetRaw = row?.daily_budget_eur ?? null;
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

  // 2. Maand-cap (turn-count deze kalendermaand).
  const month = await checkOrgMonthlyLimit(serviceClient, orgId);
  if (month.over) {
    return {
      ok: false,
      code: 'MONTHLY_LIMIT',
      message:
        'De maandelijkse gesprekslimiet van deze chatbot is bereikt. Probeer het volgende maand opnieuw of neem contact op.',
    };
  }

  // 3. Dag-budget (EUR-som vs per-org cap). Cap uit de reeds-gelezen org-rij; de
  //    dag-som blijft een eigen query_log-aggregatie (fail-open → 0 in usage-limits).
  const capEur = resolveDailyBudgetEur(dailyBudgetRaw);
  const spentEur = await getOrgSpendTodayEur(serviceClient, orgId);
  if (isOverBudget(spentEur, capEur)) {
    return {
      ok: false,
      code: 'BUDGET_EXHAUSTED',
      message: 'Het daglimiet van deze chatbot is bereikt. Probeer het morgen opnieuw.',
    };
  }

  return { ok: true };
}
