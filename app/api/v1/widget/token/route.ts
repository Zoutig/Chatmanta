// V1-widget: mint een vers embed-token voor een geladen widget. Laat de embedded
// widget zichzelf herstellen wanneer z'n kortlevende token (zie
// lib/v1/widget/embed-token.ts) midden in een sessie verloopt — i.p.v. een
// misleidende foutmelding te tonen. Port van app/api/v0/widget/token/route.ts.
//
// Auth: origin-lock (Origin/Referer-host moet de app-host zijn) + de org-slug
// moet bestaan in de V1-DB. Géén embed-token vereist — dit endpoint maakt er juist
// één aan. Org-resolutie komt uit de DB-slug (V1 heeft geen KNOWN_ORGS/cookie).
import { NextResponse } from 'next/server';
import { createEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // Per-IP rate-limit (cost-explosion guard) — mirror van V0's token-route, gate #1.
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  const slug = new URL(req.url).searchParams.get('org');
  if (!slug || !sameOrigin(req)) {
    return new NextResponse(null, { status: 401 });
  }

  // M-C: per-IP hier doet (gate #1); M-C voegt per-ORG rate-limit toe.

  // Org-resolutie via service-role: de slug moet een bestaande, niet-verwijderde
  // org zijn. Onbekend → 401 (geen token voor een onbekende slug).
  const svc = getV1ServiceRoleClient();
  const { data, error } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const token = createEmbedToken(slug);
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Fail-closed: geen EMBED_TOKEN_SECRET → geen token. 503 i.p.v. 401 zodat
    // de widget niet in een refresh-lus belandt (die retryt alleen op 401/403).
    return new NextResponse(null, { status: 503 });
  }
}
