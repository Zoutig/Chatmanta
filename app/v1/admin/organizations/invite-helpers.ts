// V1 admin — gedeelde invite-primitieven. Plain server-module (GEEN 'use server'):
// deze helpers zijn geen server actions maar interne bouwstenen die zowel de
// org-aanmaak (createClientOrganization) als het lid-beheer (adminInviteMemberAction)
// gebruiken — één invite-flow, geen tweede kopie.

import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Resolveer de redirect-basis voor de invite-mail. Override via NEXT_PUBLIC_SITE_URL,
 *  anders uit de request-origin (server action). MOET in de Supabase Auth redirect-
 *  allowlist staan, anders weigert Supabase de redirect. */
export async function resolveInviteRedirect(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const base = explicit
    ? explicit.replace(/\/+$/, '')
    : await (async () => {
        const h = await headers();
        const origin = h.get('origin');
        if (origin) return origin;
        const host = h.get('host');
        if (host) return `https://${host}`;
        throw new Error('kon de site-origin niet bepalen voor de invite-redirect');
      })();
  return `${base}/v1/auth/confirm`;
}

/**
 * Nodig een e-mailadres uit óf zoek de bestaande user op. Idempotent: als het adres
 * al bij een bevestigde user hoort geeft Supabase `email_exists` → we zoeken die user
 * op i.p.v. een dubbele invite te sturen. Voor een uitgenodigde-maar-nog-onbevestigde
 * user re-sendt `inviteUserByEmail` de invite (geen email_exists).
 *
 * `invited` = true betekent dat een VERSE auth-user is aangemaakt (mag bij een rollback
 * weer weg); false = de user bestond al.
 *
 * ponytail: scant alleen de eerste 200 users (ceiling) i.p.v. een paginate-loop —
 * ruim genoeg voor M1-volumes. Upgrade naar paginatie als de user-tabel groeit.
 */
export async function inviteOrLookupUserByEmail(
  admin: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<{ userId: string; invited: boolean }> {
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (!inviteErr) return { userId: invite.user.id, invited: true };

  const code = (inviteErr as { code?: string }).code;
  if (code === 'email_exists' || /already|exist|registered|duplicate/i.test(inviteErr.message)) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(`gebruiker-lookup faalde: ${listErr.message}`);
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw new Error('gebruiker bestaat al maar werd niet gevonden.');
    return { userId: existing.id, invited: false };
  }
  throw new Error(`uitnodigen faalde: ${inviteErr.message}`);
}
