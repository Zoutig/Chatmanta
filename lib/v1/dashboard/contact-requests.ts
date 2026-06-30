// V1 klantendashboard — Contactverzoeken read-laag + status-helpers.
//
// Read onder de caller-geleverde client: de pagina geeft de session-client mee
// (RLS, org-leden-SELECT). De .eq('organization_id') is defense-in-depth bovenop
// die policy. WRITES staan bewust niet hier — die lopen via de server-action met
// requireOrgMember + service-role (app/v1/app/contactverzoeken/actions.ts, SA-1).
//
// Géén 'server-only': de pure status-maps + het type worden óók door de
// client-card geïmporteerd (tree-shake laat listContactRequests dan vallen).
//
// ⚠️ contact_requests bevat ECHTE bezoekers-PII (naam/e-mail/telefoon) — alleen
// org-leden mogen het zien; RLS borgt dat, de org-filter is de tweede laag.

import type { SupabaseClient } from '@supabase/supabase-js';

export type PreferredContact = 'call' | 'email';
export type V1ContactRequestStatus = 'new' | 'picked_up' | 'handled';

export type V1ContactRequest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredContact: PreferredContact;
  subject: string | null;
  message: string | null;
  status: V1ContactRequestStatus;
  notes: string | null;
  createdAt: string;
};

// Werkstroom-volgorde Nieuw → Opgepakt → Afgehandeld (DB-enum-waarden).
export const STATUS_FLOW: readonly V1ContactRequestStatus[] = ['new', 'picked_up', 'handled'];
export const CONTACT_REQUEST_STATUSES: readonly V1ContactRequestStatus[] = STATUS_FLOW;

export const STATUS_LABEL: Record<V1ContactRequestStatus, string> = {
  new: 'Nieuw',
  picked_up: 'Opgepakt',
  handled: 'Afgehandeld',
};

// data-tone-waarden van .klant-status (zie StatusBadge / klant.css).
export const STATUS_TONE: Record<V1ContactRequestStatus, 'warning' | 'info' | 'success'> = {
  new: 'warning',
  picked_up: 'info',
  handled: 'success',
};

// Spiegelt de DB-CHECK (notes <= 4000) zodat een te lange notitie al vóór de write faalt.
export const NOTES_MAX = 4000;

const SELECT_COLS =
  'id, name, email, phone, preferred_contact, subject, message, status, notes, created_at';

function rowToContactRequest(r: Record<string, unknown>): V1ContactRequest {
  return {
    id: r.id as string,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    preferredContact: r.preferred_contact as PreferredContact,
    subject: (r.subject as string | null) ?? null,
    message: (r.message as string | null) ?? null,
    status: r.status as V1ContactRequestStatus,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Alle niet-soft-deleted verzoeken van deze org, recent eerst. Read onder de
 *  meegegeven session-client (RLS); de org-filter is defense-in-depth. */
export async function listContactRequests(
  client: SupabaseClient,
  orgId: string,
): Promise<V1ContactRequest[]> {
  const { data, error } = await client
    .from('contact_requests')
    .select(SELECT_COLS)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listContactRequests: ${error.message}`);
  return (data ?? []).map((r) => rowToContactRequest(r as Record<string, unknown>));
}
