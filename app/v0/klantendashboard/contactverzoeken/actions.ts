'use server';

// V0 klantendashboard — server actions voor de Contactverzoeken-tab.
//
// Patroon (zie ../actions.ts): actionTry + actieve org server-side uit de cookie
// (nooit een slug uit de client-payload — voorkomt cross-org tampering, defense-
// in-depth bovenop de gedeelde V0-password-gate). De mutaties draaien via de
// org-gescopete read-module (contact-requests-read.ts); na een write revalideren
// we de tab + de layout (sidebar-badge "Nieuw").

import { revalidatePath } from 'next/cache';

import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import {
  updateContactRequestStatus,
  updateContactRequestNotes,
  softDeleteContactRequest,
} from '@/lib/v0/klantendashboard/server/contact-requests-read';
import type { ContactRequest, ContactRequestStatus } from '@/lib/v0/klantendashboard/types';

const CONTACT_REQUEST_STATUSES: readonly ContactRequestStatus[] = ['nieuw', 'opgepakt', 'afgehandeld'];

function revalidateTab() {
  // 'layout'-kind dekt zowel de tab-pagina (zelf-refresh) als de sidebar-badge
  // ("Nieuw"-count wordt in layout.tsx gefetcht).
  revalidatePath('/klantendashboard', 'layout');
}

/** Werk de werkstroom-status bij (Nieuw → Opgepakt → Afgehandeld). */
export async function setContactRequestStatusAction(
  id: string,
  status: ContactRequestStatus,
): Promise<ActionResult<{ request: ContactRequest }>> {
  return actionTry(async () => {
    if (!CONTACT_REQUEST_STATUSES.includes(status)) {
      fail('INPUT_INVALID', 'Onbekende status.');
    }
    const activeOrg = await getActiveOrgFromCookies();
    const request = await updateContactRequestStatus(activeOrg.slug, id, status);
    if (!request) fail('NOT_FOUND', 'Contactverzoek niet gevonden.');
    revalidateTab();
    return { request };
  });
}

/** Werk de operator-notitie bij (leeg = wissen). */
export async function setContactRequestNotesAction(
  id: string,
  notes: string,
): Promise<ActionResult<{ request: ContactRequest }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const request = await updateContactRequestNotes(activeOrg.slug, id, notes);
    if (!request) fail('NOT_FOUND', 'Contactverzoek niet gevonden.');
    revalidateTab();
    return { request };
  });
}

/** Soft-delete een verzoek. De harde verwijdering volgt via de 90-daagse cron. */
export async function deleteContactRequestAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    await softDeleteContactRequest(activeOrg.slug, id);
    revalidateTab();
    return { id };
  });
}
