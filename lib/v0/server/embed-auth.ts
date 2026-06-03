// Gedeelde auth-/herkomst-checks voor de publieke widget-API (chat + AVG-delete).
//
// Eén bron van waarheid voor de embed-veiligheidsgrens, zodat de chat-route en het
// delete-endpoint NIET uiteenlopen. Geëxtraheerd uit app/api/v0/chat/route.ts (C9,
// v0.10) — gedrag byte-identiek.

import 'server-only';

import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';

// Widget-detectie via referer-header. Twee publieke chat-paden:
//   /widget/<slug>  — de demo-rotatie op onze eigen omgeving
//   /embed/<slug>   — de iframe van public/widget.js op een externe site
// Beide moeten server-side een v0_threads-rij krijgen (commitTurn) zodat het
// gesprek in klanten-/admindashboard verschijnt. De testtool zit op
// /klantendashboard/test en commit zelf client-side → bewust géén match hier
// (anders dubbele rijen). Als extra zekerheid telt ook een aanwezig embed-token
// (alleen de embed-client stuurt dat) als widget-signaal voor het geval de
// referer door een strikte Referrer-Policy gestript is.
export function isWidgetRequest(req: Request): boolean {
  if (req.headers.get('x-chatmanta-embed')) return true;
  const referer = req.headers.get('referer');
  if (!referer) return false;
  try {
    const path = new URL(referer).pathname;
    return path.startsWith('/widget/') || path.startsWith('/embed/');
  } catch {
    return false;
  }
}

// True als de request het geldige V0-demo-cookie draagt (ingelogde admin/test/
// /widget-demo). Onderscheidt het admin-pad van het publieke embed-pad — dat
// laatste authoriseert via embed-token en krijgt strengere injection-handling.
export function isCookieAuthed(req: Request): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  return verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined);
}

// Dual-auth voor het publieke widget-pad. Geldig als óf het V0-demo-cookie klopt
// (ingelogde admin/test/widget-demo paden — geen regressie), óf een geldig
// embed-token + same-origin. Anders niet geautoriseerd.
export function isChatAuthorized(req: Request): boolean {
  if (isCookieAuthed(req)) return true;

  // Token moet bij de gevraagde org horen.
  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug) return false;
  const token = req.headers.get('x-chatmanta-embed');
  if (!verifyEmbedToken(token, orgSlug)) return false;

  // Origin-lock: same-origin POST stuurt een Origin die de app-host moet zijn.
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}
