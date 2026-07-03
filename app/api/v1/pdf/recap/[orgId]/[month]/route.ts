// V1 Maandelijkse Recap — PDF-export (GET).
//
// Port van app/api/v0/pdf/recap/[orgSlug]/[month]/route.ts.
// Aanpassingen t.o.v. V0:
//  - Auth: requireJorionAdmin() (V1 Supabase Auth) i.p.v. V0 demo-cookie.
//  - Route-param: [orgId] (UUID) i.p.v. [orgSlug]; org-naam uit DB.
//  - Recap-data via getV1RecapDetail() (lib/v1/admin/recap).

import type { NextRequest } from 'next/server';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { parsePeriodMonth } from '@/lib/controlroom/recap-logic';
import { getV1RecapDetail } from '@/lib/v1/admin/recap';
import { renderRecapPdf } from './recap-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Bestandsnaam-veilige bedrijfsnaam (alfanumeriek + spaties → underscore). */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Klant';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; month: string }> },
) {
  // Auth: V1 Jorion-admin vereist (AAL2-check ingebakken in requireJorionAdmin).
  try {
    await requireJorionAdmin();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const { orgId, month } = await params;

  const parsed = parsePeriodMonth(month);
  if (!parsed) return new Response('Ongeldige maand (verwacht YYYY-MM)', { status: 400 });

  try {
    const admin = await getJorionAdminClient();

    // Valideer orgId + haal naam op.
    const { data: orgRow } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!orgRow) return new Response('Org niet gevonden', { status: 404 });
    const orgName = String(orgRow.name);

    const detail = await getV1RecapDetail(admin, orgId, orgName, parsed.year, parsed.month);
    const pdf = await renderRecapPdf(detail);
    const filename = `ChatManta_Recap_${sanitizeName(orgName)}_${month}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[v1/recap-pdf] render error:', err instanceof Error ? err.message : err);
    return new Response('PDF kon niet worden gegenereerd', { status: 500 });
  }
}
