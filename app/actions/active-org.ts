'use server';

// V0.4 multi-org switcher — server action die de active-org cookie zet
// en het scherm ververst.
//
// De cookie heet `v0_active_org`, wordt door zowel API route (via
// getActiveOrgId(req)) als server-components (via getActiveOrgFromCookies)
// gelezen. Server-side validatie tegen KNOWN_ORGS — onbekende slugs worden
// geweigerd (defense in depth: client-side selecteert uit dezelfde lijst).

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_ORG_COOKIE, KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setActiveOrgAction(
  slug: string,
): Promise<{ ok: true; slug: OrgSlug } | { ok: false; error: string }> {
  if (!(slug in KNOWN_ORGS)) {
    return { ok: false, error: `Onbekende org: ${slug}` };
  }
  const validSlug = slug as OrgSlug;
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, validSlug, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false, // bewust client-leesbaar zodat eventuele client-side reads
    // de slug kunnen tonen zonder extra fetch — geen security risk omdat dit
    // geen auth-cookie is, alleen een UI-preference.
    sameSite: 'lax',
  });
  // Hele tree opnieuw renderen — page.tsx leest cookie en geeft alle
  // org-gescopte data (threads, docs, usage) door aan de ChatShell.
  revalidatePath('/');
  return { ok: true, slug: validSlug };
}
