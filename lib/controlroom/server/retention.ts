// Control Room — AVG retention-cleanup (MD §14.8). GEDOCUMENTEERDE SERVICE,
// bewust NIET aan een cron gekoppeld in V0 (besloten: alleen config + zicht).
//
// Anonimiseert gespreks-INHOUD ouder dan de per-org chat-retentietermijn, maar
// behoudt de METADATA (org, datum, kind, tokens, kosten) zodat usage-cijfers
// kloppen — conform MD §14.4. Default = DRY-RUN: telt alleen. Pas met
// `apply: true` (CLI-flag --apply) worden rijen daadwerkelijk geanonimiseerd.
//
// Draai handmatig via: npm run controlroom:retention   (dry-run)
//                       npm run controlroom:retention -- --apply
//
// ⚠️ Destructief met --apply: query_log.question/answer en
// v0_thread_messages.content worden overschreven met '[verwijderd]'. Niet
// terug te draaien. Daarom dry-run als default en een expliciete flag.

import 'server-only';

import { listKnownOrgs } from '@/lib/v0/server/active-org';
import { PRIVACY_DEFAULTS } from '../types';
import { sb } from './db';
import { getPrivacy } from './privacy';

const REDACTED = '[verwijderd — retention]';

export type RetentionOrgResult = {
  orgSlug: string;
  orgName: string;
  chatRetentionDays: number;
  cutoffIso: string;
  fullLoggingEnabled: boolean;
  queryLogCandidates: number;
  messageCandidates: number;
  applied: boolean;
};

function cutoffIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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

  return {
    orgSlug: slug,
    orgName: name,
    chatRetentionDays: privacy.chatRetentionDays,
    cutoffIso: cutoff,
    fullLoggingEnabled: privacy.fullConversationLogging,
    queryLogCandidates: qlCount ?? 0,
    messageCandidates: msgCount,
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
// system/cron) waar geen per-org setting bij hoort. Verwijderd worden: groepen
// ouder dan de cutoff die NIET meer 'open' zijn (resolved/ignored) OF severity
// 'info' (routine-ruis). Open error/warning blijven staan — die vragen aandacht.
// Fingerprint-grouping begrenst het volume al sterk, dus dit is licht.

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
  const eligible = 'status.neq.open,severity.eq.info';

  const { count } = await sb()
    .from('admin_error_groups')
    .select('id', { count: 'exact', head: true })
    .lt('last_seen_at', cutoff)
    .or(eligible);

  if (apply) {
    await sb().from('admin_error_groups').delete().lt('last_seen_at', cutoff).or(eligible);
  }

  return { retentionDays, cutoffIso: cutoff, candidates: count ?? 0, applied: apply };
}
