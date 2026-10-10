// Voorbeeld-dashboard: acties voor de Contactverzoeken-tab, zonder server.
//
// Zelfde exports en return-vormen als de V1-server-actions. Eigen verzoeken van de
// bezoeker (id begint met "demo-") muteren de demo-store; de vaste voorbeeld-
// verzoeken krijgen een wijziging in het geheugen van deze pagina-sessie.

import type { ActionResult } from '@/lib/errors/action';
import {
  CONTACT_REQUEST_STATUSES,
  NOTES_MAX,
  type V1ContactRequestStatus,
} from '@/lib/v1/dashboard/contact-requests';
import { deleteDemoContactRequest, updateDemoContactRequest } from '@/lib/voorbeeld/demo-store';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';
import { patchFixtureRequest } from './fixture-overrides';

const isOwn = (id: string) => id.startsWith('demo-');

/** Werk de werkstroom-status bij (Nieuw → Opgepakt → Afgehandeld). */
export async function setContactRequestStatusAction(
  id: string,
  status: V1ContactRequestStatus,
): Promise<ActionResult<{ id: string }>> {
  if (!CONTACT_REQUEST_STATUSES.includes(status)) {
    return { ok: false, error: 'Onbekende status.', code: 'INPUT_INVALID' };
  }
  await pretendDelay();
  if (isOwn(id)) updateDemoContactRequest(id, { status });
  else patchFixtureRequest(id, { status });
  return { ok: true, id };
}

/** Werk de notitie bij. Lege/whitespace tekst → null (wissen); capped op NOTES_MAX. */
export async function setContactRequestNotesAction(
  id: string,
  notes: string,
): Promise<ActionResult<{ id: string }>> {
  const trimmed = (notes ?? '').trim();
  const next = trimmed.length > 0 ? trimmed.slice(0, NOTES_MAX) : null;
  await pretendDelay();
  if (isOwn(id)) updateDemoContactRequest(id, { notes: next });
  else patchFixtureRequest(id, { notes: next });
  return { ok: true, id };
}

/** Verwijderen uit de lijst. */
export async function deleteContactRequestAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await pretendDelay();
  if (isOwn(id)) deleteDemoContactRequest(id);
  else patchFixtureRequest(id, { deleted: true });
  return { ok: true, id };
}
