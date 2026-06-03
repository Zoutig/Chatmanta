// Maandelijkse Recap — per-org maandstatistieken + opgeslagen artefacten (READS).
//
// Spec: docs/superpowers/specs/2026-06-02-maandelijkse-recap-design.md
// Pure drempel-/maand-logica staat in ../recap-logic.ts (unit-getest); dit bestand
// doet alleen de DB-reads en stelt de geassembleerde views samen.
//
// KERNREGEL — stats strikt per bron gepartitioneerd (query_log heeft GEEN
// thread_id FK, dus geen join mogelijk):
//   * per-GESPREK (aantal, duur, unieke bezoekers, berichten, piekuur-starts)
//     → v0_threads / v0_thread_messages
//   * per-BEURT (onbeantwoord-telling, fallback-%, top-vragen) → query_log
//
// De cijfers worden LIVE berekend (niet opgeslagen): een afgesloten maand
// verandert niet. Alleen AI-samenvatting + notities + signaal-triage staan in
// admin_monthly_recaps / admin_recap_signals (migratie 0047).
//
// Alle getoonde bezoeker-vraagteksten gaan door redactPii() (AVG).

import 'server-only';

import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { redactPii } from '@/lib/observability/redact';
import type { MonthlyRecap, RecapSignalSeverity, RecapSignalStatus, RecapSignalType } from '../types';
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
} from '../recap-logic';
import { sb } from './db';

// Eén import-oppervlak voor pagina's/acties: pure helpers + types via recap.ts.
export {
  computeSignals,
  lastCompleteMonth,
  parsePeriodMonth,
  periodMonthKey,
  monthRangeIso,
  isCurrentMonth,
  worstSeverity,
} from '../recap-logic';
export type { RecapStats, RecapSignal, RecapTopQuestion, RecapUnanswered } from '../recap-logic';

// V0-caps op de rij-scans. Klein op V0-volume; voorkomt geheugen-uitschieters.
const MAX_THREAD_ROWS = 5_000;
const MAX_QUESTION_ROWS = 2_000;

// ---------------------------------------------------------------------------
// Stats — per bron gepartitioneerd.
// ---------------------------------------------------------------------------

/** Live maandstatistieken voor één org. Per-bron gepartitioneerd, geen join. */
export async function getRecapStats(
  organizationId: string,
  year: number,
  month: number,
): Promise<RecapStats> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    // --- per-GESPREK uit v0_threads ---
    const { data: threads, error: tErr } = await sb()
      .from('v0_threads')
      .select('id, visitor_id, created_at, updated_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .limit(MAX_THREAD_ROWS);
    const turn = await getTurnStats(organizationId, sinceIso, untilIso);
    if (tErr || !threads) return { ...EMPTY_STATS, ...turn };

    const totalConversations = threads.length;
    const visitors = new Set<string>();
    const hourBuckets = new Array<number>(24).fill(0);
    // Duur + berichten begrenzen op het maandvenster: een gesprek dat in deze
    // maand startte maar dóórliep in de volgende maand mag de (afgesloten) maand
    // niet blijven oprekken. updated_at wordt op untilIso gekapt en berichten van
    // ná de maand tellen niet mee → een afgesloten maand blijft stabiel.
    const untilMs = new Date(untilIso).getTime();
    let durationSum = 0;
    for (const t of threads) {
      if (t.visitor_id) visitors.add(String(t.visitor_id));
      const created = new Date(String(t.created_at)).getTime();
      const updated = Math.min(new Date(String(t.updated_at)).getTime(), untilMs);
      if (updated > created) durationSum += (updated - created) / 1000;
      hourBuckets[amsterdamHour(String(t.created_at))] += 1;
    }
    const peakHour = totalConversations === 0 ? null : hourBuckets.indexOf(Math.max(...hourBuckets));

    // --- berichten/gesprek: count messages voor de maand-threads (binnen venster) ---
    let avgMessagesPerConversation = 0;
    if (totalConversations > 0) {
      const ids = threads.map((t) => String(t.id));
      const { count, error: mErr } = await sb()
        .from('v0_thread_messages')
        .select('id', { count: 'exact', head: true })
        .in('thread_id', ids)
        .lt('created_at', untilIso);
      const messageCount = mErr ? 0 : (count ?? 0);
      avgMessagesPerConversation = Number((messageCount / totalConversations).toFixed(1));
    }

    return {
      totalConversations,
      uniqueVisitors: visitors.size,
      avgDurationSeconds: totalConversations > 0 ? Math.round(durationSum / totalConversations) : 0,
      avgMessagesPerConversation,
      unansweredCount: turn.unansweredCount,
      totalTurns: turn.totalTurns,
      peakHour,
    };
  } catch {
    return EMPTY_STATS;
  }
}

/** query_log-tellingen (totaal + fallback) binnen [since, until). */
async function getTurnStats(
  organizationId: string,
  sinceIso: string,
  untilIso: string,
): Promise<{ totalTurns: number; unansweredCount: number }> {
  try {
    const [totalRes, fbRes] = await Promise.all([
      sb()
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso),
      sb()
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
// Top-vragen + onbeantwoorde vragen (query_log, maand-begrensd, PII-geredacteerd).
// ---------------------------------------------------------------------------

type QuestionAgg = { question: string; count: number; lastAskedAt: string; lastKind: string };

/** Groepeer query_log (kind in answer|fallback) per genormaliseerde vraag binnen de maand. */
async function aggregateQuestions(
  organizationId: string,
  sinceIso: string,
  untilIso: string,
): Promise<QuestionAgg[]> {
  const { data, error } = await sb()
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
    if (!raw) continue;
    const question = redactPii(raw); // AVG: maskeer vóór groeperen/tonen
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

/** Top-N meest gestelde vragen van de maand (status = meest recente uitkomst). */
export async function getTopQuestionsForMonth(
  organizationId: string,
  year: number,
  month: number,
  topN = 5,
): Promise<RecapTopQuestion[]> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    const aggs = await aggregateQuestions(organizationId, sinceIso, untilIso);
    return aggs
      .sort((a, b) => b.count - a.count || (b.lastAskedAt > a.lastAskedAt ? 1 : -1))
      .slice(0, topN)
      .map((a) => ({ question: a.question, count: a.count, answered: a.lastKind !== 'fallback' }));
  } catch {
    return [];
  }
}

/** Meest voorkomende ONBEANTWOORDE (fallback) vragen van de maand, op frequentie. */
export async function getUnansweredForMonth(
  organizationId: string,
  year: number,
  month: number,
  topN = 5,
): Promise<RecapUnanswered[]> {
  const { sinceIso, untilIso } = monthRangeIso(year, month);
  try {
    const { data, error } = await sb()
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
      if (!raw) continue;
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

/** De opgeslagen recap-rij voor (org, maand), of null als nog niet gegenereerd. */
export async function getStoredRecap(
  organizationId: string,
  periodMonth: string,
): Promise<MonthlyRecap | null> {
  try {
    const { data, error } = await sb()
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

/** Triage-status per signaal-type voor een recap-rij. */
export async function getSignalTriage(
  recapId: string,
): Promise<Map<RecapSignalType, RecapSignalStatus>> {
  const out = new Map<RecapSignalType, RecapSignalStatus>();
  try {
    const { data, error } = await sb()
      .from('admin_recap_signals')
      .select('signal_type, status')
      .eq('recap_id', recapId);
    if (error || !data) return out;
    for (const r of data) out.set(r.signal_type as RecapSignalType, r.status as RecapSignalStatus);
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

/** Archief "Eerdere recaps": alle opgeslagen maanden van een org, nieuwste eerst. */
export async function listRecapMonths(organizationId: string): Promise<RecapArchiveEntry[]> {
  try {
    const { data, error } = await sb()
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

export type RecapDetail = {
  slug: OrgSlug;
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

/** Volledige detail-view voor één org+maand: live stats + signalen (triage gemerged)
 *  + opgeslagen artefacten. */
export async function getRecapDetail(slug: OrgSlug, year: number, month: number): Promise<RecapDetail> {
  const orgId = KNOWN_ORGS[slug].id;
  const periodMonth = periodMonthKey(year, month);

  const [stats, topQuestions, topUnanswered, stored] = await Promise.all([
    getRecapStats(orgId, year, month),
    getTopQuestionsForMonth(orgId, year, month),
    getUnansweredForMonth(orgId, year, month),
    getStoredRecap(orgId, periodMonth),
  ]);

  let signals = computeSignals(stats, topUnanswered);
  if (stored) {
    const triage = await getSignalTriage(stored.id);
    signals = signals.map((s) => ({ ...s, status: triage.get(s.type) ?? s.status }));
  }

  return {
    slug,
    orgId,
    name: KNOWN_ORGS[slug].name,
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

export type RecapOverviewRow = {
  slug: OrgSlug;
  name: string;
  totalConversations: number;
  uniqueVisitors: number;
  avgDurationSeconds: number;
  avgMessagesPerConversation: number;
  unansweredCount: number;
  /** Zwaarste ernst onder de actieve (niet-genegeerde) signalen; null = 🟢. */
  signalSeverity: RecapSignalSeverity | null;
  hasNotes: boolean;
  hasRecap: boolean;
};

/** Eén rij voor de cross-org overzichtstabel. Signalen LIVE berekend; de bol
 *  negeert signalen die Niels op 'genegeerd' heeft gezet. */
export async function getRecapOverviewRow(
  slug: OrgSlug,
  year: number,
  month: number,
): Promise<RecapOverviewRow> {
  const orgId = KNOWN_ORGS[slug].id;
  const periodMonth = periodMonthKey(year, month);

  const [stats, topUnanswered, stored] = await Promise.all([
    getRecapStats(orgId, year, month),
    getUnansweredForMonth(orgId, year, month),
    getStoredRecap(orgId, periodMonth),
  ]);

  let signals = computeSignals(stats, topUnanswered);
  if (stored) {
    const triage = await getSignalTriage(stored.id);
    signals = signals.filter((s) => (triage.get(s.type) ?? 'nieuw') !== 'genegeerd');
  }

  return {
    slug,
    name: KNOWN_ORGS[slug].name,
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
// WRITES — gebruikt door de server-actions (app/actions/recap.ts).
// ---------------------------------------------------------------------------

/** Vind de recap-rij voor (org, maand) of maak een minimale aan; geef het id. */
export async function getOrCreateRecapId(organizationId: string, periodMonth: string): Promise<string> {
  const read = () =>
    sb()
      .from('admin_monthly_recaps')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('period_month', periodMonth)
      .maybeSingle();

  const existing = await read();
  if (existing.data?.id) return String(existing.data.id);

  const ins = await sb()
    .from('admin_monthly_recaps')
    .insert({ organization_id: organizationId, period_month: periodMonth })
    .select('id')
    .single();
  if (ins.data?.id) return String(ins.data.id);

  // Race: een parallelle (her)generatie kan de rij net hebben aangemaakt en de
  // unique(organization_id, period_month)-constraint laten klappen → opnieuw lezen.
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

/** Partial update van de opgeslagen artefacten (raakt ALLEEN meegegeven kolommen,
 *  zodat regenereren de ai_summary ververst maar niels_notes ongemoeid laat). */
export async function updateRecapArtifacts(recapId: string, patch: RecapArtifactPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.aiSummary !== undefined) row.ai_summary = patch.aiSummary;
  if (patch.nielsNotes !== undefined) row.niels_notes = patch.nielsNotes;
  if (patch.recapStatus !== undefined) row.recap_status = patch.recapStatus;
  if (patch.generatedAt !== undefined) row.generated_at = patch.generatedAt;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb().from('admin_monthly_recaps').update(row).eq('id', recapId);
  if (error) throw new Error(`kon recap niet bijwerken: ${error.message}`);
}

/** Insert ontbrekende signaal-triage-rijen als 'nieuw'; bestaande status blijft. */
export async function ensureSignalRows(recapId: string, types: RecapSignalType[]): Promise<void> {
  if (types.length === 0) return;
  const rows = types.map((t) => ({ recap_id: recapId, signal_type: t, status: 'nieuw' as RecapSignalStatus }));
  const { error } = await sb()
    .from('admin_recap_signals')
    .upsert(rows, { onConflict: 'recap_id,signal_type', ignoreDuplicates: true });
  if (error) throw new Error(`kon signaal-rijen niet aanmaken: ${error.message}`);
}

/** Zet de triage-status van één signaal (upsert op recap_id+signal_type). */
export async function setSignalTriageStatus(
  recapId: string,
  signalType: RecapSignalType,
  status: RecapSignalStatus,
): Promise<void> {
  const { error } = await sb()
    .from('admin_recap_signals')
    .upsert(
      { recap_id: recapId, signal_type: signalType, status },
      { onConflict: 'recap_id,signal_type' },
    );
  if (error) throw new Error(`kon signaal-status niet zetten: ${error.message}`);
}
