// Mint een vers embed-token voor een geladen widget. Laat de embedded widget
// zichzelf herstellen wanneer z'n kortlevende token (30-min TTL, zie
// lib/v0/server/embed-token.ts) midden in een sessie verloopt — i.p.v. een
// misleidende "even inloggen"-melding te tonen.
//
// Auth: rate-limit per IP + origin-lock (Origin/Referer-host moet de app-host
// zijn). Géén embed-token vereist — dit endpoint maakt er juist één aan. Dat
// voegt geen nieuw risico toe boven de status quo: een token is nu al te
// verkrijgen door de server-gerenderde /embed-pagina te scrapen (bewust
// geaccepteerd V0-restrisico). De rate-limit dekt misbruik af.
import { NextResponse } from 'next/server';
import { createEmbedToken } from '@/lib/v0/server/embed-token';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';

export const runtime = 'nodejs';

function sameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug || !sameOrigin(req)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const token = createEmbedToken(orgSlug);
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Fail-closed: geen EMBED_TOKEN_SECRET → geen token. 503 i.p.v. 401 zodat
    // de widget niet in een refresh-lus belandt (die retryt alleen op 401/403).
    return new NextResponse(null, { status: 503 });
  }
}
