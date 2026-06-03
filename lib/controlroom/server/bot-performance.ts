// Control Room — Bot prestaties: kwaliteit/prestatie-signalen uit LIVE telemetrie.
//
// Bron = uitsluitend public.query_log + public.v0_feedback (alleen het live
// /api/v0/chat-pad schrijft die). NOOIT eval_runs (offline judge-data). De
// in-dashboard test-tool schrijft géén query_log → deze tab toont alleen echt
// bezoekersverkeer.
//
// LET OP — dit zijn PROXIES, geen accuraatheid. Live verkeer heeft geen
// ground-truth labels; er bestaat geen correctheid-% en dat hoort hier ook niet.
//
// Goedkoop-patroon: per org één smalle (geen vrije-tekst/jsonb) kolom-pull over
// het venster → alle ratio's, percentielen én de dag-trend in één pass berekend.
// Dat scheelt ~15 losse head-counts per org t.o.v. een count-fan-out, en blijft
// een smalle pull (geen volledige-rij-transfer). Feedback = 2 head-counts/org.
// Bot-versie default = LATEST_BOT_VERSION zodat een regressie niet verdund wordt
// door oude versie-historie.

import 'server-only';

import { sb } from './db';
import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { KNOWN_ORGS, listKnownOrgs, type OrgSlug } from '@/lib/v0/server/active-org';

// Dag-trend punt voor de grafiek. Structureel identiek aan de DailyLineChart-prop,
// maar bewust hier gedefinieerd zodat de data-laag niet van een app/-component afhangt.
export type DailyLinePoint = { date: string; label: string; value: number };

// Onder deze drempel is elke ratio ruis → "lage volume"-staat (gedempt + badge).
export const LOW_VOLUME_THRESHOLD = 30;
// Cap op de smalle per-org pull. V0-volume is klein; bij hard groeiend
// productievolume kapt PostgREST eerder af → `capped` markeert "steekproef".
const MAX_PERF_ROWS = 50_000;

export type PerfWindow = '30d' | 'month';
export const PERF_WINDOWS: readonly PerfWindow[] = ['30d', 'month'] as const;

export function isPerfWindow(v: string | undefined): v is PerfWindow {
  return v === '30d' || v === 'month';
}

export const WINDOW_LABEL: Record<PerfWindow, string> = {
  '30d': 'laatste 30 dagen',
  month: 'deze maand',
};

// Eén smalle query_log-rij (geen question/answer/jsonb).
type PerfRow = {
  created_at: string;
  kind: 'smalltalk' | 'answer' | 'fallback' | 'blocked' | null;
  hard_fact_supported: boolean | null;
  gap_kind: string | null;
  category: string | null;
  source_count: number | null;
  from_cache: boolean | null;
  first_token_ms: number | null;
  total_ms: number | null;
};

type FeedbackCounts = { up: number; down: number };

export type BotPerfStats = {
  total: number;
  answer: number;
  fallback: number;
  blocked: number;
  smalltalk: number;
  fallbackPct: number | null;
  groundedChecked: number;
  groundedTrue: number;
  groundedPct: number | null;
  zeroSource: number;
  zeroSourcePct: number | null;
  fromCache: number;
  fromCachePct: number | null;
  gap: { zeroHits: number; lowConfidence: number; lowGrounding: number; offTopic: number };
  gapAny: number;
  gapAnyPct: number | null;
  category: { search: number; general: number; offTopic: number; smalltalk: number };
  ttftP50: number | null;
  ttftP95: number | null;
  ttftN: number;
  totalP50: number | null;
  totalP95: number | null;
  totalN: number;
  capped: boolean;
  feedback: { up: number; down: number; downPct: number | null };
  lowVolume: boolean;
};

export type OrgBotPerf = {
  slug: OrgSlug;
  name: string;
  orgId: string;
  stats: BotPerfStats;
};

export type RecentNegative = {
  createdAt: string;
  comment: string | null;
  question: string | null;
};

export type BotPerfOverview = {
  version: string;
  window: PerfWindow;
  orgs: OrgBotPerf[];
  aggregate: BotPerfStats;
  daily: DailyLinePoint[];
};

export type BotPerfDetail = {
  version: string;
  window: PerfWindow;
  org: OrgBotPerf;
  daily: DailyLinePoint[];
  recentNegatives: RecentNegative[];
};

// ───────────────────────── pure helpers ─────────────────────────

function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

/** Lineair-geïnterpoleerd percentiel over een oplopend gesorteerde reeks. */
function percentile(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sortedAsc[lo]);
  const frac = idx - lo;
  return Math.round(sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac);
}

/** PURE: rauwe rijen + feedback-tellingen → afgeleide stats. Geen IO. */
export function computeBotPerfStats(
  rows: PerfRow[],
  feedback: FeedbackCounts,
  capped: boolean,
): BotPerfStats {
  const total = rows.length;
  let answer = 0;
  let fallback = 0;
  let blocked = 0;
  let smalltalk = 0;
  let fromCache = 0;
  let zeroSource = 0;
  let groundedChecked = 0;
  let groundedTrue = 0;
  const gap = { zeroHits: 0, lowConfidence: 0, lowGrounding: 0, offTopic: 0 };
  const category = { search: 0, general: 0, offTopic: 0, smalltalk: 0 };
  const ttft: number[] = [];
  const totalMs: number[] = [];

  for (const r of rows) {
    if (r.kind === 'answer') answer++;
    else if (r.kind === 'fallback') fallback++;
    else if (r.kind === 'blocked') blocked++;
    else if (r.kind === 'smalltalk') smalltalk++;

    if (r.from_cache) fromCache++;
    if (r.source_count === 0) zeroSource++;

    if (r.hard_fact_supported !== null) {
      groundedChecked++;
      if (r.hard_fact_supported) groundedTrue++;
    }

    if (r.gap_kind === 'zero_hits') gap.zeroHits++;
    else if (r.gap_kind === 'low_confidence') gap.lowConfidence++;
    else if (r.gap_kind === 'low_grounding') gap.lowGrounding++;
    else if (r.gap_kind === 'off_topic') gap.offTopic++;

    if (r.category === 'search') category.search++;
    else if (r.category === 'general') category.general++;
    else if (r.category === 'off_topic') category.offTopic++;
    else if (r.category === 'smalltalk') category.smalltalk++;

    if (typeof r.first_token_ms === 'number') ttft.push(r.first_token_ms);
    if (typeof r.total_ms === 'number') totalMs.push(r.total_ms);
  }

  ttft.sort((a, b) => a - b);
  totalMs.sort((a, b) => a - b);
  const gapAny = gap.zeroHits + gap.lowConfidence + gap.lowGrounding + gap.offTopic;
  const fbTotal = feedback.up + feedback.down;

  return {
    total,
    answer,
    fallback,
    blocked,
    smalltalk,
    fallbackPct: pct(fallback, total),
    groundedChecked,
    groundedTrue,
    groundedPct: pct(groundedTrue, groundedChecked),
    zeroSource,
    zeroSourcePct: pct(zeroSource, total),
    fromCache,
    fromCachePct: pct(fromCache, total),
    gap,
    gapAny,
    gapAnyPct: pct(gapAny, total),
    category,
    ttftP50: percentile(ttft, 50),
    ttftP95: percentile(ttft, 95),
    ttftN: ttft.length,
    totalP50: percentile(totalMs, 50),
    totalP95: percentile(totalMs, 95),
    totalN: totalMs.length,
    capped,
    feedback: { up: feedback.up, down: feedback.down, downPct: pct(feedback.down, fbTotal) },
    lowVolume: total < LOW_VOLUME_THRESHOLD,
  };
}

/** Lokale YYYY-MM-DD sleutel (zelfde tijdzone-conventie als usage.ts). */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** PURE: dag-trend van weiger-ratio (%) over het venster. Lege dagen → 0%. */
export function buildFallbackTrend(rows: PerfRow[], startDate: Date, today: Date): DailyLinePoint[] {
  const buckets: { date: string; label: string; total: number; fallback: number }[] = [];
  const indexByKey = new Map<string, number>();
  for (const cur = new Date(startDate); cur <= today; cur.setDate(cur.getDate() + 1)) {
    const key = dateKey(cur);
    indexByKey.set(key, buckets.length);
    buckets.push({ date: key, label: String(cur.getDate()), total: 0, fallback: 0 });
  }
  for (const r of rows) {
    const i = indexByKey.get(dateKey(new Date(r.created_at)));
    if (i == null) continue;
    buckets[i].total++;
    if (r.kind === 'fallback') buckets[i].fallback++;
  }
  return buckets.map((b) => ({
    date: b.date,
    label: b.label,
    value: b.total > 0 ? Math.round((b.fallback / b.total) * 100) : 0,
  }));
}

// ───────────────────────── IO ─────────────────────────

function windowRange(window: PerfWindow): { startDate: Date; sinceIso: string } {
  const startDate = new Date();
  if (window === 'month') {
    startDate.setDate(1);
  } else {
    startDate.setDate(startDate.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);
  return { startDate, sinceIso: startDate.toISOString() };
}

/** Smalle per-org pull (geen vrije-tekst/jsonb) gefilterd op de live versie. */
async function fetchOrgRows(
  orgId: string,
  sinceIso: string,
): Promise<{ rows: PerfRow[]; capped: boolean }> {
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select(
        'created_at, kind, hard_fact_supported, gap_kind, category, source_count, from_cache, first_token_ms, total_ms',
      )
      .eq('organization_id', orgId)
      .eq('bot_version', LATEST_BOT_VERSION)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(MAX_PERF_ROWS);
    if (error || !data) return { rows: [], capped: false };
    return { rows: data as PerfRow[], capped: data.length >= MAX_PERF_ROWS };
  } catch {
    return { rows: [], capped: false };
  }
}

/** 👍/👎-tellingen voor een org (versie-agnostisch: v0_feedback heeft geen bot_version). */
async function fetchOrgFeedback(orgId: string, sinceIso: string): Promise<FeedbackCounts> {
  try {
    const [up, down] = await Promise.all([
      sb()
        .from('v0_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('rating', 'up')
        .gte('created_at', sinceIso),
      sb()
        .from('v0_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('rating', 'down')
        .gte('created_at', sinceIso),
    ]);
    return { up: up.error ? 0 : (up.count ?? 0), down: down.error ? 0 : (down.count ?? 0) };
  } catch {
    return { up: 0, down: 0 };
  }
}

/** Recente 👎-met-toelichting (drill-down). Vraagtekst komt via FK uit query_log
 *  (al PII-geredacteerd); de comment zelf is bezoeker-vrije-tekst (niet geredacteerd,
 *  consistent met de bestaande Negatieve-feedback-view, achter de proxy-gate). */
async function fetchRecentNegatives(orgId: string, sinceIso: string): Promise<RecentNegative[]> {
  try {
    const { data, error } = await sb()
      .from('v0_feedback')
      .select('created_at, comment, query_log!inner(question)')
      .eq('organization_id', orgId)
      .eq('rating', 'down')
      .not('comment', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(8);
    if (error || !data) return [];
    return data.map((r) => {
      // PostgREST geeft een genest object terug (ook bij !inner) — zelfde
      // shape als lib/v0/klantendashboard/server/feedback.ts.
      const ql = (r as { query_log?: { question?: string | null } }).query_log;
      return {
        createdAt: r.created_at as string,
        comment: (r.comment as string | null) ?? null,
        question: ql?.question ?? null,
      };
    });
  } catch {
    return [];
  }
}

async function loadOrg(
  slug: OrgSlug,
  orgId: string,
  name: string,
  sinceIso: string,
): Promise<{ org: OrgBotPerf; rows: PerfRow[] }> {
  const [{ rows, capped }, feedback] = await Promise.all([
    fetchOrgRows(orgId, sinceIso),
    fetchOrgFeedback(orgId, sinceIso),
  ]);
  return {
    org: { slug, name, orgId, stats: computeBotPerfStats(rows, feedback, capped) },
    rows,
  };
}

/** Cross-org overzicht: per-org fan-out + aggregaat + dag-trend. */
export async function getBotPerfOverview(window: PerfWindow): Promise<BotPerfOverview> {
  const { startDate, sinceIso } = windowRange(window);
  const orgs = listKnownOrgs();
  const loaded = await Promise.all(orgs.map((o) => loadOrg(o.slug, o.id, o.name, sinceIso)));

  const allRows = loaded.flatMap((l) => l.rows);
  const aggFeedback = loaded.reduce<FeedbackCounts>(
    (a, l) => ({ up: a.up + l.org.stats.feedback.up, down: a.down + l.org.stats.feedback.down }),
    { up: 0, down: 0 },
  );
  const aggCapped = loaded.some((l) => l.org.stats.capped);

  return {
    version: LATEST_BOT_VERSION,
    window,
    orgs: loaded.map((l) => l.org),
    aggregate: computeBotPerfStats(allRows, aggFeedback, aggCapped),
    daily: buildFallbackTrend(allRows, startDate, new Date()),
  };
}

/** Per-klant drill-down (dezelfde signalen, gescoped op één org + recente 👎). */
export async function getBotPerfDetail(
  slug: OrgSlug,
  window: PerfWindow,
): Promise<BotPerfDetail | null> {
  const known = KNOWN_ORGS[slug];
  if (!known) return null;
  const { startDate, sinceIso } = windowRange(window);

  const [{ rows, capped }, feedback, recentNegatives] = await Promise.all([
    fetchOrgRows(known.id, sinceIso),
    fetchOrgFeedback(known.id, sinceIso),
    fetchRecentNegatives(known.id, sinceIso),
  ]);

  return {
    version: LATEST_BOT_VERSION,
    window,
    org: { slug, name: known.name, orgId: known.id, stats: computeBotPerfStats(rows, feedback, capped) },
    daily: buildFallbackTrend(rows, startDate, new Date()),
    recentNegatives,
  };
}
