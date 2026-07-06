'use server';

// V1 admin — org-deep-dive server actions. Cross-org write via getJorionAdminClient()
// (= service-role NÁ de interne requireJorionAdmin()-gate; Jorion is geen member, dus
// de RLS-session-client zou 0 rijen zien). De org-id komt uit de admin-UI (route-param),
// maar de gate is de Jorion-admin-rol — een admin mag elke org bewerken (geen per-org
// membership-check zoals het klant-pad).

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { writeAuditLog } from '@/lib/v1/audit';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgChatbot } from '@/app/v1/app/rag-config';
import {
  getChatbotSettings,
  sanitizeChatbotPatch,
  type V1ChatbotSettings,
} from '@/app/v1/app/instellingen/settings-config';
import { purgeAnswerCache } from '@/lib/rag/ingest';
import { inviteOrLookupUserByEmail, resolveInviteRedirect } from '../invite-helpers';

/** Jorion-admin-gate voor de deep-dive-actions. Retourneert de actor-id, of een
 *  ActionFail bij een niet-admin (AppError); laat NEXT_REDIRECT (geen sessie)
 *  propageren naar /v1/login. Gedeeld door de WP5b-actions hieronder. */
async function requireAdminActor(): Promise<
  { ok: true; actorId: string } | { ok: false; fail: ActionFail }
> {
  try {
    const actor = await requireJorionAdmin();
    return { ok: true, actorId: actor.id };
  } catch (e) {
    if (isAppError(e)) return { ok: false, fail: { ok: false, error: e.message, code: e.code } };
    throw e;
  }
}

const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];
const MEMBER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Redelijk plafond voor een dagbudget — voorkomt een typefout van €100.000.
 *  0 = effectief uit (checkOrgDailyBudget → altijd over-budget). */
const MAX_DAILY_BUDGET_EUR = 1000;

/** Zet organizations.daily_budget_eur (M-C-kolom). ≥0, ≤€1000, afgerond op centen. */
export async function setOrgDailyBudgetAction(
  orgId: string,
  dailyBudgetEur: number,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');
    if (!Number.isFinite(dailyBudgetEur) || dailyBudgetEur < 0 || dailyBudgetEur > MAX_DAILY_BUDGET_EUR) {
      fail('INPUT_INVALID', `Budget moet tussen €0 en €${MAX_DAILY_BUDGET_EUR} liggen.`);
    }
    const value = Math.round(dailyBudgetEur * 100) / 100;
    const { error } = await admin
      .from('organizations')
      .update({ daily_budget_eur: value })
      .eq('id', orgId);
    if (error) throw new Error(`organizations update: ${error.message}`);
    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}

/**
 * AVG-verwijdering (M-E §3b) — verwijder een organisatie + alle bijbehorende data.
 * Type-to-confirm: `confirmText` moet exact de org-slug zijn (typo-guard tegen het
 * per ongeluk wissen van de verkeerde org). Onomkeerbaar.
 *
 * De org-delete CASCADE't members/chatbots/documents/parent_chunks/document_chunks/
 * query_log/knowledge_sources/processing_jobs/crawl_events/answer_cache (alle FK's
 * zijn `on delete cascade`, migr-v1 0001-0003 — geverifieerd). firecrawl_credit_log
 * en audit_logs hebben `on delete set null` (interne telemetrie/audit blijft bestaan).
 */
export async function deleteOrgDataAction(
  orgId: string,
  confirmText: string,
): Promise<ActionResult> {
  let actorId: string;
  try {
    const actor = await requireJorionAdmin(); // self-gate; actor.id voor de audit
    actorId = actor.id;
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  const admin = getV1ServiceRoleClient(); // service-role NÁ de admin-gate

  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr) throw new Error(`organizations lookup: ${orgErr.message}`);
    if (!org) fail('NOT_FOUND', 'Organisatie niet gevonden.');
    if (confirmText.trim() !== org.slug) {
      fail('INPUT_INVALID', 'Bevestiging komt niet overeen met de org-slug.');
    }

    // 1. member-user-ids vóór de delete (CASCADE wist de rows zo meteen).
    const { data: members, error: memErr } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId);
    if (memErr) throw new Error(`members lookup: ${memErr.message}`);
    const memberUserIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);

    // 2. delete org → CASCADE ruimt alle klantdata-tabellen op.
    const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
    if (delErr) throw new Error(`organizations delete: ${delErr.message}`);

    // 2b. best-effort: ruim de ruwe Storage-objecten van de org op (v1-documents).
    //     Storage heeft geen FK → niet ge-cascade. Objecten zijn genest als
    //     <orgId>/<chatbotId>/<file>, dus list(orgId) geeft chatbot-"mappen", niet
    //     files → recursief: per chatbot-map de files listen en de volle paden removen.
    //     Niet-fataal: een gefaalde opruiming mag de voltooide org-delete niet
    //     terugdraaien (originelen worden normaal al post-ingest verwijderd → vangnet).
    try {
      const { data: chatbotDirs } = await admin.storage.from('v1-documents').list(orgId, { limit: 1000 });
      const objectPaths: string[] = [];
      for (const dir of chatbotDirs ?? []) {
        const { data: files } = await admin.storage
          .from('v1-documents')
          .list(`${orgId}/${dir.name}`, { limit: 1000 });
        for (const f of files ?? []) objectPaths.push(`${orgId}/${dir.name}/${f.name}`);
      }
      if (objectPaths.length) await admin.storage.from('v1-documents').remove(objectPaths);
    } catch (e) {
      console.warn(
        `[deleteOrgDataAction] Storage-opruiming faalde (genegeerd) ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 3. best-effort de auth-users verwijderen. Eén-org-per-user (§1.5), maar we
    //    checken expliciet of de user na de cascade nog elders member is
    //    (multi-org-edge → NIET blind deleten). Een gefaalde user-delete mag de
    //    org-delete niet terugdraaien (log warn, ga door).
    const deletedUserIds: string[] = [];
    const skippedMultiOrgUserIds: string[] = [];
    for (const uid of memberUserIds) {
      if (uid === actorId) {
        skippedMultiOrgUserIds.push(uid); // de handelende admin nooit zichzelf wissen
        continue;
      }
      const { count, error: cntErr } = await admin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
      // Fail CLOSED: bij een count-fout is count null → NIET blind deleten (mogelijk
      // nog member van een andere org). Sla over en registreer.
      if (cntErr || (count ?? 0) > 0) {
        skippedMultiOrgUserIds.push(uid); // andere org, of count-fout → safe skip
        continue;
      }
      const { error: userErr } = await admin.auth.admin.deleteUser(uid);
      if (userErr) {
        console.error(`[deleteOrgDataAction] user-delete faalde (genegeerd) ${uid}: ${userErr.message}`);
      } else {
        deletedUserIds.push(uid);
      }
    }

    // 4. audit. organization_id MOET null blijven (de org is weg → een FK-insert
    //    naar organizations zou falen); de orgId staat in target_id (uuid, geen FK).
    await writeAuditLog(admin, {
      userId: actorId,
      action: 'org_deleted',
      targetType: 'organization',
      targetId: orgId,
      metadata: {
        slug: org.slug,
        name: org.name,
        deleted_user_ids: deletedUserIds,
        skipped_multi_org_user_ids: skippedMultiOrgUserIds,
      },
    });

    // 5. lijst verversen; de client navigeert terug naar /v1/admin/organizations.
    revalidatePath('/v1/admin/organizations');
    return {};
  });
}

// ─────────────────────────── WP5b — botinstellingen + widget ───────────────────────────
//
// Eén admin-action voor zowel de Botinstellingen- als de Widget-tab: beide bewerken
// dezelfde chatbots.settings jsonb. Hergebruikt de klant-datalaag (getChatbotSettings +
// sanitizeChatbotPatch → geen eigen merge-logica) en purgt de answer-cache ná de write,
// net als saveChatbotSettingsAction. De org komt uit de route-param; de write scoopt
// .eq(organization_id).eq(id) zodat alléén de chatbot van díe org wordt geraakt
// (service-role-bypass → object-level guard). Gate = Jorion-admin (cross-org).

/** Sla een deel van de V1-chatbot-settings op voor een specifieke org (admin-support). */
export async function adminSaveChatbotSettingsAction(
  orgId: string,
  patch: Partial<V1ChatbotSettings>,
): Promise<ActionResult<{ settings: V1ChatbotSettings }>> {
  const gate = await requireAdminActor();
  if (!gate.ok) return gate.fail;
  const actorId = gate.actorId;

  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');
    const svc = getV1ServiceRoleClient();
    const chatbot = await getOrgChatbot(svc, orgId);
    if (!chatbot) fail('NOT_FOUND', 'Deze organisatie heeft nog geen chatbot.');

    const safePatch = sanitizeChatbotPatch(patch);
    const current = await getChatbotSettings(svc, chatbot.id);
    const next: V1ChatbotSettings = { ...current, ...safePatch };

    const { error } = await svc
      .from('chatbots')
      .update({ settings: next })
      .eq('organization_id', orgId)
      .eq('id', chatbot.id);
    if (error) throw new Error(`chatbot-settings opslaan faalde: ${error.message}`);

    // Toon/taal/fallback zitten niet in de cache-key → purge zodat een stale hit de
    // wijziging niet overleeft (zelfde reden als de klant-save). Best-effort.
    await purgeAnswerCache(svc, orgId, chatbot.id);

    await writeAuditLog(svc, {
      organizationId: orgId,
      userId: actorId,
      action: 'chatbot.settings_update',
      targetType: 'chatbot',
      targetId: chatbot.id,
      metadata: { fields: Object.keys(safePatch) },
    });

    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return { settings: next };
  });
}

// ─────────────────────────── WP5b — ledenbeheer (Beheer-tab) ───────────────────────────

/** Nodig een e-mailadres uit als lid van deze org (of voeg een bestaande user toe).
 *  Hergebruikt de gedeelde invite-flow (invite-helpers) — geen tweede kopie. */
export async function adminInviteMemberAction(
  orgId: string,
  emailRaw: string,
  roleRaw: string,
): Promise<ActionResult<{ userId: string; invited: boolean }>> {
  const gate = await requireAdminActor();
  if (!gate.ok) return gate.fail;
  const actorId = gate.actorId;

  const email = emailRaw.trim().toLowerCase();
  const role = roleRaw as MemberRole;

  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie opgegeven.');
    if (!MEMBER_EMAIL_RE.test(email)) fail('INPUT_INVALID', 'Ongeldig e-mailadres.');
    if (!MEMBER_ROLES.includes(role)) fail('INPUT_INVALID', 'Ongeldige rol.');

    const svc = getV1ServiceRoleClient();
    const { data: org, error: orgErr } = await svc
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (orgErr) throw new Error(`org-lookup faalde: ${orgErr.message}`);
    if (!org) fail('NOT_FOUND', 'Organisatie niet gevonden.');

    const redirectTo = await resolveInviteRedirect();
    const { userId, invited } = await inviteOrLookupUserByEmail(svc, email, redirectTo);

    // upsert = idempotent; her-uitnodigen met een andere rol werkt de rol bij.
    const { error: memberErr } = await svc
      .from('organization_members')
      .upsert(
        { organization_id: orgId, user_id: userId, role },
        { onConflict: 'organization_id,user_id' },
      );
    if (memberErr) throw new Error(`lid toevoegen faalde: ${memberErr.message}`);

    await writeAuditLog(svc, {
      organizationId: orgId,
      userId: actorId,
      action: 'member.invite',
      targetType: 'user',
      targetId: userId,
      metadata: { email, role, invited },
    });

    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return { userId, invited };
  });
}

/** Stuur de invite-mail opnieuw voor een lid dat nog nooit heeft ingelogd (typo/verlopen
 *  link). Alleen zinvol vóór de eerste login → geweigerd zodra last_sign_in_at gezet is. */
export async function adminResendMemberInviteAction(
  orgId: string,
  userId: string,
): Promise<ActionResult> {
  const gate = await requireAdminActor();
  if (!gate.ok) return gate.fail;
  const actorId = gate.actorId;

  return actionTry(async () => {
    if (!orgId || !userId) fail('INPUT_INVALID', 'Ontbrekende parameters.');
    const svc = getV1ServiceRoleClient();

    // Object-level: het lid moet bij DEZE org horen (niet blind op userId vertrouwen).
    const { data: membership, error: mErr } = await svc
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (mErr) throw new Error(`membership-check faalde: ${mErr.message}`);
    if (!membership) fail('NOT_FOUND', 'Dit lid hoort niet bij deze organisatie.');

    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(userId);
    if (authErr || !authUser.user?.email) throw new Error('gebruiker niet gevonden.');
    if (authUser.user.last_sign_in_at) {
      fail('INPUT_INVALID', 'Dit lid heeft al ingelogd — opnieuw uitnodigen is niet nodig.');
    }
    const email = authUser.user.email;

    const redirectTo = await resolveInviteRedirect();
    const { error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteErr) {
      const code = (inviteErr as { code?: string }).code;
      if (code === 'email_exists' || /already|exist|registered/i.test(inviteErr.message)) {
        fail('INPUT_INVALID', 'Dit lid heeft al een bevestigd account.');
      }
      throw new Error(`opnieuw uitnodigen faalde: ${inviteErr.message}`);
    }

    await writeAuditLog(svc, {
      organizationId: orgId,
      userId: actorId,
      action: 'member.invite_resend',
      targetType: 'user',
      targetId: userId,
      metadata: { email },
    });

    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}

/** Verwijder een lid uit de org (toegang direct ingetrokken). De laatste owner kan NIET
 *  worden verwijderd. Best-effort ruimt de auth-user op als die nergens anders lid is
 *  (§1.5 = één org per user), fail-closed bij een count-fout; nooit de handelende admin. */
export async function adminRemoveMemberAction(
  orgId: string,
  userId: string,
): Promise<ActionResult> {
  const gate = await requireAdminActor();
  if (!gate.ok) return gate.fail;
  const actorId = gate.actorId;

  return actionTry(async () => {
    if (!orgId || !userId) fail('INPUT_INVALID', 'Ontbrekende parameters.');
    const svc = getV1ServiceRoleClient();

    const { data: members, error: mErr } = await svc
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', orgId);
    if (mErr) throw new Error(`ledenlijst faalde: ${mErr.message}`);
    const target = (members ?? []).find((m) => (m as { user_id: string }).user_id === userId) as
      | { user_id: string; role: string }
      | undefined;
    if (!target) fail('NOT_FOUND', 'Dit lid hoort niet bij deze organisatie.');
    const ownerCount = (members ?? []).filter((m) => (m as { role: string }).role === 'owner').length;
    if (target.role === 'owner' && ownerCount <= 1) {
      fail('INPUT_INVALID', 'De laatste owner kan niet worden verwijderd. Wijs eerst een andere owner aan.');
    }

    // 1. membership weg → toegang direct ingetrokken (RLS ziet geen membership meer).
    const { error: delErr } = await svc
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);
    if (delErr) throw new Error(`lid verwijderen faalde: ${delErr.message}`);

    // 2. best-effort auth-user-cleanup (zelfde patroon als deleteOrgDataAction).
    let authUserDeleted = false;
    if (userId !== actorId) {
      const { count, error: cntErr } = await svc
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!cntErr && (count ?? 0) === 0) {
        const { error: userErr } = await svc.auth.admin.deleteUser(userId);
        if (userErr) {
          console.error(`[adminRemoveMemberAction] user-delete faalde (genegeerd) ${userId}: ${userErr.message}`);
        } else {
          authUserDeleted = true;
        }
      }
    }

    await writeAuditLog(svc, {
      organizationId: orgId,
      userId: actorId,
      action: 'member.remove',
      targetType: 'user',
      targetId: userId,
      metadata: { removed_role: target.role, auth_user_deleted: authUserDeleted },
    });

    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}
