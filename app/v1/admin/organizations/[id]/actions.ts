'use server';

// V1 admin — org-deep-dive server actions. Cross-org write via getJorionAdminClient()
// (= service-role NÁ de interne requireJorionAdmin()-gate; Jorion is geen member, dus
// de RLS-session-client zou 0 rijen zien). De org-id komt uit de admin-UI (route-param),
// maar de gate is de Jorion-admin-rol — een admin mag elke org bewerken (geen per-org
// membership-check zoals het klant-pad).

import { revalidatePath } from 'next/cache';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';

/** Redelijk plafond voor een dagbudget — voorkomt een typefout van €100.000.
 *  0 = effectief uit (checkOrgDailyBudget → altijd over-budget). */
const MAX_DAILY_BUDGET_EUR = 1000;

/** Zet organizations.daily_budget_eur (M-C-kolom). ≥0, ≤€1000, afgerond op centen. */
export async function setOrgDailyBudgetAction(
  orgId: string,
  dailyBudgetEur: number,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');
    if (!Number.isFinite(dailyBudgetEur) || dailyBudgetEur < 0 || dailyBudgetEur > MAX_DAILY_BUDGET_EUR) {
      fail('INPUT_INVALID', `Budget moet tussen €0 en €${MAX_DAILY_BUDGET_EUR} liggen.`);
    }
    const value = Math.round(dailyBudgetEur * 100) / 100;
    const { error } = await admin
      .from('organizations')
      .update({ daily_budget_eur: value })
      .eq('id', orgId);
    if (error) throw new Error(`organizations update: ${error.message}`);
    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}
