'use server';

// V1 admin — org-deep-dive server actions. Cross-org write via getJorionAdminClient()
// (= service-role NÁ de interne requireJorionAdmin()-gate; Jorion is geen member, dus
// de RLS-session-client zou 0 rijen zien). De org-id komt uit de admin-UI (route-param),
// maar de gate is de Jorion-admin-rol — een admin mag elke org bewerken (geen per-org
// membership-check zoals het klant-pad).

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { writeAuditLog } from '@/lib/v1/audit';
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

/**
 * AVG-verwijdering (M-E §3b) — verwijder een organisatie + alle bijbehorende data.
 * Type-to-confirm: `confirmText` moet exact de org-slug zijn (typo-guard tegen het
 * per ongeluk wissen van de verkeerde org). Onomkeerbaar.
 *
 * De org-delete CASCADE't members/chatbots/documents/parent_chunks/document_chunks/
 * query_log/knowledge_sources/processing_jobs/crawl_events/answer_cache (alle FK's
 * zijn `on delete cascade`, migr-v1 0001-0003 — geverifieerd). firecrawl_credit_log
 * en audit_logs hebben `on delete set null` (interne telemetrie/audit blijft bestaan).
 */
export async function deleteOrgDataAction(
  orgId: string,
  confirmText: string,
): Promise<ActionResult> {
  let actorId: string;
  try {
    const actor = await requireJorionAdmin(); // self-gate; actor.id voor de audit
    actorId = actor.id;
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  const admin = getV1ServiceRoleClient(); // service-role NÁ de admin-gate

  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr) throw new Error(`organizations lookup: ${orgErr.message}`);
    if (!org) fail('NOT_FOUND', 'Organisatie niet gevonden.');
    if (confirmText.trim() !== org.slug) {
      fail('INPUT_INVALID', 'Bevestiging komt niet overeen met de org-slug.');
    }

    // 1. member-user-ids vóór de delete (CASCADE wist de rows zo meteen).
    const { data: members, error: memErr } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId);
    if (memErr) throw new Error(`members lookup: ${memErr.message}`);
    const memberUserIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);

    // 2. delete org → CASCADE ruimt alle klantdata-tabellen op.
    const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
    if (delErr) throw new Error(`organizations delete: ${delErr.message}`);

    // 3. best-effort de auth-users verwijderen. Eén-org-per-user (§1.5), maar we
    //    checken expliciet of de user na de cascade nog elders member is
    //    (multi-org-edge → NIET blind deleten). Een gefaalde user-delete mag de
    //    org-delete niet terugdraaien (log warn, ga door).
    const deletedUserIds: string[] = [];
    const skippedMultiOrgUserIds: string[] = [];
    for (const uid of memberUserIds) {
      const { count } = await admin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
      if ((count ?? 0) > 0) {
        skippedMultiOrgUserIds.push(uid); // hoort nog bij een andere org
        continue;
      }
      const { error: userErr } = await admin.auth.admin.deleteUser(uid);
      if (userErr) {
        console.error(`[deleteOrgDataAction] user-delete faalde (genegeerd) ${uid}: ${userErr.message}`);
      } else {
        deletedUserIds.push(uid);
      }
    }

    // 4. audit. organization_id MOET null blijven (de org is weg → een FK-insert
    //    naar organizations zou falen); de orgId staat in target_id (uuid, geen FK).
    await writeAuditLog(admin, {
      userId: actorId,
      action: 'org_deleted',
      targetType: 'organization',
      targetId: orgId,
      metadata: {
        slug: org.slug,
        name: org.name,
        deleted_user_ids: deletedUserIds,
        skipped_multi_org_user_ids: skippedMultiOrgUserIds,
      },
    });

    // 5. lijst verversen; de client navigeert terug naar /v1/admin/organizations.
    revalidatePath('/v1/admin/organizations');
    return {};
  });
}
