// V1 admin — bot-prestaties data-laag.
//
// Port van lib/controlroom/server/bot-performance.ts met drie V1-aanpassingen:
//  1. IO via getJorionAdminClient() — V0-sb() wordt NIET geïmporteerd (module
//     trekt anders V0-sb() als side-effect mee; zelfde patroon als overview.ts).
//  2. Feedback-tabel heet `feedback`, niet `v0_feedback`.
//  3. Geen bot_version-filter — V1 draait één versie tegelijk.
//     ponytail: voeg .eq('bot_version', LATEST_V1_BOT_VERSION) toe zodra die
//     constante bestaat; zonder filter is het overzicht inclusief alle V1-traffic.
//  4. Orgs uit organizations (deleted_at IS NULL), geïdentificeerd door UUID
//     (V0 gebruikte KNOWN_ORGS-slug; V1 heeft geen OrgSlug-union).
//
// Pure functies (computeBotPerfStats, buildFallbackTrend) zijn inline gekopied
// zodat deze module geen zware V0-imports trekt. De implementatie is identiek
// aan de V0-versie; bij logica-wijzigingen beide synchroon houden.

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';

// ─────────── config ───────────────────────────────────────────────────────────

/** Onder deze drempel is elke ratio ruis → "lage volume"-staat (gedempt + badge). */
export const LOW_VOLUME_THRESHOLD = 30;
/** Cap op de smalle per-org pull; `capped` markeert "steekproef". */
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

// ─────────── types ────────────────────────────────────────────────────────────

/** Dag-trend punt — identiek aan DailyLineChart-prop-type. */
export type DailyLinePoint = { date: string; label: string; value: number };

/** Smalle per-org query_log-rij (geen vrije-tekst/jsonb). */
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

/** V1-variant: gebruikt orgId (UUID) i.p.v. V0's OrgSlug. */
export type OrgBotPerf = {
  orgId: string;
  name: string;
  stats: BotPerfStats;
};

export type RecentNegative = {
  createdAt: string;
  comment: string | null;
  question: string | null;
};

export type BotPerfOverview = {
  window: PerfWindow;
  orgs: OrgBotPerf[];
  aggregate: BotPerfStats;
  daily: DailyLinePoint[];
};

export type BotPerfDetail = {
  window: PerfWindow;
  org: OrgBotPerf;
  daily: DailyLinePoint[];
  recentNegatives: RecentNegative[];
};

// ─────────── pure helpers ────────────────────────────────────────────────────
// Gekopieerd uit lib/controlroom/server/bot-performance.ts. Geen IO.

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

// ─────────── IO ──────────────────────────────────────────────────────────────

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

/** Smalle per-org pull (geen vrije-tekst/jsonb) zonder versie-filter.
 *  ponytail: bot_version-filter weglaten — V1 draait één versie;
 *  toevoegen zodra LATEST_V1_BOT_VERSION als constante bestaat. */
async function fetchOrgRows(
  orgId: string,
  sinceIso: string,
): Promise<{ rows: PerfRow[]; capped: boolean }> {
  try {
    const admin = await getJorionAdminClient();
    const { data, error } = await admin
      .from('query_log')
      .select(
        'created_at, kind, hard_fact_supported, gap_kind, category, source_count, from_cache, first_token_ms, total_ms',
      )
      .eq('organization_id', orgId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(MAX_PERF_ROWS);
    if (error || !data) return { rows: [], capped: false };
    return { rows: data as PerfRow[], capped: data.length >= MAX_PERF_ROWS };
  } catch {
    return { rows: [], capped: false };
  }
}

/** 👍/👎-tellingen voor een org. Tabel heet `feedback` in V1 (V0: `v0_feedback`). */
async function fetchOrgFeedback(orgId: string, sinceIso: string): Promise<FeedbackCounts> {
  try {
    const admin = await getJorionAdminClient();
    const [up, down] = await Promise.all([
      admin
        .from('feedback')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('rating', 'up')
        .gte('created_at', sinceIso),
      admin
        .from('feedback')
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

/** Recente 👎-met-toelichting (drill-down). Vraagtekst via FK uit query_log. */
async function fetchRecentNegatives(orgId: string, sinceIso: string): Promise<RecentNegative[]> {
  try {
    const admin = await getJorionAdminClient();
    const { data, error } = await admin
      .from('feedback')
      .select('created_at, comment, query_log!inner(question)')
      .eq('organization_id', orgId)
      .eq('rating', 'down')
      .not('comment', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(8);
    if (error || !data) return [];
    return data.map((r) => {
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
  orgId: string,
  name: string,
  sinceIso: string,
): Promise<{ org: OrgBotPerf; rows: PerfRow[] }> {
  const [{ rows, capped }, feedback] = await Promise.all([
    fetchOrgRows(orgId, sinceIso),
    fetchOrgFeedback(orgId, sinceIso),
  ]);
  return {
    org: { orgId, name, stats: computeBotPerfStats(rows, feedback, capped) },
    rows,
  };
}

/** Cross-org overzicht: per-org fan-out + aggregaat + dag-trend.
 *  Gooit AUTH_FORBIDDEN door — de RSC-caller handelt dit af. */
export async function getBotPerfOverview(window: PerfWindow): Promise<BotPerfOverview> {
  const { startDate, sinceIso } = windowRange(window);
  const admin = await getJorionAdminClient();

  const { data: orgsData } = await admin
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const orgList = (orgsData ?? []) as Array<{ id: string; name: string }>;
  const loaded = await Promise.all(orgList.map((o) => loadOrg(o.id, o.name, sinceIso)));

  const allRows = loaded.flatMap((l) => l.rows);
  const aggFeedback = loaded.reduce<FeedbackCounts>(
    (a, l) => ({ up: a.up + l.org.stats.feedback.up, down: a.down + l.org.stats.feedback.down }),
    { up: 0, down: 0 },
  );
  const aggCapped = loaded.some((l) => l.org.stats.capped);

  return {
    window,
    orgs: loaded.map((l) => l.org),
    aggregate: computeBotPerfStats(allRows, aggFeedback, aggCapped),
    daily: buildFallbackTrend(allRows, startDate, new Date()),
  };
}

/** Per-org drill-down (orgId = UUID). Geeft null bij onbekende/verwijderde org. */
export async function getBotPerfDetail(
  orgId: string,
  window: PerfWindow,
): Promise<BotPerfDetail | null> {
  const admin = await getJorionAdminClient();

  const { data: orgData } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!orgData) return null;
  const org = orgData as { id: string; name: string };

  const { startDate, sinceIso } = windowRange(window);
  const [{ rows, capped }, feedback, recentNegatives] = await Promise.all([
    fetchOrgRows(org.id, sinceIso),
    fetchOrgFeedback(org.id, sinceIso),
    fetchRecentNegatives(org.id, sinceIso),
  ]);

  return {
    window,
    org: { orgId: org.id, name: org.name, stats: computeBotPerfStats(rows, feedback, capped) },
    daily: buildFallbackTrend(rows, startDate, new Date()),
    recentNegatives,
  };
}
