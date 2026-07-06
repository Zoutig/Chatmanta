// V1 Klantendashboard — CSV-export van contactverzoeken (leads) voor de eigen org.
//
// SA-1/RLS: org uit de sessie (getSessionOrg), read onder de session-client —
// GEEN service-role. Zelfde auth-patroon als de pagina (contactverzoeken/page.tsx):
// getSessionOrg() bewijst membership al (orgId komt uit de eigen membership-rij),
// dus geen aparte requireOrgMember-call nodig voor een read-only export.
//
// Gecapt op EXPORT_CAP rijen (ruim boven wat een testklant ooit zal hebben vóór
// de 90-dagen-verwijdering) via fetchPaginated — anders knipt PostgREST's
// db-max-rows (~1000) de export stil af.

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { STATUS_LABEL, type V1ContactRequestStatus } from '@/lib/v1/dashboard/contact-requests';
import { toCsv, fetchPaginated } from '@/lib/v1/dashboard/csv';

export const dynamic = 'force-dynamic';

const EXPORT_CAP = 5000;

type Row = {
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: 'call' | 'email';
  subject: string | null;
  message: string | null;
  status: V1ContactRequestStatus;
  notes: string | null;
  created_at: string;
};

export async function GET() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return new Response('Geen toegang.', { status: 403 });
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const items = await fetchPaginated<Row>(EXPORT_CAP, (from, to) =>
    supabase
      .from('contact_requests')
      .select('name, email, phone, preferred_contact, subject, message, status, notes, created_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to),
  );

  const rows = [
    ['Naam', 'E-mail', 'Telefoon', 'Voorkeur', 'Onderwerp', 'Bericht', 'Status', 'Notities', 'Aangemaakt op'],
    ...items.map((r) => [
      r.name,
      r.email ?? '',
      r.phone ?? '',
      r.preferred_contact === 'call' ? 'Bellen' : 'E-mail',
      r.subject ?? '',
      r.message ?? '',
      STATUS_LABEL[r.status],
      r.notes ?? '',
      r.created_at,
    ]),
  ];

  return new Response('\uFEFF' + toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contactverzoeken-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
