'use server';

// V1 klantendashboard — server-actions voor de Contactverzoeken-tab.
//
// SA-1-patroon (zie ../instellingen/actions.ts): org uit de getrouwde sessie
// (getSessionOrg), NOOIT uit de client-payload, + expliciete requireOrgMember(orgId)
// vóór de service-role-write. De write scoopt .eq(organization_id).eq(id) zodat
// alléén het eigen verzoek wordt geraakt (RLS-bypass → object-level guard). PII —
// alleen org-leden komen hier voorbij de gate.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  CONTACT_REQUEST_STATUSES,
  NOTES_MAX,
  type V1ContactRequestStatus,
} from '@/lib/v1/dashboard/contact-requests';

const PATH = '/v1/app/contactverzoeken';

/** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

/** getSessionOrg + requireOrgMember (SA-1) — gedeeld door alle drie de acties. */
async function gateOrg(): Promise<string> {
  const { orgId } = await getSessionOrg();
  await requireOrgMember(orgId);
  return orgId;
}

/** Werk de werkstroom-status bij (Nieuw → Opgepakt → Afgehandeld). */
export async function setContactRequestStatusAction(
  id: string,
  status: V1ContactRequestStatus,
): Promise<ActionResult<{ id: string }>> {
  let orgId: string;
  try {
    orgId = await gateOrg();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    if (!CONTACT_REQUEST_STATUSES.includes(status)) fail('INPUT_INVALID', 'Onbekende status.');
    const svc = getV1ServiceRoleClient();
    const { data, error } = await svc
      .from('contact_requests')
      .update({ status })
      .eq('organization_id', orgId)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`status bijwerken faalde: ${error.message}`);
    if (!data) fail('NOT_FOUND', 'Contactverzoek niet gevonden.');
    revalidatePath(PATH);
    return { id };
  });
}

/** Werk de operator-notitie bij. Lege/whitespace tekst → null (wissen); capped op NOTES_MAX. */
export async function setContactRequestNotesAction(
  id: string,
  notes: string,
): Promise<ActionResult<{ id: string }>> {
  let orgId: string;
  try {
    orgId = await gateOrg();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const trimmed = (notes ?? '').trim();
    const next = trimmed.length > 0 ? trimmed.slice(0, NOTES_MAX) : null;
    const svc = getV1ServiceRoleClient();
    const { data, error } = await svc
      .from('contact_requests')
      .update({ notes: next })
      .eq('organization_id', orgId)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`notitie bijwerken faalde: ${error.message}`);
    if (!data) fail('NOT_FOUND', 'Contactverzoek niet gevonden.');
    revalidatePath(PATH);
    return { id };
  });
}

/** Soft-delete: zet deleted_at. De harde verwijdering volgt via de 90-daagse cron. */
export async function deleteContactRequestAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  let orgId: string;
  try {
    orgId = await gateOrg();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const svc = getV1ServiceRoleClient();
    const { error } = await svc
      .from('contact_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw new Error(`verwijderen faalde: ${error.message}`);
    revalidatePath(PATH);
    return { id };
  });
}
