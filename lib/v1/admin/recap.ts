// V1 admin — Maandelijkse Recap: DB-reads/writes.
//
// Port van lib/controlroom/server/recap.ts naar de V1-stack.
// Aanpassingen t.o.v. V0:
//  - Tabelnames: 'threads' i.p.v. 'v0_threads', 'thread_messages' i.p.v. 'v0_thread_messages'
//  - DB-toegang: SupabaseClient als parameter (caller roept getJorionAdminClient() aan)
//  - Org-resolutie: orgId als UUID, geen KNOWN_ORGS / slug
//  - Geen deleted_at-filter op threads (V1 threads heeft nog geen soft-delete)
//
// Pure helpers (recap-logic.ts) en LLM (recap-llm.ts) worden ongewijzigd hergebruikt.
// De tabellen admin_monthly_recaps + admin_recap_signals bestaan via migr 0020.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { RETENTION_REDACTED } from '@/lib/v0/retention-sentinel';
import { redactPii } from '@/lib/observability/redact';
import type {
  MonthlyRecap,
  RecapSignalSeverity,
  RecapSignalStatus,
  RecapSignalType,
} from '@/lib/controlroom/types';
import {
  EMPTY_STATS,
  amsterdamHour,
  computeSignals,
  isCurrentMonth,
  monthRangeIso,
  periodMonthKey,
  worstSeverity,
  type RecapSignal,
  type RecapStats,
  type RecapTopQuestion,
  type RecapUnanswered,
} from '@/lib/controlroom/recap-logic';

// Eén import-oppervlak voor pagina's/acties — spiegelt het V0-patroon.
export {
  computeSignals,
  lastCompleteMonth,
  parsePeriodMonth,
  periodMonthKey,
  monthRangeIso,
  isCurrentMonth,
  worstSeverity,
} from '@/lib/controlroom/recap-logic';
export type {
  RecapStats,
  RecapSignal,
  RecapTopQuestion,
  RecapUnanswered,
} from '@/lib/controlroom/recap-logic';

// V0-caps — klein volume, voorkomt geheugen-uitschieters.
const MAX_THREAD_ROWS = 5_000;
const MAX_QUESTION_ROWS = 2_000;

// ---------------------------------------------------------------------------
// V1-specifieke view-types (geen slug; org = UUID).
// ---------------------------------------------------------------------------

export type V1RecapDetail = {
  orgId: string;
  name: string;
  periodMonth: string;
  year: number;
  month: number;
  isCurrentMonth: boolean;
  stats: RecapStats;
  topQuestions: RecapTopQuestion[];
  topUnanswered: RecapUnanswered[];
  signals: RecapSignal[];
  stored: MonthlyRecap | null;
};

export type V1RecapOverviewRow = {
  orgId: string;
  name: string;
  totalConversations: number;
  uniqueVisitors: number;
  avgDurationSeconds: number;
  avgMessagesPerConversation: number;
  unansweredCount: number;
  /** Zwaarste ernst onder actieve (niet-genegeerde) signalen; null = groen. */
  signalSeverity: RecapSignalSeverity | null;
  hasNotes: boolean;
  hasRecap: boolean;
};

// ---------------------------------------------------------------------------
// Stats — per bron gepartitioneerd (spiegelt V0, V1-tabelnamen).
// ---------------------------------------------------------------------------

/** Live maandstatistieken voor één V1-org. */
export async function getRecapStats(
  admin: SupabaseClient,
  organizationId: string,
  year: number,
  month: number,
): Promise<RecapStats> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    // --- per-GESPREK uit 'threads' (V1 tabel; geen deleted_at in V1) ---
    const { data: threads, error: tErr } = await admin
      .from('threads')
      .select('id, visitor_id, created_at, updated_at')
      .eq('organization_id', organizationId)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .limit(MAX_THREAD_ROWS);
    const turn = await getTurnStats(admin, organizationId, sinceIso, untilIso);
    if (tErr || !threads) return { ...EMPTY_STATS, ...turn };

    const totalConversations = threads.length;
    const visitors = new Set<string>();
    const hourBuckets = new Array<number>(24).fill(0);
    // updated_at gekopt op untilIso zodat een gesprek dat de maand overloopt
    // de afgesloten maand niet blijft oprekken (zelfde logica als V0).
    const untilMs = new Date(untilIso).getTime();
    let durationSum = 0;
    for (const t of threads) {
      if (t.visitor_id) visitors.add(String(t.visitor_id));
      const created = new Date(String(t.created_at)).getTime();
      const updated = Math.min(new Date(String(t.updated_at)).getTime(), untilMs);
      if (updated > created) durationSum += (updated - created) / 1000;
      hourBuckets[amsterdamHour(String(t.created_at))] += 1;
    }
    const peakHour =
      totalConversations === 0 ? null : hourBuckets.indexOf(Math.max(...hourBuckets));

    // --- berichten/gesprek uit 'thread_messages' (V1 tabel) ---
    let avgMessagesPerConversation = 0;
    if (totalConversations > 0) {
      const ids = threads.map((t) => String(t.id));
      const { count, error: mErr } = await admin
        .from('thread_messages')
        .select('id', { count: 'exact', head: true })
        .in('thread_id', ids)
        .lt('created_at', untilIso);
      const messageCount = mErr ? 0 : (count ?? 0);
      avgMessagesPerConversation = Number((messageCount / totalConversations).toFixed(1));
    }

    return {
      totalConversations,
      uniqueVisitors: visitors.size,
      avgDurationSeconds:
        totalConversations > 0 ? Math.round(durationSum / totalConversations) : 0,
      avgMessagesPerConversation,
      unansweredCount: turn.unansweredCount,
      totalTurns: turn.totalTurns,
      peakHour,
    };
  } catch {
    return EMPTY_STATS;
  }
}

async function getTurnStats(
  admin: SupabaseClient,
  organizationId: string,
  sinceIso: string,
  untilIso: string,
): Promise<{ totalTurns: number; unansweredCount: number }> {
  try {
    const [totalRes, fbRes] = await Promise.all([
      admin
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso),
      admin
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('kind', 'fallback')
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso),
    ]);
    return {
      totalTurns: totalRes.error ? 0 : (totalRes.count ?? 0),
      unansweredCount: fbRes.error ? 0 : (fbRes.count ?? 0),
    };
  } catch {
    return { totalTurns: 0, unansweredCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Top-vragen + onbeantwoorde vragen (query_log, PII-geredacteerd).
// ---------------------------------------------------------------------------

type QuestionAgg = { question: string; count: number; lastAskedAt: string; lastKind: string };

async function aggregateQuestions(
  admin: SupabaseClient,
  organizationId: string,
  sinceIso: string,
  untilIso: string,
): Promise<QuestionAgg[]> {
  const { data, error } = await admin
    .from('query_log')
    .select('question, kind, created_at')
    .eq('organization_id', organizationId)
    .in('kind', ['answer', 'fallback'])
    .gte('created_at', sinceIso)
    .lt('created_at', untilIso)
    .order('created_at', { ascending: false })
    .limit(MAX_QUESTION_ROWS);
  if (error || !data) return [];
  const map = new Map<string, QuestionAgg>();
  for (const r of data) {
    const raw = String(r.question ?? '').trim();
    if (!raw || raw === RETENTION_REDACTED) continue;
    const question = redactPii(raw); // AVG
    const key = question.toLowerCase();
    const createdAt = String(r.created_at ?? '');
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (createdAt > existing.lastAskedAt) {
        existing.lastAskedAt = createdAt;
        existing.lastKind = String(r.kind);
      }
    } else {
      map.set(key, { question, count: 1, lastAskedAt: createdAt, lastKind: String(r.kind) });
    }
  }
  return [...map.values()];
}

export async function getTopQuestionsForMonth(
  admin: SupabaseClient,
  organizationId: string,
  year: number,
  month: number,
  topN = 5,
): Promise<RecapTopQuestion[]> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    const aggs = await aggregateQuestions(admin, organizationId, sinceIso, untilIso);
    return aggs
      .sort((a, b) => b.count - a.count || (b.lastAskedAt > a.lastAskedAt ? 1 : -1))
      .slice(0, topN)
      .map((a) => ({ question: a.question, count: a.count, answered: a.lastKind !== 'fallback' }));
  } catch {
    return [];
  }
}

export async function getUnansweredForMonth(
  admin: SupabaseClient,
  organizationId: string,
  year: number,
  month: number,
  topN = 5,
): Promise<RecapUnanswered[]> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    const { data, error } = await admin
      .from('query_log')
      .select('question')
      .eq('organization_id', organizationId)
      .eq('kind', 'fallback')
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .limit(MAX_QUESTION_ROWS);
    if (error || !data) return [];
    const map = new Map<string, RecapUnanswered>();
    for (const r of data) {
      const raw = String(r.question ?? '').trim();
      if (!raw || raw === RETENTION_REDACTED) continue;
      const question = redactPii(raw);
      const key = question.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { question, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, topN);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Opgeslagen artefacten (admin_monthly_recaps / admin_recap_signals) — READS.
// ---------------------------------------------------------------------------

function rowToRecap(r: Record<string, unknown>): MonthlyRecap {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    periodMonth: String(r.period_month),
    aiSummary: (r.ai_summary as string | null) ?? null,
    nielsNotes: (r.niels_notes as string | null) ?? null,
    recapStatus: (r.recap_status as MonthlyRecap['recapStatus']) ?? 'draft',
    generatedAt: (r.generated_at as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getStoredRecap(
  admin: SupabaseClient,
  organizationId: string,
  periodMonth: string,
): Promise<MonthlyRecap | null> {
  try {
    const { data, error } = await admin
      .from('admin_monthly_recaps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('period_month', periodMonth)
      .maybeSingle();
    if (error || !data) return null;
    return rowToRecap(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getSignalTriage(
  admin: SupabaseClient,
  recapId: string,
): Promise<Map<RecapSignalType, RecapSignalStatus>> {
  const out = new Map<RecapSignalType, RecapSignalStatus>();
  try {
    const { data, error } = await admin
      .from('admin_recap_signals')
      .select('signal_type, status')
      .eq('recap_id', recapId);
    if (error || !data) return out;
    for (const r of data)
      out.set(r.signal_type as RecapSignalType, r.status as RecapSignalStatus);
    return out;
  } catch {
    return out;
  }
}

export type RecapArchiveEntry = {
  periodMonth: string;
  generatedAt: string | null;
  recapStatus: MonthlyRecap['recapStatus'];
  hasNotes: boolean;
};

export async function listRecapMonths(
  admin: SupabaseClient,
  organizationId: string,
): Promise<RecapArchiveEntry[]> {
  try {
    const { data, error } = await admin
      .from('admin_monthly_recaps')
      .select('period_month, generated_at, recap_status, niels_notes')
      .eq('organization_id', organizationId)
      .order('period_month', { ascending: false });
    if (error || !data) return [];
    return data.map((r) => ({
      periodMonth: String(r.period_month),
      generatedAt: (r.generated_at as string | null) ?? null,
      recapStatus: (r.recap_status as MonthlyRecap['recapStatus']) ?? 'draft',
      hasNotes: String((r.niels_notes as string | null) ?? '').trim().length > 0,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Geassembleerde views voor de pagina's.
// ---------------------------------------------------------------------------

/** Volledige detail-view voor één V1-org+maand. */
export async function getV1RecapDetail(
  admin: SupabaseClient,
  orgId: string,
  orgName: string,
  year: number,
  month: number,
): Promise<V1RecapDetail> {
  const periodMonth = periodMonthKey(year, month);

  const [stats, topQuestions, topUnanswered, stored] = await Promise.all([
    getRecapStats(admin, orgId, year, month),
    getTopQuestionsForMonth(admin, orgId, year, month),
    getUnansweredForMonth(admin, orgId, year, month),
    getStoredRecap(admin, orgId, periodMonth),
  ]);

  let signals = computeSignals(stats, topUnanswered);
  if (stored) {
    const triage = await getSignalTriage(admin, stored.id);
    signals = signals.map((s) => ({ ...s, status: triage.get(s.type) ?? s.status }));
  }

  return {
    orgId,
    name: orgName,
    periodMonth,
    year,
    month,
    isCurrentMonth: isCurrentMonth(year, month),
    stats,
    topQuestions,
    topUnanswered,
    signals,
    stored,
  };
}

/** Eén overzichtsrij voor de cross-org tabel. */
export async function getV1RecapOverviewRow(
  admin: SupabaseClient,
  orgId: string,
  orgName: string,
  year: number,
  month: number,
): Promise<V1RecapOverviewRow> {
  const periodMonth = periodMonthKey(year, month);

  const [stats, topUnanswered, stored] = await Promise.all([
    getRecapStats(admin, orgId, year, month),
    getUnansweredForMonth(admin, orgId, year, month),
    getStoredRecap(admin, orgId, periodMonth),
  ]);

  let signals = computeSignals(stats, topUnanswered);
  if (stored) {
    const triage = await getSignalTriage(admin, stored.id);
    // ponytail: genegeerde signalen niet meerekenen voor de overzicht-bol.
    signals = signals.filter((s) => (triage.get(s.type) ?? 'nieuw') !== 'genegeerd');
  }

  return {
    orgId,
    name: orgName,
    totalConversations: stats.totalConversations,
    uniqueVisitors: stats.uniqueVisitors,
    avgDurationSeconds: stats.avgDurationSeconds,
    avgMessagesPerConversation: stats.avgMessagesPerConversation,
    unansweredCount: stats.unansweredCount,
    signalSeverity: worstSeverity(signals),
    hasNotes: Boolean(stored?.nielsNotes && stored.nielsNotes.trim().length > 0),
    hasRecap: stored != null && stored.generatedAt != null,
  };
}

// ---------------------------------------------------------------------------
// WRITES — gebruikt door app/v1/admin/maandelijkse-recap/actions.ts.
// ---------------------------------------------------------------------------

/** Vind de recap-rij voor (org, maand) of maak een minimale aan; geef het id. */
export async function getOrCreateRecapId(
  admin: SupabaseClient,
  organizationId: string,
  periodMonth: string,
): Promise<string> {
  const read = () =>
    admin
      .from('admin_monthly_recaps')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('period_month', periodMonth)
      .maybeSingle();

  const existing = await read();
  if (existing.data?.id) return String(existing.data.id);

  const ins = await admin
    .from('admin_monthly_recaps')
    .insert({ organization_id: organizationId, period_month: periodMonth })
    .select('id')
    .single();
  if (ins.data?.id) return String(ins.data.id);

  // Race: parallelle (her)generatie kan de rij net aangemaakt hebben → retry.
  const retry = await read();
  if (retry.data?.id) return String(retry.data.id);
  throw new Error(`kon recap-rij niet aanmaken: ${ins.error?.message ?? 'onbekend'}`);
}

export type RecapArtifactPatch = {
  aiSummary?: string | null;
  nielsNotes?: string | null;
  recapStatus?: MonthlyRecap['recapStatus'];
  generatedAt?: string | null;
};

export async function updateRecapArtifacts(
  admin: SupabaseClient,
  recapId: string,
  patch: RecapArtifactPatch,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.aiSummary !== undefined) row.ai_summary = patch.aiSummary;
  if (patch.nielsNotes !== undefined) row.niels_notes = patch.nielsNotes;
  if (patch.recapStatus !== undefined) row.recap_status = patch.recapStatus;
  if (patch.generatedAt !== undefined) row.generated_at = patch.generatedAt;
  if (Object.keys(row).length === 0) return;
  const { error } = await admin
    .from('admin_monthly_recaps')
    .update(row)
    .eq('id', recapId);
  if (error) throw new Error(`kon recap niet bijwerken: ${error.message}`);
}

/** Insert ontbrekende signaal-rijen als 'nieuw'; bestaande triage-status blijft. */
export async function ensureSignalRows(
  admin: SupabaseClient,
  recapId: string,
  types: RecapSignalType[],
): Promise<void> {
  if (types.length === 0) return;
  const rows = types.map((t) => ({
    recap_id: recapId,
    signal_type: t,
    status: 'nieuw' as RecapSignalStatus,
  }));
  const { error } = await admin
    .from('admin_recap_signals')
    .upsert(rows, { onConflict: 'recap_id,signal_type', ignoreDuplicates: true });
  if (error) throw new Error(`kon signaal-rijen niet aanmaken: ${error.message}`);
}

export async function setSignalTriageStatus(
  admin: SupabaseClient,
  recapId: string,
  signalType: RecapSignalType,
  status: RecapSignalStatus,
): Promise<void> {
  const { error } = await admin
    .from('admin_recap_signals')
    .upsert(
      { recap_id: recapId, signal_type: signalType, status },
      { onConflict: 'recap_id,signal_type' },
    );
  if (error) throw new Error(`kon signaal-status niet zetten: ${error.message}`);
}
