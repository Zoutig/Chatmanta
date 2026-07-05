// V1 admin — usage & kosten helpers.
//
// Port van lib/controlroom/usage-limits.ts voor V1: geen vaste gespreks-
// aantallen (V0-MONTHLY_CONVERSATION_LIMITS), maar EUR-budget-benutting op
// basis van organizations.daily_budget_eur × 30 als maand-proxy.
//
// getKlantenWithBudgets() vult de ControlRoomKlant-lijst aan met het org-
// budget. formatCostEur() + budgetUtilStatus() zijn de render-helpers.

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getOrgSpendTodayEur, isOverBudget } from '@/lib/v1/limits/usage-limits';
import { getControlRoomKlanten, type ControlRoomKlant } from './overview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KlantWithBudget = ControlRoomKlant & {
  dailyBudgetEur: number;
  spentTodayEur: number;
  cappedToday: boolean;
};

export type BudgetTone = 'ink' | 'warn' | 'danger';

export type BudgetUtilStatus = {
  label: string;
  tone: BudgetTone;
  pct: number;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Formatteer een EUR-bedrag. Kleine bedragen (<€1) → 3 decimalen. */
export function formatCostEur(n: number): string {
  return `€${n.toFixed(n < 1 ? 3 : 2)}`;
}

// ---------------------------------------------------------------------------
// Budget-benutting (vervangt usageLimitStatus in V0 op de usage-pagina)
// ---------------------------------------------------------------------------

/**
 * Bepaal de budget-benutting op basis van maandkosten vs. dag-budget × 30.
 * Drempelwaarden: ≥100% = danger, ≥80% = warn, anders = ink.
 */
export function budgetUtilStatus(
  monthCostEur: number,
  dailyBudgetEur: number,
): BudgetUtilStatus {
  // ponytail: dag-budget × 30 als maand-proxy; grofkorrelig maar voldoende
  // voor de huidige testfase. Verfijn naar daadwerkelijk dagbudget per-dag
  // als de per-org usage-API beschikbaar is.
  const monthlyBudget = dailyBudgetEur * 30;
  const pct = monthlyBudget > 0 ? Math.round((monthCostEur / monthlyBudget) * 100) : 0;
  if (pct >= 100) {
    return { label: `Budget bereikt (${pct}%)`, tone: 'danger', pct };
  }
  if (pct >= 80) {
    return { label: `Bijna vol (${pct}%)`, tone: 'warn', pct };
  }
  return { label: `${pct}%`, tone: 'ink', pct };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * Laad alle klanten + hun dag-budget (organizations.daily_budget_eur) in
 * één extra query naast de bestaande getControlRoomKlanten()-fan-out.
 * Beide reads lopen parallel; de auth-gate (requireJorionAdmin) zit intern
 * in getJorionAdminClient() — ook getControlRoomKlanten() roept dat aan.
 */
export async function getKlantenWithBudgets(): Promise<KlantWithBudget[]> {
  const [klanten, admin] = await Promise.all([
    getControlRoomKlanten(),
    getJorionAdminClient(),
  ]);

  if (klanten.length === 0) return [];

  const { data } = await admin
    .from('organizations')
    .select('id, daily_budget_eur')
    .in('id', klanten.map((k) => k.orgId));

  const budgetByOrg = new Map<string, number>();
  for (const r of (data ?? []) as { id: string; daily_budget_eur: number | null }[]) {
    budgetByOrg.set(r.id, Number(r.daily_budget_eur) || 1.0);
  }

  // ponytail: per-org som-query (N+1) — huidige klantenaantal (<10) acceptabel.
  // Cap op 30 zodat dit niet ontspoort als de klantenlijst groeit; verfijn dan
  // naar een gebundelde query.
  const withSpend = klanten.slice(0, 30);
  const spentTodayEur = await Promise.all(
    withSpend.map((k) => getOrgSpendTodayEur(admin, k.orgId)),
  );
  const spentByOrg = new Map(withSpend.map((k, i) => [k.orgId, spentTodayEur[i]]));

  return klanten.map((k) => {
    const dailyBudgetEur = budgetByOrg.get(k.orgId) ?? 1.0;
    const spentToday = spentByOrg.get(k.orgId) ?? 0;
    return {
      ...k,
      dailyBudgetEur,
      spentTodayEur: spentToday,
      cappedToday: isOverBudget(spentToday, dailyBudgetEur),
    };
  });
}
