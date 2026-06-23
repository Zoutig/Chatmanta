// V0 latency snapshot — read-only DB-laag voor de Latency-tab in de UI.
//
// Twee data-paden:
//   1. Per-window p50/p95/p99 per bot_version. Altijd raw rows uit query_log
//      + JS-percentile, ook voor window='all'. De bestaande view
//      v_latency_summary projecteert geen organization_id en zou onder de
//      service-role client (RLS-bypass) data van alle orgs mixen — niet wat
//      we willen in V0.4 multi-org. JS-aggregate over hooguit een paar
//      honderd rijen per org is verwaarloosbaar qua kosten.
//   2. Top-10 slowest queries in het window (vraag + total_ms + bot_version).
//
// Service-role client — de aanroepende server-action MOET requireV0Auth()
// hebben gedaan. RLS wordt bewust omzeild zoals in evals-snapshot.ts.
//
// Failure-mode: gooit Error bij DB-fout — server action wrapt in try/catch.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';

export type LatencyWindow = '24h' | '7d' | 'all';

export type LatencyAggregate = {
  botVersion: string;
  n: number;
  p50TotalMs: number | null;
  p95TotalMs: number | null;
  p99TotalMs: number | null;
  // TTFT (time-to-first-token, migration 0041). Alléén gevuld op streamende
  // antwoord-paden — cache-hit/smalltalk/fallback hebben NULL en vallen
  // automatisch buiten deze percentielen (cache-miss worst case = wat we tunen).
  p50FirstTokenMs: number | null;
  p95FirstTokenMs: number | null;
  p50EmbeddingMs: number | null;
  p95EmbeddingMs: number | null;
  p50RetrievalMs: number | null;
  p95RetrievalMs: number | null;
  p50RerankMs: number | null;
  p95RerankMs: number | null;
  p50GenerationMs: number | null;
  p95GenerationMs: number | null;
};

export type SlowQueryRow = {
  id: string;
  question: string;
  totalMs: number;
  botVersion: string;
  createdAt: string;
};

export type LatencySnapshot = {
  window: LatencyWindow;
  aggregates: LatencyAggregate[];
  slowest: SlowQueryRow[];
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// percentile — pure helper, geen externe lib. Voor n=0 → null. Voor n=1 → die
// waarde. Linear interpolation tussen omliggende rijen (matcht
// percentile_cont semantiek van Postgres voor de view-fallback).
// ---------------------------------------------------------------------------
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sortedAsc[lo]);
  const frac = idx - lo;
  return Math.round(sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac);
}

function aggregateFromRows(
  rows: Array<{
    bot_version: string;
    embedding_ms: number | null;
    retrieval_ms: number | null;
    rerank_ms: number | null;
    generation_ms: number | null;
    total_ms: number | null;
    first_token_ms: number | null;
  }>,
): LatencyAggregate[] {
  const byVersion = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.total_ms === null) continue;
    const list = byVersion.get(r.bot_version) ?? [];
    list.push(r);
    byVersion.set(r.bot_version, list);
  }
  const out: LatencyAggregate[] = [];
  for (const [version, vRows] of byVersion) {
    const totals = vRows.map((r) => r.total_ms!).sort((a, b) => a - b);
    const embed = vRows
      .map((r) => r.embedding_ms)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const retr = vRows
      .map((r) => r.retrieval_ms)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const rerank = vRows
      .map((r) => r.rerank_ms)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const gen = vRows
      .map((r) => r.generation_ms)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const ftt = vRows
      .map((r) => r.first_token_ms)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    out.push({
      botVersion: version,
      n: vRows.length,
      p50TotalMs: percentile(totals, 0.5),
      p95TotalMs: percentile(totals, 0.95),
      p99TotalMs: percentile(totals, 0.99),
      p50FirstTokenMs: percentile(ftt, 0.5),
      p95FirstTokenMs: percentile(ftt, 0.95),
      p50EmbeddingMs: percentile(embed, 0.5),
      p95EmbeddingMs: percentile(embed, 0.95),
      p50RetrievalMs: percentile(retr, 0.5),
      p95RetrievalMs: percentile(retr, 0.95),
      p50RerankMs: percentile(rerank, 0.5),
      p95RerankMs: percentile(rerank, 0.95),
      p50GenerationMs: percentile(gen, 0.5),
      p95GenerationMs: percentile(gen, 0.95),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// getLatencySnapshot — main entrypoint
// ---------------------------------------------------------------------------
export async function getLatencySnapshot(
  organizationId: string,
  window: LatencyWindow = '7d',
): Promise<LatencySnapshot> {
  const client = getServiceRoleClient();
  const since: string | null =
    window === '24h'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      : window === '7d'
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  // Aggregaten — altijd raw query_log + JS-percentile (zie file-header voor
  // waarom v_latency_summary view niet bruikbaar is onder service-role).
  const aggPromise = (async (): Promise<LatencyAggregate[]> => {
    let q = client
      .from('query_log')
      .select(
        'bot_version, embedding_ms, retrieval_ms, rerank_ms, generation_ms, total_ms, first_token_ms',
      )
      .eq('organization_id', organizationId)
      .not('total_ms', 'is', null);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(`query_log aggregate select: ${error.message}`);
    return aggregateFromRows(
      (data ?? []).map((r) => ({
        bot_version: r.bot_version as string,
        embedding_ms: r.embedding_ms as number | null,
        retrieval_ms: r.retrieval_ms as number | null,
        rerank_ms: r.rerank_ms as number | null,
        generation_ms: r.generation_ms as number | null,
        total_ms: r.total_ms as number | null,
        first_token_ms: r.first_token_ms as number | null,
      })),
    );
  })();

  // Slowest queries — top-10 in window.
  const slowPromise = (async (): Promise<SlowQueryRow[]> => {
    let q = client
      .from('query_log')
      .select('id, question, total_ms, bot_version, created_at')
      .eq('organization_id', organizationId)
      .not('total_ms', 'is', null)
      .order('total_ms', { ascending: false })
      .limit(10);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(`query_log slowest select: ${error.message}`);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      question: r.question as string,
      totalMs: Number(r.total_ms),
      botVersion: r.bot_version as string,
      createdAt: r.created_at as string,
    }));
  })();

  const [aggregates, slowest] = await Promise.all([aggPromise, slowPromise]);

  return {
    window,
    aggregates,
    slowest,
    generatedAt: new Date().toISOString(),
  };
}
