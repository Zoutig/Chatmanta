// V0 klantendashboard — "Meest gestelde vragen" snapshot (M4 backend).
//
// Version-agnostic, semantisch-geclusterde snapshot van de meest gestelde
// vragen per org. VERVANGT de live-scan in top-questions.ts: i.p.v. bij elke
// page-load de laatste 500 query_log-rijen te scannen + te dedupen, berekent
// een scheduled cron (app/api/v0/cron/faq-snapshot) periodiek een snapshot en
// persisteert die in klant_faq_snapshot. De UI leest alleen nog de laatste rij.
//
// Selectie-semantiek (identiek aan top-questions.ts):
//   - kind in ('answer','fallback')   → echte vragen waar de bot iets mee deed.
//   - skip RETENTION_REDACTED          → AVG-gewiste vraagteksten niet tonen.
//   - exclude from_cache=true          → geen feedback-loop op eigen cache-hits
//                                        (zoals de admin-engine faq-snapshot.ts).
//   - NO bot_version-filter            → de klant boeit niet welke bot 'm deed.
//   - NO 500-cap                       → alle gesprekken, maar mét volume-guard.
//
// Clustering (gedeeld met de admin-engine via faq-cluster.ts):
//   exact-string dedupe → embed unieke vragen → greedy single-link clustering
//   (cosine ≥ 0.88) → rank clusters op som-count desc → top-N.
//
// sb()-singleton + service-role: identiek patroon aan faq-snapshot.ts /
// top-questions.ts (V0 heeft geen user-context server-side).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from '@/lib/v0/server/rag';
import { dedupeExact, greedyCluster } from '@/lib/v0/server/faq-cluster';
import { RETENTION_REDACTED } from '@/lib/v0/retention-sentinel';
import { TOP_QUESTIONS_LIMITS } from '@/lib/v0/klantendashboard/types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// Config / cost guards
// ---------------------------------------------------------------------------

/** Hoeveel clusters bewaren we per snapshot. = topNMax (100) zodat ELKE geldige
 *  klant-config (topN ≤ 100) genoeg items in de snapshot heeft; de READ-tijd
 *  filter (minCount/topN in M5) slicet verder zonder herberekening. Eerder 20,
 *  wat topN-waarden boven 20 stil afkapte (Codex M5 #5). */
const TOP_N = TOP_QUESTIONS_LIMITS.topNMax;

/** Volume-guard: harde cap op het aantal UNIEKE vragen dat we embedden per org
 *  per run. Bij overschrijding: neem de top-MAX_UNIQUE op count desc en log een
 *  warning. Embeddings zijn de enige kostenpost; dit cap-t worst-case spend +
 *  de greedy O(n·clusters) clustering-tijd. */
const MAX_UNIQUE = 2000;

/** USD-plafond per org per run voor de batch-embed. embedTexts geeft de echte
 *  costUsd terug ná de call; we kunnen niet vóóraf hard aborten zonder te
 *  embedden, dus we (a) cappen het volume via MAX_UNIQUE en (b) loggen luid als
 *  de werkelijke kost dit plafond overschrijdt. Voor ~2000 korte NL-vragen
 *  (~15 tokens elk) bij text-embedding-3-small (~$0.00002/1k tok) is de
 *  werkelijke kost ~$0.0006 — ruim 400× onder dit plafond. */
const MAX_EMBED_USD = 0.25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KlantFaqStatus = 'answered' | 'unanswered';

export type KlantFaqItem = {
  rank: number;
  /** Representative = meest recente exact-string variant in de cluster. */
  question: string;
  /** Som van alle hits over de cluster. */
  count: number;
  lastAskedAt: string;
  /** Status van de meest recente member: answered (kind='answer') of
   *  unanswered (kind='fallback'). */
  lastStatus: KlantFaqStatus;
  /** Alle exact-string varianten in de cluster (gededupliceerd). */
  memberQuestions: string[];
};

export type KlantFaqSnapshot = {
  id: string;
  organizationId: string;
  generatedAt: string;
  totalUnique: number;
  totalQueries: number;
  embedCostUsd: number;
  items: KlantFaqItem[];
};

// ---------------------------------------------------------------------------
// Read — laatste snapshot per org
// ---------------------------------------------------------------------------

/**
 * Lees de meest recente klant_faq_snapshot-rij voor de org. null als er nog
 * geen snapshot is. Defensief op een nog niet-toegepaste migratie → null.
 */
export async function getKlantFaqSnapshot(
  orgId: string,
): Promise<KlantFaqSnapshot | null> {
  try {
    const { data, error } = await sb()
      .from('klant_faq_snapshot')
      .select('id, organization_id, generated_at, items, total_unique, total_queries, embed_cost_usd')
      .eq('organization_id', orgId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return rowToSnapshot(data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compute + persist
// ---------------------------------------------------------------------------

type RawRow = { question: string; kind: string; created_at: string };

/** Tussenstand per unieke vraag: dedupeExact-resultaat + last_status van de
 *  meest recente member (status zit niet in DedupeEntry, die tracken we apart). */
type StatusByQuestion = Map<string, { status: KlantFaqStatus; lastAsked: string }>;

/**
 * Bereken een nieuwe snapshot voor de org en persisteer 'm in
 * klant_faq_snapshot. Append-only (insert), de cron beslist over cadans.
 * Lege org → lege snapshot (zodat de UI "echt geen vragen" kan tonen).
 */
export async function computeKlantFaqSnapshot(
  orgId: string,
): Promise<KlantFaqSnapshot> {
  const client = sb();

  // 1. ALLE kandidaat-rijen ophalen — geen bot_version-filter, geen 500-cap.
  //    PostgREST capt één SELECT op ~1000 rijen, wat de "alle gesprekken"-
  //    telling stil zou afkappen (Codex M4 #1) → pagineer met .range() tot een
  //    niet-volle pagina terugkomt. Secundaire sort op id maakt de paginering
  //    stabiel bij gelijke created_at; MAX_ROWS is een veiligheidsklep.
  const PAGE = 1000;
  const MAX_ROWS = 200_000;
  const rawRows: Array<RawRow & { from_cache?: boolean | null }> = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data: page, error } = await client
      .from('query_log')
      .select('question, kind, created_at, from_cache')
      .eq('organization_id', orgId)
      .in('kind', ['answer', 'fallback'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`query_log select: ${error.message}`);
    if (!page || page.length === 0) break;
    rawRows.push(...(page as Array<RawRow & { from_cache?: boolean | null }>));
    if (page.length < PAGE) break;
  }

  // Exclude from_cache=true (feedback-loop) + skip lege/RETENTION_REDACTED.
  // from_cache null is acceptabel (oude rijen) — alleen expliciet true weg.
  const rows: RawRow[] = rawRows
    .filter((r) => r.from_cache !== true)
    .filter((r) => {
      const q = String(r.question ?? '').trim();
      return q.length > 0 && q !== RETENTION_REDACTED;
    });
  const totalQueries = rows.length;

  // 2. Exact-string dedupe (gedeeld met admin-engine) + per-vraag status-track.
  const entries = dedupeExact(rows);
  const statusBy = buildStatusByQuestion(rows);
  const totalUnique = entries.length;

  // Empty-state: persist een lege snapshot.
  if (totalUnique === 0) {
    return persistSnapshot(client, {
      organizationId: orgId,
      items: [],
      totalUnique: 0,
      totalQueries,
      embedCostUsd: 0,
    });
  }

  // 3. Sort op count desc (greedy clustering ziet frequentste vragen eerst →
  //    die worden representatives). Pas DAARNA de volume-guard toe.
  entries.sort((a, b) => b.count - a.count || (b.lastAsked > a.lastAsked ? 1 : -1));

  let embedEntries = entries;
  if (entries.length > MAX_UNIQUE) {
    console.warn(
      `[faq-klant] org ${orgId}: ${entries.length} unieke vragen > MAX_UNIQUE (${MAX_UNIQUE}) — embed alleen top-${MAX_UNIQUE} op count`,
    );
    embedEntries = entries.slice(0, MAX_UNIQUE);
  }

  // 4. Embeddings — batchcall via gedeelde helper. Cost-plafond bewaken: we
  //    cappen vóóraf op MAX_UNIQUE en loggen luid als de werkelijke kost het
  //    plafond toch overschrijdt (defensie tegen prijs-/model-wijziging).
  const { vectors, costUsd: embedCostUsd } = await embedTexts(
    embedEntries.map((e) => e.question),
  );
  if (embedCostUsd > MAX_EMBED_USD) {
    console.warn(
      `[faq-klant] org ${orgId}: embed-kost $${embedCostUsd.toFixed(6)} > MAX_EMBED_USD ($${MAX_EMBED_USD}) — controleer volume/prijs`,
    );
  }

  // 5. Greedy clustering (cosine ≥ 0.88, gedeeld).
  const clusters = greedyCluster(embedEntries, vectors);

  // 6. Rank clusters op som-count desc, top-N.
  const ranked = clusters
    .map((c) => {
      const totalCount = c.members.reduce((sum, m) => sum + embedEntries[m].count, 0);
      const rep = embedEntries[c.repIdx];
      // last_asked = max over alle members.
      const lastAsked = c.members
        .map((m) => embedEntries[m].lastAsked)
        .reduce((max, v) => (v > max ? v : max), rep.lastAsked);
      // members met dedupe over alle variants.
      const memberQuestions = [
        ...new Set(c.members.flatMap((m) => [...embedEntries[m].variants])),
      ];
      // last_status = status van de meest recente member (op key = lowercased).
      const lastStatus = resolveClusterStatus(c.members, embedEntries, statusBy);
      return { totalCount, rep, lastAsked, lastStatus, memberQuestions };
    })
    .sort((a, b) => b.totalCount - a.totalCount || (b.lastAsked > a.lastAsked ? 1 : -1))
    .slice(0, TOP_N);

  const items: KlantFaqItem[] = ranked.map((r, i) => ({
    rank: i + 1,
    question: r.rep.question,
    count: r.totalCount,
    lastAskedAt: r.lastAsked,
    lastStatus: r.lastStatus,
    memberQuestions: r.memberQuestions,
  }));

  // 7. Persist.
  return persistSnapshot(client, {
    organizationId: orgId,
    items,
    totalUnique,
    totalQueries,
    embedCostUsd,
  });
}

// ---------------------------------------------------------------------------
// Status-tracking helpers
// ---------------------------------------------------------------------------

/** Bouw per dedupe-key (trim+lowercase) de status van de MEEST RECENTE rij.
 *  dedupeExact bewaart geen kind, dus we tracken status hier los — gelijk aan
 *  top-questions.ts: fallback→unanswered, anders answered. */
function buildStatusByQuestion(rows: RawRow[]): StatusByQuestion {
  const map: StatusByQuestion = new Map();
  for (const r of rows) {
    const key = String(r.question ?? '').trim().toLowerCase();
    if (!key) continue;
    const createdAt = String(r.created_at ?? '');
    const status: KlantFaqStatus = r.kind === 'fallback' ? 'unanswered' : 'answered';
    const existing = map.get(key);
    if (!existing || createdAt > existing.lastAsked) {
      map.set(key, { status, lastAsked: createdAt });
    }
  }
  return map;
}

/** Status van de cluster = die van de globaal meest recente member. */
function resolveClusterStatus(
  members: number[],
  entries: ReturnType<typeof dedupeExact>,
  statusBy: StatusByQuestion,
): KlantFaqStatus {
  let bestAt = '';
  let bestStatus: KlantFaqStatus = 'answered';
  for (const m of members) {
    const key = entries[m].question.trim().toLowerCase();
    const s = statusBy.get(key);
    if (s && s.lastAsked > bestAt) {
      bestAt = s.lastAsked;
      bestStatus = s.status;
    }
  }
  return bestStatus;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistSnapshot(
  client: SupabaseClient,
  input: {
    organizationId: string;
    items: KlantFaqItem[];
    totalUnique: number;
    totalQueries: number;
    embedCostUsd: number;
  },
): Promise<KlantFaqSnapshot> {
  const { data, error } = await client
    .from('klant_faq_snapshot')
    .insert({
      organization_id: input.organizationId,
      items: input.items.map(itemToJsonb),
      total_unique: input.totalUnique,
      total_queries: input.totalQueries,
      embed_cost_usd: input.embedCostUsd,
    })
    .select('id, generated_at')
    .single();
  if (error) throw new Error(`klant_faq_snapshot insert: ${error.message}`);
  return {
    id: String((data as { id: unknown }).id),
    organizationId: input.organizationId,
    generatedAt: String((data as { generated_at: unknown }).generated_at),
    totalUnique: input.totalUnique,
    totalQueries: input.totalQueries,
    embedCostUsd: input.embedCostUsd,
    items: input.items,
  };
}

// ---------------------------------------------------------------------------
// JSON-mapping — items jsonb ↔ KlantFaqItem
// ---------------------------------------------------------------------------

function itemToJsonb(it: KlantFaqItem): Record<string, unknown> {
  return {
    rank: it.rank,
    question: it.question,
    count: it.count,
    last_asked: it.lastAskedAt,
    last_status: it.lastStatus,
    member_questions: it.memberQuestions,
  };
}

function jsonbToItem(raw: unknown): KlantFaqItem {
  const r = raw as Record<string, unknown>;
  const status = r.last_status === 'unanswered' ? 'unanswered' : 'answered';
  return {
    rank: Number(r.rank ?? 0),
    question: String(r.question ?? ''),
    count: Number(r.count ?? 0),
    lastAskedAt: String(r.last_asked ?? ''),
    lastStatus: status,
    memberQuestions: Array.isArray(r.member_questions)
      ? (r.member_questions as unknown[]).map(String)
      : [],
  };
}

function rowToSnapshot(row: Record<string, unknown>): KlantFaqSnapshot {
  const itemsRaw = Array.isArray(row.items) ? (row.items as unknown[]) : [];
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    generatedAt: String(row.generated_at),
    totalUnique: Number(row.total_unique ?? 0),
    totalQueries: Number(row.total_queries ?? 0),
    embedCostUsd: Number(row.embed_cost_usd ?? 0),
    items: itemsRaw.map(jsonbToItem),
  };
}
