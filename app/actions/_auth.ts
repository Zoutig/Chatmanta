'use server';

// Server-action auth helper — defense-in-depth boven proxy.ts.
//
// proxy.ts gate-t alle pagina's, maar server actions kunnen óók vanaf
// niet-pagina-paden aangeroepen worden (RSC mutations, fetch met manuele
// Action-id) en moeten dus zelf de cookie verifiëren. Dit is exact het
// patroon dat proxy.ts aankondigt:
//   "Server actions also re-check via requireAuth() in app/actions/_auth.ts
//    — never rely on the proxy alone (defense in depth)."
//
// Gebruik:
//   await requireV0Auth();   // throws Error('unauthorized') als de cookie
//                            // mist of niet door HMAC-check komt.
//
// In je actie: vang de error en retourneer { ok: false, error }.

import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';

export async function requireV0Auth(): Promise<void> {
  const jar = await cookies();
  const value = jar.get(AUTH_COOKIE.name)?.value;
  if (!verifyAuthCookieValue(value)) {
    throw new Error('unauthorized');
  }
}
