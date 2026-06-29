'use server';

// V1 M1 — Jorion-admin maakt een klant-organisatie aan + nodigt de owner uit.
//
// Auth: requireJorionAdmin() gate't de actie (cross-org service-role). De org komt
// NIET uit client-input — alleen company_name + owner_email zijn input, geen ID's,
// dus geen SA-1 404-guard nodig (niets om te resolven). De service-role-write loopt
// via de V1-factory (getV1ServiceRoleClient), na de admin-gate.
//
// Idempotentie: invite handelt email_exists af (geen dubbele invite); membership =
// upsert; chatbot-insert vangt de one-active-per-org unique (23505) op. De org zelf
// is per definitie nieuw (nieuwe klant → nieuwe slug).

import { headers } from 'next/headers';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { writeAuditLog } from '@/lib/v1/audit';
import { slugify, withSuffix } from '@/lib/v1/slugify';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CreateOrgResult =
  | { ok: true; orgId: string; slug: string; ownerUserId: string; invited: boolean }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Insert de org met een unieke slug; vertrouwt op de DB-unique-constraint i.p.v.
 *  read-then-write (race-veilig). Probeert base, dan base-2, base-3, … */
async function insertOrgWithUniqueSlug(
  admin: SupabaseClient,
  name: string,
): Promise<{ id: string; slug: string }> {
  const base = slugify(name);
  for (let n = 1; n <= 50; n++) {
    const slug = withSuffix(base, n);
    const { data, error } = await admin
      .from('organizations')
      .insert({ name, slug })
      .select('id, slug')
      .single();
    if (!error) return { id: data.id as string, slug: data.slug as string };
    if ((error as { code?: string }).code !== '23505') {
      throw new Error(`organizations insert: ${error.message}`);
    }
    // 23505 = slug al in gebruik → volgende suffix
  }
  throw new Error('kon geen unieke slug genereren');
}

/** Resolve de redirect-basis voor de invite-mail. Override via NEXT_PUBLIC_SITE_URL,
 *  anders uit de request-origin (server action). MOET in de Supabase Auth redirect-
 *  allowlist staan, anders weigert Supabase de redirect. */
async function resolveOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('host');
  if (host) return `https://${host}`;
  throw new Error('kon de site-origin niet bepalen voor de invite-redirect');
}

export async function createClientOrganization(
  companyName: string,
  ownerEmail: string,
): Promise<CreateOrgResult> {
  let actorId: string;
  try {
    const actor = await requireJorionAdmin();
    actorId = actor.id;
  } catch {
    // requireJorionAdmin gooit AUTH_FORBIDDEN (niet-admin) of NEXT_REDIRECT (geen
    // sessie). Beide → nette fail i.p.v. een rejected promise die de form-UI hangt.
    return { ok: false, error: 'Geen toegang (Jorion-admin vereist).' };
  }

  const name = companyName.trim();
  const email = ownerEmail.trim().toLowerCase();
  if (name.length < 2) return { ok: false, error: 'Bedrijfsnaam is te kort.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Ongeldig e-mailadres.' };

  const admin = getV1ServiceRoleClient();

  try {
    // 1+2. org met unieke slug
    const { id: orgId, slug } = await insertOrgWithUniqueSlug(admin, name);

    // 3. owner uitnodigen (magic-link → /v1/auth/callback). email_exists → bestaande
    //    user opzoeken (idempotent, geen dubbele invite).
    const redirectTo = `${await resolveOrigin()}/v1/auth/callback`;
    let ownerUserId: string;
    let invited = true;
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteErr) {
      const code = (inviteErr as { code?: string }).code;
      if (code === 'email_exists' || /already|exist|registered|duplicate/i.test(inviteErr.message)) {
        invited = false;
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) return { ok: false, error: `gebruiker-lookup faalde: ${listErr.message}` };
        const existing = list.users.find((u) => u.email?.toLowerCase() === email);
        if (!existing) return { ok: false, error: 'gebruiker bestaat al maar werd niet gevonden.' };
        ownerUserId = existing.id;
      } else {
        return { ok: false, error: `uitnodigen faalde: ${inviteErr.message}` };
      }
    } else {
      ownerUserId = invite.user.id;
    }

    // 4. de handle_new_auth_user-trigger heeft de public.users-rij al gemaakt
    //    (AFTER INSERT op auth.users, zelfde transactie als de invite).

    // 5. membership (owner). upsert = idempotent bij her-aanmaak voor dezelfde user.
    const { error: memberErr } = await admin
      .from('organization_members')
      .upsert(
        { organization_id: orgId, user_id: ownerUserId, role: 'owner' },
        { onConflict: 'organization_id,user_id' },
      );
    if (memberErr) return { ok: false, error: `membership: ${memberErr.message}` };

    // 6. auto-create de ene chatbot (één-per-org). bot_version = de V1-default die de
    //    seed/ingest gebruiken (v1.0). 23505 = one-active-per-org → al aanwezig (ok).
    const { error: botErr } = await admin
      .from('chatbots')
      .insert({ organization_id: orgId, name, bot_version: 'v1.0' });
    if (botErr && (botErr as { code?: string }).code !== '23505') {
      return { ok: false, error: `chatbot: ${botErr.message}` };
    }

    // 7. audit (fail-soft). user_id = de actor (admin); owner in metadata.
    await writeAuditLog(admin, {
      organizationId: orgId,
      userId: actorId,
      action: 'org.create',
      targetType: 'organization',
      targetId: orgId,
      metadata: { owner_email: email, owner_user_id: ownerUserId, invited },
    });

    return { ok: true, orgId, slug, ownerUserId, invited };
  } catch (e) {
    console.error('[v1/createClientOrganization] mislukt:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'onbekende fout' };
  }
}
