// V0 latency snapshot — read-only DB-laag voor de Latency-tab in de UI.
//
// Twee data-paden:
//   1. Per-window p50/p95/p99 per bot_version. Voor '24h' en '7d' fetchen we
//      raw rijen uit query_log binnen het window en berekenen percentielen
//      in JS (de bestaande view v_latency_summary aggregeert all-history,
//      heeft geen window). Voor 'all' lezen we de view.
//   2. Top-10 slowest queries in het window (vraag + total_ms + bot_version).
//
// Service-role client — de aanroepende server-action MOET requireV0Auth()
// hebben gedaan. RLS wordt bewust omzeild zoals in evals-snapshot.ts.
//
// Failure-mode: gooit Error bij DB-fout — server action wrapt in try/catch.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEV_ORG_ID } from './rag';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

export type LatencyWindow = '24h' | '7d' | 'all';

export type LatencyAggregate = {
  botVersion: string;
  n: number;
  p50TotalMs: number | null;
  p95TotalMs: number | null;
  p99TotalMs: number | null;
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
    out.push({
      botVersion: version,
      n: vRows.length,
      p50TotalMs: percentile(totals, 0.5),
      p95TotalMs: percentile(totals, 0.95),
      p99TotalMs: percentile(totals, 0.99),
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
  organizationId: string = DEV_ORG_ID,
  window: LatencyWindow = '7d',
): Promise<LatencySnapshot> {
  const client = sb();
  const since: string | null =
    window === '24h'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      : window === '7d'
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  // Aggregaten — voor 'all' uit view, anders raw + JS-percentile.
  const aggPromise = (async (): Promise<LatencyAggregate[]> => {
    if (window === 'all') {
      const { data, error } = await client
        .from('v_latency_summary')
        .select(
          `bot_version, n,
           p50_total_ms, p95_total_ms, p99_total_ms,
           p50_embedding_ms, p95_embedding_ms,
           p50_retrieval_ms, p95_retrieval_ms,
           p50_rerank_ms, p95_rerank_ms,
           p50_generation_ms, p95_generation_ms`,
        );
      if (error) throw new Error(`v_latency_summary select: ${error.message}`);
      return (data ?? []).map((r) => ({
        botVersion: r.bot_version as string,
        n: Number(r.n ?? 0),
        p50TotalMs: r.p50_total_ms === null ? null : Number(r.p50_total_ms),
        p95TotalMs: r.p95_total_ms === null ? null : Number(r.p95_total_ms),
        p99TotalMs: r.p99_total_ms === null ? null : Number(r.p99_total_ms),
        p50EmbeddingMs: r.p50_embedding_ms === null ? null : Number(r.p50_embedding_ms),
        p95EmbeddingMs: r.p95_embedding_ms === null ? null : Number(r.p95_embedding_ms),
        p50RetrievalMs: r.p50_retrieval_ms === null ? null : Number(r.p50_retrieval_ms),
        p95RetrievalMs: r.p95_retrieval_ms === null ? null : Number(r.p95_retrieval_ms),
        p50RerankMs: r.p50_rerank_ms === null ? null : Number(r.p50_rerank_ms),
        p95RerankMs: r.p95_rerank_ms === null ? null : Number(r.p95_rerank_ms),
        p50GenerationMs: r.p50_generation_ms === null ? null : Number(r.p50_generation_ms),
        p95GenerationMs: r.p95_generation_ms === null ? null : Number(r.p95_generation_ms),
      }));
    }
    let q = client
      .from('query_log')
      .select('bot_version, embedding_ms, retrieval_ms, rerank_ms, generation_ms, total_ms')
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
