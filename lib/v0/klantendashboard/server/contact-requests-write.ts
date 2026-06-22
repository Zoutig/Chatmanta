// V0 contactverzoeken — WRITE-laag (publieke submit-route).
//
// Bewust gescheiden van de read-/dashboard-laag (contact-requests-read.ts, M5)
// zodat M3 (submit) en M5 (dashboard) parallel-veilig zijn en de publieke route
// alleen de insert-helper importeert. Lazy service-role client (zelfde patroon
// als settings.ts/threads.ts) — service-role bypasst RLS; de org-isolatie zit in
// de verplichte `organization_id` die de caller server-side resolvet uit de
// gesigneerde slug-claim (NOOIT client-org vertrouwen).
//
// ⚠️ Bevat ECHTE bezoekers-PII (naam/e-mail/telefoon) — zie migratie 0053 +
// AGENTS.md V0-sandbox-disclaimer. STOP NOOIT echte klantdata in een V0 org.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { ContactRequest, PreferredContact } from '../types';

// ---------------------------------------------------------------------------
// Lazy supabase client (zelfde patroon als settings.ts/threads.ts)
// ---------------------------------------------------------------------------
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

export type InsertContactRequestInput = {
  /** Server-geresolvete org (uit de gesigneerde slug-claim) — NOOIT client-org. */
  organizationId: string;
  /** Best-effort gekoppelde thread; mag permanent NULL zijn (eerste-turn-race). */
  threadId: string | null;
  visitorId: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredContact: PreferredContact;
  subject: string | null;
  toelichting: string | null;
};

export type InsertContactRequestResult =
  | { kind: 'created'; request: ContactRequest }
  | { kind: 'idempotent' };

// Mapt een DB-row naar het publieke ContactRequest-type. snake_case → camelCase.
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
    status: r.status as ContactRequest['status'],
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/**
 * Insert één contactverzoek. `consent_given` is hier hard true (de route weigert
 * een submit zonder consent al vóór deze call; de DB-CHECK is het tweede vangnet).
 * `status` start op 'nieuw'.
 *
 * IDEMPOTENTIE: de partial-UNIQUE (organization_id, visitor_id) WHERE
 * deleted_at IS NULL (migr 0053) staat max 1 ACTIEF verzoek per gesprek toe. Een
 * tweede insert voor dezelfde actieve (org, visitor) faalt op Postgres-code 23505
 * → we vangen dat en geven { kind: 'idempotent' } terug (de route antwoordt 200,
 * geen tweede rij). Een SOFT-DELETED eerdere rij valt buiten de partial index →
 * de insert slaagt dan gewoon en geeft { kind: 'created' } (geen valse 200).
 */
export async function insertContactRequest(
  input: InsertContactRequestInput,
): Promise<InsertContactRequestResult> {
  const { data, error } = await sb()
    .from('v0_contact_requests')
    .insert({
      organization_id: input.organizationId,
      thread_id: input.threadId,
      visitor_id: input.visitorId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      preferred_contact: input.preferredContact,
      subject: input.subject,
      toelichting: input.toelichting,
      consent_given: true,
      status: 'nieuw',
    })
    .select(
      'id, thread_id, name, email, phone, preferred_contact, subject, toelichting, status, notes, created_at, updated_at',
    )
    .single();

  if (error) {
    // 23505 = unique_violation op de partial-UNIQUE (actief verzoek bestaat al) →
    // idempotent succes. Andere fouten (FK-violation, CHECK-violation) bubbelen.
    if ((error as { code?: string }).code === '23505') {
      return { kind: 'idempotent' };
    }
    throw new Error(`insertContactRequest: ${error.message}`);
  }
  if (!data) throw new Error('insertContactRequest: geen rij teruggekregen');

  return { kind: 'created', request: rowToContactRequest(data as Record<string, unknown>) };
}
