// Maandelijkse Recap — PDF-export (GET). Browsers navigeren rechtstreeks naar
// deze URL → download zonder JS. runtime='nodejs' want @react-pdf/renderer
// (fontkit/pdfkit) draait niet op de Edge-runtime.
//
// Auth: deze route valt ONDER de proxy-gate (niet in de publieke-exempt-lijst),
// maar we hercontroleren de demo-cookie hier server-side (defense-in-depth), en
// valideren orgSlug tegen KNOWN_ORGS (org-isolatie; geen vreemde org-id).

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { parsePeriodMonth } from '@/lib/controlroom/recap-logic';
import { getRecapDetail } from '@/lib/controlroom/server/recap';
import { renderRecapPdf } from './recap-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Bestandsnaam-veilige bedrijfsnaam (alfanumeriek). */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '') || 'Klant';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; month: string }> },
) {
  const jar = await cookies();
  if (!verifyAuthCookieValue(jar.get(AUTH_COOKIE.name)?.value)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { orgSlug, month } = await params;
  if (!(orgSlug in KNOWN_ORGS)) return new Response('Niet gevonden', { status: 404 });
  const parsed = parsePeriodMonth(month);
  if (!parsed) return new Response('Ongeldige maand (verwacht YYYY-MM)', { status: 400 });

  try {
    const detail = await getRecapDetail(orgSlug as OrgSlug, parsed.year, parsed.month);
    const pdf = await renderRecapPdf(detail);
    const filename = `ChatManta_Recap_${sanitizeName(detail.name)}_${month}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[recap-pdf] render error:', err instanceof Error ? err.message : err);
    return new Response('PDF kon niet worden gegenereerd', { status: 500 });
  }
}
