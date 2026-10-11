// Next.js 16 proxy (was middleware in Next.js <16).
//
// Single job: gate ALL pages behind the V0 demo password except /v0/login itself
// and Next.js' internals (deny-by-default: alles wat niet expliciet in de matcher
// is uitgezonderd, valt achter de gate). Server actions also re-check via requireAuth() in
// app/actions/_auth.ts — never rely on the proxy alone (defense in depth).

import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { updateSession } from '@/lib/supabase/v1/middleware';

export async function proxy(req: NextRequest) {
  // V1-routes (Supabase Auth) draaien NIET door de V0-demo-wachtwoord-gate.
  // In plaats daarvan ververst de Supabase SSR-middleware hier de sessie-cookie;
  // de eigenlijke toegangscontrole gebeurt per-pagina via requireAuth/
  // requireOrgMember/requireJorionAdmin (lib/auth.ts). Zo blijft de V0-gate intact
  // voor al het andere, en valt /v1/* erbuiten (analoog aan de /embed-exemptie).
  // Dekt /v1/app, /v1/login, /v1/admin/* (M1-onboarding) én /v1/auth/* (de
  // magic-link-callback + set-password) — allemaal via deze ene startsWith('/v1').
  if (req.nextUrl.pathname.startsWith('/v1')) {
    return updateSession(req);
  }

  const cookie = req.cookies.get(AUTH_COOKIE.name)?.value;
  if (verifyAuthCookieValue(cookie)) {
    return NextResponse.next();
  }
  const loginUrl = new URL('/v0/login', req.url);
  // Preserve where the user wanted to go so /v0/login can bounce them back.
  loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every path EXCEPT /v0/login, Next.js internals, static assets, en de
  // Vercel-cron-route. Die laatste heeft geen login-cookie (Vercel roept 'm
  // server-side aan) en beveiligt zichzelf via CRON_SECRET in de route-handler —
  // zou anders naar /v0/login omgeleid worden en nooit draaien.
  // /privacy is een publieke privacyverklaring (gelinkt vanuit het feedback-
  // formulier) en MOET zonder demo-login bereikbaar zijn. Segment-geankerd
  // (`privacy(?:/|$)`) zodat alleen /privacy zelf de gate omzeilt.
  // /embed/* en de publieke API-paden (chat + feedback + widget-ping/token) gaan
  // NIET door de login-redirect: ze worden vanaf externe pagina's geladen zonder
  // demo-cookie. Die routes doen zelf dual-auth (cookie OF embed-token +
  // origin-lock). Zie app/api/v0/chat/route.ts en app/api/v0/feedback/route.ts.
  //
  // M-B (V1-widget): dezelfde uitzondering voor de V1-publieke paden — api/v1/chat,
  // api/v1/widget (token) en widget-v1.js. Die doen zelf embed-token + origin-lock
  // (zie app/api/v1/chat/route.ts). De V1-embed-PAGINA /embed-v1/* valt al onder de
  // bestaande `embed`-prefix-alternatief (geen anker → matcht ook embed-v1) — bewust,
  // geen aparte entry nodig. NB: /api/v1/* begint met /api (niet /v1) → raakt de
  // updateSession-branch hierboven niet; deze routes hebben geen Supabase-sessie.
  //
  // api/v1/cron (process-crawls): de V1-crawler-pinger-route, exact zoals api/v0/cron.
  // Wordt server-side aangeroepen (externe pinger of Vercel-cron) zónder demo-cookie en
  // beveiligt zichzelf via Bearer CRON_SECRET in de handler — zonder deze exemptie zou
  // elke ping naar /v0/login omgeleid worden en de crawl-verwerking nooit draaien. Segment-
  // geankerd (`api/v1/cron(?:/|$)`) zodat alleen dit pad-segment de gate omzeilt.
  //
  // /crawl-eval/* zijn statische fixture-pagina's (public/crawl-eval/) voor de
  // golden-set crawler-eval. Ze MOETEN publiek bereikbaar zijn zodat Firecrawl ze
  // van buitenaf kan crawlen (anders → login-redirect → 0 bruikbare pagina's).
  // Bevatten uitsluitend fictieve demo-content, geen klantdata of secrets.
  // Segment-geankerd (`crawl-eval(?:/|$)`) zodat ALLEEN het exacte pad-segment de
  // gate omzeilt — niet een toekomstig /crawl-evaluation o.i.d. (Codex-review).
  //
  // Soft-launch-fix (generale repetitie 2026-10-06): deze publieke paden ontbraken en
  // kregen een stille 307 → /login (fetch volgt de redirect, krijgt 200 HTML → de
  // widget dacht dat het gelukt was). Allemaal zelf-beveiligd in de handler:
  //   - api/v0/contact-request, api/v1/contact-request: embed-token + origin-lock
  //   - api/v1/client-error: embed-token (widget) of untrusted-pad met rate-limit
  //   - api/v1/pdf (maandrecap): requireJorionAdmin() — V1-auth, geen V0-cookie
  //
  // /voorbeeld/* + /api/voorbeeld/*: de publieke demo (voorbeeld-dashboard op vaste
  // nepdata + voorbeeldwebsite van een fictief bedrijf). Geen klantdata; de demo-chat-
  // route beveiligt zichzelf (origin-lock + per-IP rate-limit + org-budgetgate).
  // api/v1/feedback staat er bewust NIET bij: de duimpjes zijn uit de V1-widget.
  //
  // Marketingsite M1: V0 verhuisde naar /v0/*. De login-exemptie is nu het
  // segment-geankerde `v0/login(?:/|$)` (was een ongeankerd `login`-prefix). De
  // oude /login is voor niet-ingelogde bezoekers bereikbaar via de 308-redirect in
  // next.config.ts: config-redirects draaien vóór de proxy (Next 16 execution
  // order), dus /login hoeft hier niet meer uitgezonderd te worden.
  matcher: [
    '/((?!v0/login(?:/|$)|privacy(?:/|$)|voorbeeld(?:/|$)|api/voorbeeld(?:/|$)|embed|crawl-eval(?:/|$)|api/v0/cron|api/v0/chat|api/v0/feedback|api/v0/client-error(?:/|$)|api/v0/contact-request(?:/|$)|api/v0/widget|api/v1/chat|api/v1/widget|api/v1/cron(?:/|$)|api/v1/contact-request(?:/|$)|api/v1/client-error(?:/|$)|api/v1/pdf(?:/|$)|widget\\.js$|widget-v1\\.js$|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
