// M-C — gecombineerde pre-pipeline gate die beide V1-chat-callers (askV1 +
// /api/v1/chat) delen. Eén plek, één volgorde, DRY.
//
// Volgorde (eerste failure wint, goedkoopste check eerst):
//   1. per-org rate-limit  — geen DB-call (Upstash/in-memory)
//   2. maand-cap           — head-count op query_log
//   3. dag-budget          — gepagineerde som van query_log.cost_eur vs per-org cap
//
// De rate-limiter (V0's getOrgRateLimiter) heeft z'n eigen in-memory fail-safe;
// budget/maand failen-open op DB-fouten in usage-limits zelf. `message` = klant-
// vriendelijke NL-tekst (widget toont 'm direct; askV1 mapt de code in de UI).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import { checkOrgDailyBudget, checkOrgMonthlyLimit } from './usage-limits';

export type ChatGateResult =
  | { ok: true }
  | {
      ok: false;
      code: 'RATE_LIMITED' | 'BUDGET_EXHAUSTED' | 'MONTHLY_LIMIT';
      retryAfterSec?: number;
      message: string;
    };

export async function checkOrgChatGates(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<ChatGateResult> {
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

  // 3. Dag-budget (EUR-som vs per-org cap).
  const budget = await checkOrgDailyBudget(serviceClient, orgId);
  if (budget.over) {
    return {
      ok: false,
      code: 'BUDGET_EXHAUSTED',
      message: 'Het daglimiet van deze chatbot is bereikt. Probeer het morgen opnieuw.',
    };
  }

  return { ok: true };
}
