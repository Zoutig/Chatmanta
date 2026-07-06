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
  // WP7 — RAG-internals (dev-gericht). Losse *_ms-kolommen i.p.v. phase_timings_ms
  // jsonb: goedkoper (geen parse) en al gevuld door de logger. Zie migr 0002.
  embedding_ms: number | null;
  retrieval_ms: number | null;
  rerank_ms: number | null;
  generation_ms: number | null;
  general_knowledge_actual: boolean | null;
  claim_confidence: number | null;
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
  // WP7 — RAG-internals (dev-gericht, compact). Per-fase p50 (median) over
  // gemeten rijen; GK-teller = aantal antwoorden dat algemene kennis gebruikte;
  // claim_confidence = gemiddelde verifier-confidence.
  rag: {
    embeddingP50: number | null;
    retrievalP50: number | null;
    rerankP50: number | null;
    generationP50: number | null;
    gkActual: number;
    gkChecked: number;
    claimConfAvg: number | null;
    claimConfN: number;
  };
};

/** V1-variant: gebruikt orgId (UUID) i.p.v. V0's OrgSlug. */
export type OrgBotPerf = {
  orgId: string;
  name: string;
  stats: BotPerfStats;
  injection: InjectionSummary;
};

export type RecentNegative = {
  createdAt: string;
  comment: string | null;
  question: string | null;
};

/** WP7 — injectie-telemetrie. Vaste 7/30-dagen vensters (los van de page-toggle).
 *  `patterns` = patroon-NAMEN (uit INJECTION_PATTERNS), nooit de ruwe vraag. */
export type InjectionSummary = {
  last7: number;
  last30: number;
  patterns: { name: string; count: number }[];
};

/** WP7 — ongefundeerd-feit drill-down (grounding-detail). `question` is bij
 *  write-time al PII-geredacteerd; `facts` = categorie-prefixed strings. */
export type UngroundedFact = {
  createdAt: string;
  question: string | null;
  facts: string[];
};

export type BotPerfOverview = {
  window: PerfWindow;
  orgs: OrgBotPerf[];
  aggregate: BotPerfStats;
  daily: DailyLinePoint[];
  injectionAgg: InjectionSummary;
};

export type BotPerfDetail = {
  window: PerfWindow;
  org: OrgBotPerf;
  daily: DailyLinePoint[];
  recentNegatives: RecentNegative[];
  ungroundedFacts: UngroundedFact[];
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
  const embMs: number[] = [];
  const retMs: number[] = [];
  const rerMs: number[] = [];
  const genMs: number[] = [];
  let gkActual = 0;
  let gkChecked = 0;
  let claimConfSum = 0;
  let claimConfN = 0;

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
    if (typeof r.embedding_ms === 'number') embMs.push(r.embedding_ms);
    if (typeof r.retrieval_ms === 'number') retMs.push(r.retrieval_ms);
    if (typeof r.rerank_ms === 'number') rerMs.push(r.rerank_ms);
    if (typeof r.generation_ms === 'number') genMs.push(r.generation_ms);

    if (r.general_knowledge_actual !== null) {
      gkChecked++;
      if (r.general_knowledge_actual) gkActual++;
    }
    if (typeof r.claim_confidence === 'number') {
      claimConfSum += r.claim_confidence;
      claimConfN++;
    }
  }

  ttft.sort((a, b) => a - b);
  totalMs.sort((a, b) => a - b);
  embMs.sort((a, b) => a - b);
  retMs.sort((a, b) => a - b);
  rerMs.sort((a, b) => a - b);
  genMs.sort((a, b) => a - b);
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
    rag: {
      embeddingP50: percentile(embMs, 50),
      retrievalP50: percentile(retMs, 50),
      rerankP50: percentile(rerMs, 50),
      generationP50: percentile(genMs, 50),
      gkActual,
      gkChecked,
      claimConfAvg: claimConfN > 0 ? Math.round((claimConfSum / claimConfN) * 100) / 100 : null,
      claimConfN,
    },
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
        'created_at, kind, hard_fact_supported, gap_kind, category, source_count, from_cache, first_token_ms, total_ms, embedding_ms, retrieval_ms, rerank_ms, generation_ms, general_knowledge_actual, claim_confidence',
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

// ─────────── WP7: injectie + ongefundeerd-feit fetchers ───────────────────────

const TOP_PATTERNS = 6;
/** Injectie is zeldzaam; deze cap treft geen normaal volume.
 *  ponytail: bump als een org ooit > 5000 pogingen/30d haalt. */
const MAX_INJECTION_ROWS = 5000;

export function emptyInjection(): InjectionSummary {
  return { last7: 0, last30: 0, patterns: [] };
}

/** Injectie-pogingen over vaste 7/30-dagen (los van de page-window-toggle).
 *  Pulled via de partial index `where injection_detected = true`. Alleen
 *  created_at + patroon-naam — nooit de ruwe vraag (die is de aanvalstekst). */
async function fetchOrgInjection(orgId: string): Promise<InjectionSummary> {
  try {
    const admin = await getJorionAdminClient();
    const now = Date.now();
    const since30 = new Date(now - 30 * 86_400_000).toISOString();
    const cutoff7 = now - 7 * 86_400_000;
    const { data, error } = await admin
      .from('query_log')
      .select('created_at, injection_pattern')
      .eq('organization_id', orgId)
      .eq('injection_detected', true)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(MAX_INJECTION_ROWS);
    if (error || !data) return emptyInjection();

    let last7 = 0;
    const tally = new Map<string, number>();
    for (const r of data) {
      if (new Date(r.created_at as string).getTime() >= cutoff7) last7++;
      const name = (r.injection_pattern as string | null) ?? 'onbekend';
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const patterns = [...tally.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_PATTERNS);
    return { last7, last30: data.length, patterns };
  } catch {
    return emptyInjection();
  }
}

/** Merge per-org injectie-samenvattingen tot één cross-org aggregaat. */
export function mergeInjection(list: InjectionSummary[]): InjectionSummary {
  const tally = new Map<string, number>();
  let last7 = 0;
  let last30 = 0;
  for (const s of list) {
    last7 += s.last7;
    last30 += s.last30;
    for (const p of s.patterns) tally.set(p.name, (tally.get(p.name) ?? 0) + p.count);
  }
  const patterns = [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_PATTERNS);
  return { last7, last30, patterns };
}

/** Recentste ongefundeerde feiten (hard_fact_supported = false) binnen het venster,
 *  gecapt op 20. Vraag is al PII-geredacteerd; missing_hard_facts = string-lijst. */
async function fetchOrgUngroundedFacts(orgId: string, sinceIso: string): Promise<UngroundedFact[]> {
  try {
    const admin = await getJorionAdminClient();
    const { data, error } = await admin
      .from('query_log')
      .select('created_at, question, missing_hard_facts')
      .eq('organization_id', orgId)
      .eq('hard_fact_supported', false)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return data.map((r) => ({
      createdAt: r.created_at as string,
      question: (r.question as string | null) ?? null,
      facts: Array.isArray(r.missing_hard_facts)
        ? (r.missing_hard_facts as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    }));
  } catch {
    return [];
  }
}

async function loadOrg(
  orgId: string,
  name: string,
  sinceIso: string,
): Promise<{ org: OrgBotPerf; rows: PerfRow[] }> {
  const [{ rows, capped }, feedback, injection] = await Promise.all([
    fetchOrgRows(orgId, sinceIso),
    fetchOrgFeedback(orgId, sinceIso),
    fetchOrgInjection(orgId),
  ]);
  return {
    org: { orgId, name, stats: computeBotPerfStats(rows, feedback, capped), injection },
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
    injectionAgg: mergeInjection(loaded.map((l) => l.org.injection)),
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
  const [{ rows, capped }, feedback, recentNegatives, injection, ungroundedFacts] =
    await Promise.all([
      fetchOrgRows(org.id, sinceIso),
      fetchOrgFeedback(org.id, sinceIso),
      fetchRecentNegatives(org.id, sinceIso),
      fetchOrgInjection(org.id),
      fetchOrgUngroundedFacts(org.id, sinceIso),
    ]);

  return {
    window,
    org: { orgId: org.id, name: org.name, stats: computeBotPerfStats(rows, feedback, capped), injection },
    daily: buildFallbackTrend(rows, startDate, new Date()),
    recentNegatives,
    ungroundedFacts,
  };
}
