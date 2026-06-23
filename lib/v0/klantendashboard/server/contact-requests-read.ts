// V0 contactverzoeken — READ-/dashboard-laag (klantendashboard-tab).
//
// Bewust gescheiden van de WRITE-laag (contact-requests-write.ts, M3) zodat de
// publieke submit-route (M3) en het dashboard (M5) parallel-veilig zijn en elk
// alleen importeren wat het nodig heeft. Lazy service-role client (zelfde patroon
// als settings.ts/threads.ts) — service-role bypasst RLS; de org-isolatie zit in
// de VERPLICHTE `organization_id`-filter op ELKE query (caller resolvet de slug →
// org via KNOWN_ORGS, nooit een client-org vertrouwen). `deleted_at IS NULL`
// filtert handmatig soft-deleted rijen uit de dashboard-views.
//
// ⚠️ Bevat ECHTE bezoekers-PII (naam/e-mail/telefoon) — zie migratie 0053 +
// AGENTS.md V0-sandbox-disclaimer. STOP NOOIT echte klantdata in een V0 org.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import type { ContactRequest, ContactRequestStatus, PreferredContact } from '../types';

// Vaste cap op notitie-lengte — spiegelt de DB-CHECK (notes <= 4000) zodat een
// te lange notitie al vóór de write een nette fout geeft i.p.v. een 23514.
const NOTES_MAX = 4000;

// Kolommen die we voor het tab-type nodig hebben (geen visitor_id/consent — die
// zijn intern). snake_case in de DB → camelCase in het type via rowToContactRequest.
const SELECT_COLS =
  'id, thread_id, name, email, phone, preferred_contact, subject, toelichting, status, notes, created_at, updated_at';

// Mapt een DB-row naar het publieke ContactRequest-type.
function rowToContactRequest(r: Record<string, unknown>): ContactRequest {
  return {
    id: r.id as string,
    threadId: (r.thread_id as string | null) ?? null,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    preferredContact: r.preferred_contact as PreferredContact,
    subject: (r.subject as string | null) ?? null,
    toelichting: (r.toelichting as string | null) ?? null,
    status: r.status as ContactRequestStatus,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Alle niet-soft-deleted verzoeken van deze org, recent eerst. */
export async function listContactRequests(orgSlug: OrgSlug): Promise<ContactRequest[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const { data, error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .select(SELECT_COLS)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listContactRequests: ${error.message}`);
  return (data ?? []).map((r) => rowToContactRequest(r as Record<string, unknown>));
}

/** Eén verzoek (org-gescoped + niet-soft-deleted). Null als het niet bestaat of
 *  van een andere org is. */
export async function getContactRequest(
  orgSlug: OrgSlug,
  id: string,
): Promise<ContactRequest | null> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const { data, error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .select(SELECT_COLS)
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`getContactRequest: ${error.message}`);
  return data ? rowToContactRequest(data as Record<string, unknown>) : null;
}

/** Werk de werkstroom-status bij (Nieuw → Opgepakt → Afgehandeld). Org-gescoped:
 *  een verzoek van een andere org wordt door de organization_id-filter niet
 *  geraakt (0 rijen → null). */
export async function updateContactRequestStatus(
  orgSlug: OrgSlug,
  id: string,
  status: ContactRequestStatus,
): Promise<ContactRequest | null> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const { data, error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .update({ status })
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw new Error(`updateContactRequestStatus: ${error.message}`);
  return data ? rowToContactRequest(data as Record<string, unknown>) : null;
}

/** Werk de operator-notitie bij. Lege/whitespace tekst → null (notitie wissen).
 *  Capped op NOTES_MAX (spiegelt de DB-CHECK). Org-gescoped. */
export async function updateContactRequestNotes(
  orgSlug: OrgSlug,
  id: string,
  notes: string | null,
): Promise<ContactRequest | null> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const trimmed = (notes ?? '').trim();
  const next = trimmed.length > 0 ? trimmed.slice(0, NOTES_MAX) : null;
  const { data, error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .update({ notes: next })
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw new Error(`updateContactRequestNotes: ${error.message}`);
  return data ? rowToContactRequest(data as Record<string, unknown>) : null;
}

/** Soft-delete: zet deleted_at. De rij verdwijnt uit de dashboard-views en uit de
 *  partial-UNIQUE (de bezoeker kan daarna opnieuw een verzoek doen). De harde,
 *  onomkeerbare verwijdering gebeurt pas door de 90-daagse retentie-cron. */
export async function softDeleteContactRequest(orgSlug: OrgSlug, id: string): Promise<void> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const { error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(`softDeleteContactRequest: ${error.message}`);
}

/** Aantal verzoeken met status 'nieuw' (niet-soft-deleted) — voedt de sidebar-
 *  badge. Head-count (geen rijen ophalen). Defensief: bij een leesfout 0 zodat de
 *  layout/sidebar nooit breekt op een ontbrekende tabel/migratie. */
export async function countContactRequestsNew(orgSlug: OrgSlug): Promise<number> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const { count, error } = await getServiceRoleClient()
    .from('v0_contact_requests')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'nieuw')
    .is('deleted_at', null);
  if (error) {
    console.warn('[contact-requests] nieuw-count read faalde (migratie 0053 toegepast?):', error.message);
    return 0;
  }
  return count ?? 0;
}
