// Control Room — AVG retention-cleanup (MD §14.8).
//
// Draait dagelijks via de Vercel-cron (app/api/v0/cron/retention/route.ts roept
// runRetentionCleanup). Twee soorten cleanup per org:
//   1. Chat-INHOUD ouder dan de per-org chat-retentietermijn → geANONIMISEERD
//      (question/answer/content → '[verwijderd]'), METADATA blijft (org, datum,
//      kind, tokens, kosten) zodat usage-cijfers kloppen — conform MD §14.4.
//   2. Contactverzoeken (v0_contact_requests) ouder dan 90 dagen → HARD VERWIJDERD
//      (volledige .delete(), niet anonimiseren — die rijen bevatten bezoekers-PII
//      en de AVG eist volledige verwijdering). Eigen vaste 90d-cutoff, los van de
//      per-org chatRetentionDays. Zie migr 0053.
//
// Default = DRY-RUN: telt alleen. Pas met `apply: true` (CLI-flag --apply, of de
// cron zonder ?dryRun=1) wordt er daadwerkelijk gemuteerd/verwijderd.
//
// Draai handmatig via: npm run controlroom:retention   (dry-run)
//                       npm run controlroom:retention -- --apply
//
// ⚠️ Destructief met --apply: query_log.question/answer en
// v0_thread_messages.content worden overschreven met '[verwijderd]', en
// contactverzoeken > 90 dagen worden fysiek verwijderd. Niet terug te draaien.
// Daarom dry-run als default en een expliciete flag.

import 'server-only';

import { listKnownOrgs } from '@/lib/v0/server/active-org';
import { RETENTION_REDACTED as REDACTED } from '@/lib/v0/retention-sentinel';
import { PRIVACY_DEFAULTS } from '../types';
import { sb } from './db';
import { getPrivacy } from './privacy';

export type RetentionOrgResult = {
  orgSlug: string;
  orgName: string;
  chatRetentionDays: number;
  cutoffIso: string;
  fullLoggingEnabled: boolean;
  queryLogCandidates: number;
  messageCandidates: number;
  /** Contactverzoeken > 90 dagen die (zouden) worden HARD verwijderd (migr 0053). */
  contactRequestCandidates: number;
  applied: boolean;
};

// Vaste retentietermijn voor contactverzoeken — bewust LOS van de per-org
// chatRetentionDays (PII vereist een eigen, niet-configureerbare grens). Cutoff op
// created_at (niet updated_at: een statuswijziging mag de klok niet resetten).
const CONTACT_REQUEST_RETENTION_DAYS = 90;

function cutoffIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Hard-delete van contactverzoeken ouder dan 90 dagen (op created_at). Geen
// anonimisering zoals bij chat-rijen: de AVG eist volledige verwijdering van de
// bezoekers-PII (naam/e-mail/telefoon). dryRun telt alleen. Org-gescoped.
async function processContactRequests(orgId: string, apply: boolean): Promise<number> {
  const cutoff = cutoffIso(CONTACT_REQUEST_RETENTION_DAYS);
  const { count } = await sb()
    .from('v0_contact_requests')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .lt('created_at', cutoff);

  if (apply) {
    await sb()
      .from('v0_contact_requests')
      .delete()
      .eq('organization_id', orgId)
      .lt('created_at', cutoff);
  }

  return count ?? 0;
}

async function processOrg(
  slug: string,
  orgId: string,
  name: string,
  apply: boolean,
): Promise<RetentionOrgResult> {
  const privacy = await getPrivacy(orgId);
  const cutoff = cutoffIso(privacy.chatRetentionDays);

  // Kandidaten = inhoud-dragende rijen ouder dan de cutoff die nog niet
  // geredigeerd zijn.
  const { count: qlCount } = await sb()
    .from('query_log')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .lt('created_at', cutoff)
    .neq('answer', REDACTED);

  // v0_thread_messages heeft geen organization_id; we beperken via de thread-ids
  // van de org. Voor de telling volstaat een join-vrije benadering met de
  // thread-ids (V0-volume klein).
  const { data: threadRows } = await sb()
    .from('v0_threads')
    .select('id')
    .eq('organization_id', orgId);
  const threadIds = (threadRows ?? []).map((r) => r.id as string);

  let msgCount = 0;
  if (threadIds.length > 0) {
    const { count } = await sb()
      .from('v0_thread_messages')
      .select('id', { count: 'exact', head: true })
      .in('thread_id', threadIds)
      .lt('created_at', cutoff)
      .neq('content', REDACTED);
    msgCount = count ?? 0;
  }

  if (apply) {
    await sb()
      .from('query_log')
      .update({ question: REDACTED, answer: REDACTED })
      .eq('organization_id', orgId)
      .lt('created_at', cutoff)
      .neq('answer', REDACTED);
    if (threadIds.length > 0) {
      await sb()
        .from('v0_thread_messages')
        .update({ content: REDACTED })
        .in('thread_id', threadIds)
        .lt('created_at', cutoff)
        .neq('content', REDACTED);
    }
  }

  // Contactverzoeken kennen een eigen, vaste 90-daagse harde-delete-grens (los van
  // de chat-anonimisering hierboven).
  const contactRequestCandidates = await processContactRequests(orgId, apply);

  return {
    orgSlug: slug,
    orgName: name,
    chatRetentionDays: privacy.chatRetentionDays,
    cutoffIso: cutoff,
    fullLoggingEnabled: privacy.fullConversationLogging,
    queryLogCandidates: qlCount ?? 0,
    messageCandidates: msgCount,
    contactRequestCandidates,
    applied: apply,
  };
}

/** Draai de retention-cleanup over alle bekende orgs. Default dry-run. */
export async function runRetentionCleanup(
  opts: { apply?: boolean } = {},
): Promise<RetentionOrgResult[]> {
  const apply = opts.apply === true;
  const orgs = listKnownOrgs();
  const results: RetentionOrgResult[] = [];
  for (const o of orgs) {
    results.push(await processOrg(o.slug, o.id, o.name, apply));
  }
  return results;
}

// ── Issues-tab: prune van admin_error_groups ───────────────────────────────
// Eén globale pass (default issue_retention_days). Bewust GEEN per-org loop:
// veel fout-groepen hebben organization_id NULL (server-action-fouten,
// system/cron) waar geen per-org setting bij hoort. Verwijderd worden: AFGEHANDELDE
// groepen (resolved/ignored) ouder dan de cutoff. OPEN groepen blijven staan — ook
// open 'info' (een actief-terugkerend abuse-patroon zoals INJECTION_BLOCKED/
// AUTH_REQUIRED mag niet stilletjes verdwijnen); hun aantal is al begrensd door de
// fingerprint-grouping + cardinaliteits-cap. (Review round 1.)

export type ErrorRetentionResult = {
  retentionDays: number;
  cutoffIso: string;
  candidates: number;
  applied: boolean;
};

export async function runErrorGroupRetention(
  opts: { apply?: boolean } = {},
): Promise<ErrorRetentionResult> {
  const apply = opts.apply === true;
  const retentionDays = PRIVACY_DEFAULTS.issueRetentionDays;
  const cutoff = cutoffIso(retentionDays);

  const { count } = await sb()
    .from('admin_error_groups')
    .select('id', { count: 'exact', head: true })
    .lt('last_seen_at', cutoff)
    .neq('status', 'open');

  if (apply) {
    await sb().from('admin_error_groups').delete().lt('last_seen_at', cutoff).neq('status', 'open');
  }

  return { retentionDays, cutoffIso: cutoff, candidates: count ?? 0, applied: apply };
}
