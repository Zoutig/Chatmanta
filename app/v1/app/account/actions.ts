'use server';

// V1 Account — organisatienaam wijzigen (owner-only, service-role-write).
//
// E-mail/wachtwoord lopen via Supabase Auth in de client (account-form.tsx) — geen
// server-action nodig. De org-naam wél: er is bewust GEEN UPDATE-policy op
// organizations (RLS kan per-kolom niet weigeren → een member zou ook slug/deleted_at
// kunnen raken). Dus: SA-1-gate (org uit de sessie + requireOrgMember) + owner-role-
// check + service-role-write op alléén de `name`-kolom van de eigen org.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';

const ACCOUNT_PATH = '/v1/app/account';
const ORG_NAME_MAX = 120;

function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function updateOrgNameAction(name: string): Promise<ActionResult<{ name: string }>> {
  let orgId: string;
  let userId: string;
  try {
    const session = await getSessionOrg();
    orgId = session.orgId;
    userId = session.user.id;
    await requireOrgMember(orgId); // SA-1
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const trimmed = name.trim();
    if (!trimmed) fail('INPUT_INVALID', 'Organisatienaam mag niet leeg zijn.');
    if (trimmed.length > ORG_NAME_MAX) fail('INPUT_INVALID', `Organisatienaam is te lang (max ${ORG_NAME_MAX} tekens).`);

    // Owner-gate: alléén de eigenaar mag de org-naam wijzigen. Rol uit de eigen
    // membership-rij (session-client → RLS: organization_members_select_own).
    const sb = await createClient();
    const { data: membership, error: roleErr } = await sb
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (roleErr) throw new Error(`rol-lookup faalde: ${roleErr.message}`);
    if (membership?.role !== 'owner') {
      fail('AUTH_FORBIDDEN', 'Alleen de eigenaar mag de organisatienaam wijzigen.');
    }

    // Service-role-write op alléén `name` van de eigen org (geen UPDATE-policy →
    // niet via de session-client). .eq(id) houdt het object-level gescoped.
    const { error } = await getV1ServiceRoleClient()
      .from('organizations')
      .update({ name: trimmed })
      .eq('id', orgId);
    if (error) throw new Error(`organisatienaam opslaan faalde: ${error.message}`);

    revalidatePath(ACCOUNT_PATH);
    return { name: trimmed };
  });
}
