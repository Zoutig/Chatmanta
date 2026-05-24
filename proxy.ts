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
  matcher: ['/((?!login|api/v0/cron|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)'],
};
