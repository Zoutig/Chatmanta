// Next.js 16 proxy (was middleware in Next.js <16).
//
// Single job: gate ALL pages behind the V0 demo password except /login itself
// and Next.js' internals. Server actions also re-check via requireAuth() in
// app/actions/_auth.ts — never rely on the proxy alone (defense in depth).

import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';

export function proxy(req: NextRequest) {
  const cookie = req.cookies.get(AUTH_COOKIE.name)?.value;
  if (verifyAuthCookieValue(cookie)) {
    return NextResponse.next();
  }
  const loginUrl = new URL('/login', req.url);
  // Preserve where the user wanted to go so /login can bounce them back.
  loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every path EXCEPT /login, Next.js internals, static assets, en de
  // Vercel-cron-route. Die laatste heeft geen login-cookie (Vercel roept 'm
  // server-side aan) en beveiligt zichzelf via CRON_SECRET in de route-handler —
  // zou anders naar /login omgeleid worden en nooit draaien.
  // /embed/* en de publieke API-paden (chat + feedback + widget-ping/token) gaan
  // NIET door de login-redirect: ze worden vanaf externe pagina's geladen zonder
  // demo-cookie. Die routes doen zelf dual-auth (cookie OF embed-token +
  // origin-lock). Zie app/api/v0/chat/route.ts en app/api/v0/feedback/route.ts.
  //
  // /crawl-eval/* zijn statische fixture-pagina's (public/crawl-eval/) voor de
  // golden-set crawler-eval. Ze MOETEN publiek bereikbaar zijn zodat Firecrawl ze
  // van buitenaf kan crawlen (anders → login-redirect → 0 bruikbare pagina's).
  // Bevatten uitsluitend fictieve demo-content, geen klantdata of secrets.
  // Segment-geankerd (`crawl-eval(?:/|$)`) zodat ALLEEN het exacte pad-segment de
  // gate omzeilt — niet een toekomstig /crawl-evaluation o.i.d. (Codex-review).
  matcher: [
    '/((?!login|embed|crawl-eval(?:/|$)|api/v0/cron|api/v0/chat|api/v0/feedback|api/v0/widget|widget\\.js$|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
