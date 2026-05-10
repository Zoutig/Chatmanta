# Latency-inzicht UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Twee complementaire latency-views toevoegen aan de V0 chat-UI: een inline waterfall onder elk antwoord (debug per query) en een "Latency"-tab in de right-panel met aggregaten per bot-versie + slowest queries (vergelijken tussen versies).

**Architecture:** Pure presentatie op data die V0.4 al wegschrijft. `<LatencyBar>` leest `extras.phaseTimingsMs` uit de bestaande `ChatResponse`. `<LatencyView>` lazy-loadt via een nieuwe `getLatencySnapshotAction()` die twee Supabase-queries doet (per-window p50/p95 client-side berekend, plus top-10 slowest). Geen migrations, geen wijziging in `rag.ts`/`log.ts`/`threads.ts`.

**Tech Stack:** Next.js 14 App Router, React client components, server actions met `'use server'` + `requireV0Auth()`, Supabase service-role client (zelfde patroon als `evals-snapshot.ts`), CSS via `app/globals.css` met bestaande theme tokens (`--accent`, `--ok`, `--warn`, `--err`, `--fg-faint`, etc.). Playwright voor smoke-test.

**Spec:** `docs/superpowers/specs/2026-05-10-latency-insights-design.md`

---

## File structure

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/v0/server/latency-snapshot.ts` (new) | Server-only data fetcher: query `query_log` per window, bereken p50/p95/p99 in JS, fetch top-10 slowest. Mirror van `evals-snapshot.ts`. |
| `app/actions/latency.ts` (new) | Server action `getLatencySnapshotAction(window, organizationId)`. Auth-check + try/catch wrapper. |
| `app/components/latency-bar.tsx` (new) | Pure client component. Props: `phaseTimings: PhaseTimings \| undefined`. Rendert `null` of badge+expand. |
| `app/components/latency-view.tsx` (new) | Tab-content component. Lazy-load via server action, window-toggle, aggregaten card per bot-versie, slowest-list. |
| `app/components/messages.tsx` (modify) | `<LatencyBar>` toevoegen onder de bestaande `msg-head` info-regel voor `kind === 'answer'`. |
| `app/components/right-panel.tsx` (modify) | `'latency'` aan `RightTab` union, tab-knop + content-render. |
| `app/page.tsx` (modify) | `activeOrg.id` doorgeven aan `<ChatShell>` voor de `LatencyView` (volgt bestaand patroon). |
| `app/components/chat-shell.tsx` (modify) | `activeOrgId` prop doorgeven aan `<RightPanel>` → `<LatencyView>`. |
| `app/globals.css` (modify) | CSS-blok voor `.latency-bar`, `.latency-view`, `.latency-card`, `.latency-window-toggle`, `.latency-slowest`. |
| `tests/v0/latency-tab.spec.ts` (new) | Playwright smoke: tab opent, window-toggle werkt, geen JS-error in console. |

**Niet gewijzigd:** `lib/v0/server/rag.ts`, `lib/v0/server/log.ts`, `lib/v0/server/threads.ts`. Geen migrations.

---

## Task 1: LatencySnapshot type + server fetcher

**Files:**
- Create: `lib/v0/server/latency-snapshot.ts`

- [ ] **Step 1: Lees referenties**

Lees ter referentie:
- `lib/v0/server/evals-snapshot.ts` (mirror-patroon: imports, `sb()` helper, type-exports, error throwing)
- `lib/v0/server/rag.ts:23` (DEV_ORG_ID), `:805-823` (`PhaseTimings` type)
- `supabase/migrations/0010_v0_latency_profiling.sql` (kolommen + view)

- [ ] **Step 2: Maak het bestand**

Create `lib/v0/server/latency-snapshot.ts`:

```typescript
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
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck` (of `npx tsc --noEmit` als typecheck-script niet bestaat — check `package.json` scripts eerst)
Expected: PASS, no errors in `lib/v0/server/latency-snapshot.ts`.

- [ ] **Step 4: Sanity-check via een eenmalige scratch script**

Niet nodig om te schrijven — de server-action roept dit in Task 4 aan. Skip naar Task 2.

- [ ] **Step 5: Commit**

```bash
git add lib/v0/server/latency-snapshot.ts
git commit -m "feat(V0): latency snapshot fetcher (per-window p50/p95 + slowest)"
```

---

## Task 2: Server action `getLatencySnapshotAction`

**Files:**
- Create: `app/actions/latency.ts`

- [ ] **Step 1: Lees referentie**

Lees `app/actions/evals.ts` — exact mirror-patroon (`'use server'`, `requireV0Auth()`, try/catch met `{ ok, snapshot }` of `{ ok, error }` discriminated union).

- [ ] **Step 2: Maak het bestand**

Create `app/actions/latency.ts`:

```typescript
'use server';

// V0 latency-tab server action — read-only snapshot uit query_log /
// v_latency_summary. Auth: requireV0Auth() vóór elke service-role read
// (defense-in-depth boven proxy.ts).
//
// 'use server' regel: alle exports moeten async functions zijn.

import {
  getLatencySnapshot,
  type LatencySnapshot,
  type LatencyWindow,
} from '@/lib/v0/server/latency-snapshot';
import { requireV0Auth } from './_auth';

export async function getLatencySnapshotAction(
  organizationId: string,
  window: LatencyWindow,
): Promise<{ ok: true; snapshot: LatencySnapshot } | { ok: false; error: string }> {
  try {
    await requireV0Auth();
    const snapshot = await getLatencySnapshot(organizationId, window);
    return { ok: true, snapshot };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'snapshot failed' };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/latency.ts
git commit -m "feat(V0): latency snapshot server action"
```

---

## Task 3: `<LatencyBar>` inline waterfall component

**Files:**
- Create: `app/components/latency-bar.tsx`

- [ ] **Step 1: Maak het bestand**

Create `app/components/latency-bar.tsx`:

```typescript
'use client';

// LatencyBar — inline waterfall onder elke assistant-message met
// kind === 'answer'. Default ingeklapt: alleen badge "⏱ 3.4s ▾". Klik =
// expand naar horizontale stacked bar + legenda. Pure presentatie; data
// komt via prop uit ChatResponse.extras.phaseTimingsMs.
//
// Rendert null als phaseTimings undefined of total_ms onbruikbaar (0/NaN).

import { useState } from 'react';
import type { PhaseTimings } from '@/lib/v0/server/rag';

type PhaseKey = keyof PhaseTimings;

// Kleuren — consistent met het mockup en de Latency-tab.
const PHASE_COLOR: Record<string, string> = {
  embedding_ms: '#7aa2f7',
  retrieval_ms: '#9ece6a',
  rerank_ms: '#e0af68',
  generation_ms: '#f06e8c',
  preprocess_ms: '#bb9af7',
  cache_lookup_ms: '#7dcfff',
  decompose_ms: '#bb9af7',
  hyde_ms: '#bb9af7',
  expand_ms: '#bb9af7',
  verify_ms: '#a9b1d6',
  followups_ms: '#a9b1d6',
  cascade_ms: '#a9b1d6',
};

const PHASE_LABEL: Record<string, string> = {
  embedding_ms: 'embed',
  retrieval_ms: 'retrieval',
  rerank_ms: 'rerank',
  generation_ms: 'generation',
  preprocess_ms: 'preprocess',
  cache_lookup_ms: 'cache',
  decompose_ms: 'decompose',
  hyde_ms: 'hyde',
  expand_ms: 'expand',
  verify_ms: 'verify',
  followups_ms: 'followups',
  cascade_ms: 'cascade',
};

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function LatencyBar({ phaseTimings }: { phaseTimings: PhaseTimings | undefined }) {
  const [open, setOpen] = useState(false);

  if (!phaseTimings) return null;
  const total = phaseTimings.total_ms;
  if (!Number.isFinite(total) || total <= 0) return null;

  // Verzamel non-zero non-total fases in de volgorde waarin ze in de pipeline
  // ongeveer voorkomen. Zo blijft de stacked-bar leesbaar.
  const ORDER: PhaseKey[] = [
    'preprocess_ms',
    'cache_lookup_ms',
    'decompose_ms',
    'hyde_ms',
    'expand_ms',
    'embedding_ms',
    'retrieval_ms',
    'rerank_ms',
    'generation_ms',
    'verify_ms',
    'followups_ms',
    'cascade_ms',
  ];
  const phases = ORDER.flatMap((k) => {
    const v = phaseTimings[k];
    if (typeof v !== 'number' || v <= 0) return [];
    return [{ key: k as string, ms: v }];
  });

  if (phases.length === 0) {
    // Toon alleen totaal als badge — geen breakdown.
    return (
      <div className="latency-bar collapsed">
        <span className="latency-badge">⏱ {formatMs(total)}</span>
      </div>
    );
  }

  return (
    <div className="latency-bar">
      <button
        type="button"
        className="latency-badge latency-badge-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        ⏱ {formatMs(total)} {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div className="latency-bar-detail">
          <div className="latency-stacked" role="img" aria-label="Per-fase latency breakdown">
            {phases.map((p) => {
              const pct = (p.ms / total) * 100;
              return (
                <span
                  key={p.key}
                  className="latency-stacked-seg"
                  style={{ width: `${pct}%`, background: PHASE_COLOR[p.key] ?? '#a9b1d6' }}
                  title={`${PHASE_LABEL[p.key] ?? p.key}: ${formatMs(p.ms)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className="latency-legend">
            {phases.map((p) => (
              <span key={p.key} className="latency-legend-item">
                <span
                  className="latency-legend-swatch"
                  style={{ background: PHASE_COLOR[p.key] ?? '#a9b1d6' }}
                  aria-hidden="true"
                />
                <span className="latency-legend-label">
                  {PHASE_LABEL[p.key] ?? p.key}
                </span>
                <span className="latency-legend-ms">{formatMs(p.ms)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/latency-bar.tsx
git commit -m "feat(V0): LatencyBar component (inline waterfall)"
```

---

## Task 4: CSS voor LatencyBar + LatencyView (toevoegen aan globals.css)

**Files:**
- Modify: `app/globals.css` (append at end)

- [ ] **Step 1: Bevestig append-positie**

Run: `wc -l app/globals.css` (of in PowerShell `(Get-Content app/globals.css).Length`).
Onthoud het regel-aantal — we appenden aan het einde, geen inline-edit.

- [ ] **Step 2: Append CSS**

Voeg deze blok toe aan **het einde van `app/globals.css`**:

```css
/* ===== Latency-bar (inline waterfall onder assistant message) ===== */
.latency-bar {
  margin-top: 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--fg-muted);
}
.latency-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid transparent;
}
.latency-badge-button {
  cursor: pointer;
  font: inherit;
}
.latency-badge-button:hover {
  border-color: var(--border-bright);
}
.latency-bar-detail {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg-soft, rgba(120, 200, 230, 0.04));
  border: 1px solid var(--border);
  border-radius: 4px;
  max-width: 520px;
}
.latency-stacked {
  display: flex;
  height: 12px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--border);
}
.latency-stacked-seg {
  display: block;
  height: 100%;
  transition: opacity 120ms ease;
}
.latency-stacked-seg:hover {
  opacity: 0.85;
}
.latency-legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 4px 10px;
  margin-top: 8px;
  font-size: 10px;
}
.latency-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.latency-legend-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 1px;
}
.latency-legend-label {
  color: var(--fg-muted);
}
.latency-legend-ms {
  margin-left: auto;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}

/* ===== Latency-tab (right-panel) ===== */
.latency-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--font-mono, ui-monospace, monospace);
}
.latency-window-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 2px;
  background: var(--bg-soft, rgba(120, 200, 230, 0.04));
  border-radius: 4px;
  width: fit-content;
}
.latency-window-toggle button {
  background: transparent;
  border: 0;
  padding: 4px 10px;
  font: inherit;
  font-size: 10px;
  color: var(--fg-muted);
  border-radius: 3px;
  cursor: pointer;
}
.latency-window-toggle button.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.latency-window-toggle button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.latency-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-faint);
  margin-bottom: 4px;
}
.latency-card {
  padding: 10px 12px;
  background: var(--bg-soft, rgba(120, 200, 230, 0.04));
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 6px;
}
.latency-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 11px;
}
.latency-card-version {
  color: var(--accent);
  font-weight: 500;
}
.latency-card-n {
  color: var(--fg-faint);
  font-size: 10px;
}
.latency-card-grid {
  display: grid;
  grid-template-columns: 70px 1fr 1fr;
  gap: 3px 8px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.latency-card-grid-label {
  color: var(--fg-faint);
}
.latency-card-grid-header {
  color: var(--fg-faint);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.latency-slowest {
  display: flex;
  flex-direction: column;
}
.latency-slowest-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: baseline;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
}
.latency-slowest-row:last-child {
  border-bottom: 0;
}
.latency-slowest-q {
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latency-slowest-ms {
  font-variant-numeric: tabular-nums;
  color: var(--err);
}
.latency-slowest-ms.warn {
  color: var(--warn);
}
.latency-slowest-meta {
  color: var(--fg-faint);
  font-size: 9px;
}
.latency-empty {
  color: var(--fg-faint);
  font-size: 11px;
  padding: 12px 0;
  text-align: center;
}
```

- [ ] **Step 3: Sanity-check**

Open `app/globals.css` op de laatste 20 regels en bevestig dat de blok aanwezig is. Geen syntax-errors (alle `}` gesloten).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style(V0): CSS voor LatencyBar + LatencyView"
```

---

## Task 5: `<LatencyView>` tab-content component

**Files:**
- Create: `app/components/latency-view.tsx`

- [ ] **Step 1: Lees referentie**

Lees `app/components/evals-view.tsx` lines 1-90 voor het lazy-load patroon (state, useEffect, error/loading/empty branches, refresh-knop).

- [ ] **Step 2: Maak het bestand**

Create `app/components/latency-view.tsx`:

```typescript
'use client';

// LatencyView — tab in right-panel. Lazy-load via getLatencySnapshotAction.
// Window-toggle (24u / 7d / all) triggert nieuwe fetch. Toont aggregate-card
// per bot-versie + lijst slowest queries (top 10) zonder klik-door.

import { useCallback, useEffect, useState } from 'react';
import { getLatencySnapshotAction } from '../actions/latency';
import type {
  LatencyAggregate,
  LatencySnapshot,
  LatencyWindow,
  SlowQueryRow,
} from '@/lib/v0/server/latency-snapshot';

const WINDOWS: { key: LatencyWindow; label: string }[] = [
  { key: '24h', label: '24u' },
  { key: '7d', label: '7d' },
  { key: 'all', label: 'all' },
];

export function LatencyView({ organizationId }: { organizationId: string }) {
  const [window, setWindow] = useState<LatencyWindow>('7d');
  const [snapshot, setSnapshot] = useState<LatencySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (w: LatencyWindow) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLatencySnapshotAction(organizationId, w);
        if (res.ok) setSnapshot(res.snapshot);
        else setError(res.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'fetch failed');
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void load(window);
  }, [load, window]);

  return (
    <div className="latency-view">
      <div className="latency-view-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="latency-window-toggle" role="tablist">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="tab"
              aria-selected={window === w.key}
              className={window === w.key ? 'active' : ''}
              onClick={() => setWindow(w.key)}
              disabled={loading}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void load(window)}
          disabled={loading}
          style={{ padding: '4px 8px', fontSize: 11 }}
        >
          {loading ? '…' : 'Vernieuwen'}
        </button>
      </div>

      {error ? (
        <p className="latency-empty" style={{ color: 'var(--err)' }}>
          Kon latency-data niet laden: {error}
        </p>
      ) : null}

      {!error && loading && !snapshot ? (
        <p className="latency-empty">Latency-data laden…</p>
      ) : null}

      {!error && snapshot ? (
        <>
          <Aggregates aggregates={snapshot.aggregates} />
          <Slowest slowest={snapshot.slowest} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Aggregates({ aggregates }: { aggregates: LatencyAggregate[] }) {
  if (aggregates.length === 0) {
    return <p className="latency-empty">Nog geen latency-data in dit venster.</p>;
  }
  // Sort: nieuwste-versie eerst (string desc — werkt voor "v0.4" > "v0.3").
  const sorted = [...aggregates].sort((a, b) =>
    a.botVersion < b.botVersion ? 1 : a.botVersion > b.botVersion ? -1 : 0,
  );
  return (
    <div>
      <div className="latency-section-label">Per bot-versie · p50 / p95</div>
      {sorted.map((a) => (
        <div key={a.botVersion} className="latency-card">
          <div className="latency-card-head">
            <span className="latency-card-version">{a.botVersion}</span>
            <span className="latency-card-n">n={a.n}</span>
          </div>
          <div className="latency-card-grid">
            <span className="latency-card-grid-header">fase</span>
            <span className="latency-card-grid-header">p50</span>
            <span className="latency-card-grid-header">p95</span>

            <span className="latency-card-grid-label">total</span>
            <span>{fmt(a.p50TotalMs)}</span>
            <span>{fmt(a.p95TotalMs)}</span>

            <span className="latency-card-grid-label">embed</span>
            <span>{fmt(a.p50EmbeddingMs)}</span>
            <span>{fmt(a.p95EmbeddingMs)}</span>

            <span className="latency-card-grid-label">retrieval</span>
            <span>{fmt(a.p50RetrievalMs)}</span>
            <span>{fmt(a.p95RetrievalMs)}</span>

            <span className="latency-card-grid-label">rerank</span>
            <span>{fmt(a.p50RerankMs)}</span>
            <span>{fmt(a.p95RerankMs)}</span>

            <span className="latency-card-grid-label">gen</span>
            <span style={{ color: 'var(--err)' }}>{fmt(a.p50GenerationMs)}</span>
            <span style={{ color: 'var(--err)' }}>{fmt(a.p95GenerationMs)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Slowest({ slowest }: { slowest: SlowQueryRow[] }) {
  if (slowest.length === 0) return null;
  return (
    <div>
      <div className="latency-section-label">Slowest queries (top {slowest.length})</div>
      <div className="latency-slowest">
        {slowest.map((r) => (
          <div key={r.id} className="latency-slowest-row">
            <span className="latency-slowest-q" title={r.question}>
              {r.question}
            </span>
            <span className={`latency-slowest-ms${r.totalMs < 5000 ? ' warn' : ''}`}>
              {fmt(r.totalMs)}
            </span>
            <span className="latency-slowest-meta">
              {r.botVersion} · {formatRelative(r.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function fmt(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}`;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'nu';
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}u`;
    if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/latency-view.tsx
git commit -m "feat(V0): LatencyView tab component (aggregaten + slowest)"
```

---

## Task 6: Hang `<LatencyBar>` in `messages.tsx`

**Files:**
- Modify: `app/components/messages.tsx`

- [ ] **Step 1: Lokaliseer insertion point**

Open `app/components/messages.tsx`. Zoek de regel:

```tsx
      {livePhase ? <PhaseLive phase={livePhase} /> : null}
```

(Verwacht rond line 388.) We voegen `<LatencyBar>` toe tussen het `</div>` van `msg-head` en deze `livePhase`-regel — dus direct boven `livePhase`.

- [ ] **Step 2: Voeg import toe**

Boven in het bestand, naast de andere component-imports (vlakbij `import { Icon } from './svg-icons';`), voeg toe:

```typescript
import { LatencyBar } from './latency-bar';
```

- [ ] **Step 3: Render `<LatencyBar>` na de message-head**

Vervang:

```tsx
      {livePhase ? <PhaseLive phase={livePhase} /> : null}
```

door:

```tsx
      {livePhase ? <PhaseLive phase={livePhase} /> : null}
      {!isStreaming && response.kind === 'answer' ? (
        <LatencyBar phaseTimings={extras?.phaseTimingsMs} />
      ) : null}
```

**Waarom `!isStreaming`:** tijdens streaming is `extras.phaseTimingsMs` nog niet gevuld; rendering wachten tot done voorkomt een 0-totaal flash.
**Waarom `kind === 'answer'`:** alleen answer-paden vullen `phaseTimingsMs` (zie `lib/v0/server/rag.ts:1589`); smalltalk/fallback krijgen niets.

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/messages.tsx
git commit -m "feat(V0): mount LatencyBar onder elke answer-message"
```

---

## Task 7: `Latency`-tab in `right-panel.tsx`

**Files:**
- Modify: `app/components/right-panel.tsx`

- [ ] **Step 1: Verbreed het `RightTab` union**

Open `app/components/right-panel.tsx`. Vervang:

```typescript
export type RightTab = 'sources' | 'claims' | 'docs' | 'settings' | 'prompt' | 'embed' | 'evals';
```

door:

```typescript
export type RightTab = 'sources' | 'claims' | 'docs' | 'settings' | 'prompt' | 'embed' | 'evals' | 'latency';
```

- [ ] **Step 2: Importeer LatencyView**

Naast de bestaande imports onderaan de import-block (vlakbij `import { EvalsView } from './evals-view';`), voeg toe:

```typescript
import { LatencyView } from './latency-view';
```

- [ ] **Step 3: Voeg `activeOrgId` aan de props toe**

Voeg `activeOrgId: string` toe aan de prop-interface én de destructuring. Volledige aangepaste prop-interface:

```typescript
}: {
  tab: RightTab;
  onTabChange: (t: RightTab) => void;
  response: ChatResponse | null;
  threshold: number;
  onThreshold: (v: number) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
  length: Length;
  onLengthChange: (l: Length) => void;
  rewriteOn: boolean;
  onToggleRewrite: () => void;
  botVersion: string;
  botSystemPrompt: string;
  bots: BotMeta[];
  botFlags: {
    cacheEnabled: boolean;
    selfReflect: boolean;
    cascadeOnLowConfidence: boolean;
    cascadeModel: string;
  };
  activeCite: number | null;
  onCiteClick: (idx: number) => void;
  docs: DocSummary[];
  activeOrgId: string;
}) {
```

En voeg `activeOrgId` toe aan de destructuring lijst bovenaan dezelfde functie:

```typescript
export function RightPanel({
  tab,
  onTabChange,
  response,
  threshold,
  onThreshold,
  tone,
  onToneChange,
  length,
  onLengthChange,
  rewriteOn,
  onToggleRewrite,
  botVersion,
  botSystemPrompt,
  bots,
  botFlags,
  activeCite,
  onCiteClick,
  docs,
  activeOrgId,
}: {
```

- [ ] **Step 4: Voeg de tab-knop toe**

In de `<div className="right-tabs" role="tablist">` blok, na de `<Tab tab="evals" ...>Evals</Tab>` regel, voeg toe:

```tsx
        <Tab tab="latency" active={tab === 'latency'} onClick={onTabChange}>
          Latency
        </Tab>
```

- [ ] **Step 5: Render de view-content**

In het `<div className="right-content">` blok, na `{tab === 'evals' ? <EvalsView /> : null}`, voeg toe:

```tsx
        {tab === 'latency' ? <LatencyView organizationId={activeOrgId} /> : null}
```

- [ ] **Step 6: Type-check**

Run: `npm run typecheck`
Expected: errors over ontbrekende `activeOrgId` prop in callers — wordt in Task 8 opgelost.

- [ ] **Step 7: Commit**

```bash
git add app/components/right-panel.tsx
git commit -m "feat(V0): Latency-tab in right-panel"
```

---

## Task 8: Pipe `activeOrgId` van `page.tsx` → `chat-shell.tsx` → `right-panel.tsx`

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/chat-shell.tsx`

- [ ] **Step 1: page.tsx — geef `activeOrg.id` mee aan ChatShell**

Open `app/page.tsx`. Lokaliseer de `<ChatShell ... />` JSX (rond line 46-65). Voeg een prop toe:

```tsx
      activeOrgId={activeOrg.id}
      activeOrgSlug={activeOrg.slug}
```

(Houd `activeOrgSlug` zoals het al is; zet `activeOrgId` ernaast.)

- [ ] **Step 2: chat-shell.tsx — accepteer en pipe door**

Open `app/components/chat-shell.tsx`. Zoek de prop-interface van `ChatShell`. Voeg toe:

```typescript
  activeOrgId: string;
```

In de destructuring + waar `<RightPanel ... />` wordt gerenderd, voeg toe:

```tsx
        activeOrgId={activeOrgId}
```

(Naast de andere right-panel props — exact hetzelfde patroon als `activeOrgSlug` als die er al doorheen gaat.)

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS — alle `activeOrgId` props zijn nu verbonden.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/components/chat-shell.tsx
git commit -m "feat(V0): pipe activeOrgId naar RightPanel voor Latency-tab"
```

---

## Task 9: Visuele verificatie via dev-server

**Files:** geen wijzigingen — alleen runtime checks.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Wacht op `Ready in <ms>` log-regel.

- [ ] **Step 2: Open de app**

In browser: `http://localhost:3000` (of `:3001` afhankelijk van wat de dev-server kiest).

- [ ] **Step 3: Verifieer LatencyBar op nieuw antwoord**

- Stel een vraag waarvan je weet dat hij een answer-pad volgt (bv. "Wat doet ChatManta?")
- Wacht tot het antwoord klaar is
- **Verwacht:** onder de `msg-head` (links naast/onder "ChatManta · v0.4 …") verschijnt een `⏱ X.Xs ▸` badge
- Klik de badge: stacked-bar verschijnt + legenda met fase + ms
- **Sanity:** percentages bij `title`-tooltip op hover van een segment moeten ongeveer kloppen (alle segmenten samen ≈ 100% van total)

- [ ] **Step 4: Verifieer LatencyBar op herladen thread**

- Refresh de pagina (F5)
- Heropen een eerdere thread via de sidebar
- **Verwacht:** badge zit ook onder oude antwoorden (data komt uit `v0_thread_messages.response.extras.phaseTimingsMs`)

- [ ] **Step 5: Verifieer Latency-tab**

- Klik in de right-panel op de "Latency" tab (helemaal rechts in de tab-rij)
- **Verwacht:** loading-state → snapshot toont aggregaten per bot-versie (mits er answers in laatste 7d zijn) + slowest-list
- Switch naar `24u`: opnieuw fetchen (loading flash) → minder of geen aggregaten
- Switch naar `all`: gebruikt de view in plaats van raw scan — moet snel zijn
- Klik "Vernieuwen": refetch zonder window-wijziging

- [ ] **Step 6: Verifieer empty-state**

- Switch naar een org zonder query-history (via de org-switcher in sidebar) — bv. `acme-corp` als die leeg is
- Open Latency-tab
- **Verwacht:** "Nog geen latency-data in dit venster."

- [ ] **Step 7: Verifieer kind=smalltalk geen badge toont**

- Stel een smalltalk-vraag ("hallo")
- **Verwacht:** geen `⏱` badge — `<LatencyBar>` rendert niets bij `kind !== 'answer'`

- [ ] **Step 8: Stop dev server**

Ctrl+C in de terminal waar `npm run dev` loopt.

- [ ] **Step 9: Commit (geen)**

Geen wijzigingen — niets te committen.

---

## Task 10: Playwright smoke-test

**Files:**
- Create: `tests/v0/latency-tab.spec.ts`

- [ ] **Step 1: Lees referentie**

Lees `tests/v0/style-toggles.spec.ts` voor structuur (test.describe, test.beforeEach, page.goto, locators). Lees ook `playwright.config.ts` (root) om te zien hoe de webServer wordt opgestart — zo weet je of `npm run dev` automatisch draait of dat tests een lopende server verwachten.

- [ ] **Step 2: Maak het bestand**

Create `tests/v0/latency-tab.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('V0 Latency tab + inline waterfall', () => {
  test('Latency-tab opent en toont window-toggle', async ({ page }) => {
    await page.goto('/');

    // Tab-knop met label "Latency" zit in de right-panel.
    const latencyTab = page.getByRole('tab', { name: /latency/i });
    await expect(latencyTab).toBeVisible();

    await latencyTab.click();

    // Window-toggle: 24u / 7d / all
    await expect(page.getByRole('tab', { name: '24u' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '7d' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'all' })).toBeVisible();

    // 7d is default-actief.
    const sevenDay = page.getByRole('tab', { name: '7d' });
    await expect(sevenDay).toHaveAttribute('aria-selected', 'true');
  });

  test('Window switch triggert nieuwe fetch (geen JS-error)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.getByRole('tab', { name: /latency/i }).click();

    await page.getByRole('tab', { name: '24u' }).click();
    // Wacht tot 24u geselecteerd is.
    await expect(page.getByRole('tab', { name: '24u' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'all' }).click();
    await expect(page.getByRole('tab', { name: 'all' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run de test**

```bash
npx playwright test tests/v0/latency-tab.spec.ts
```

Expected: PASS, both tests groen.

- [ ] **Step 4: Triage falen**

Als een test rood is:
- "tab not visible" → check dat Task 7 stap 4 daadwerkelijk de Tab-knop heeft toegevoegd
- "aria-selected niet 'true'" → check dat `<LatencyView>` `aria-selected={window === w.key}` rendert (Task 5)
- "JS-error in `errors` array" → kopieer de error en triage; meest waarschijnlijk een ontbrekende prop in een caller (regrep `activeOrgId`)

Re-run tot beide passen.

- [ ] **Step 5: Commit**

```bash
git add tests/v0/latency-tab.spec.ts
git commit -m "test(V0): Playwright smoke voor Latency-tab"
```

---

## Task 11: Final review + GRAPH update

**Files:** geen — alleen verificatie.

- [ ] **Step 1: Verifieer commit-historie**

```bash
git log --oneline -12
```

Expected: een keten van commits voor Tasks 1-10 (8-10 commits, niet 1 dikke).

- [ ] **Step 2: Run alle Playwright tests**

```bash
npx playwright test tests/v0/
```

Expected: alle bestaande tests + de nieuwe latency-tab tests groen. Als een bestaande test (theme-switch, style-toggles) faalt door iets in deze PR: triage en fix.

- [ ] **Step 3: Update graphify**

```bash
graphify update .
```

Expected: AST-only update, no API cost. Nieuwe functies (`getLatencySnapshot`, `LatencyBar`, `LatencyView`, `getLatencySnapshotAction`) worden in de graph opgenomen.

- [ ] **Step 4: Review tegen spec**

Open `docs/superpowers/specs/2026-05-10-latency-insights-design.md` en loop door:
- Architectuur (sectie "Architectuur") — ✓ A en B beide gebouwd
- Bestanden — ✓ alle nieuwe en gewijzigde files matchen
- Defaults — ✓ 7d default, ingeklapt default, kleurmapping
- Error/edge cases — ✓ alle branches uit de tabel werken
- "Niet in scope" — bevestig dat correlatie/trend/klik-door écht niet zijn ingebouwd

- [ ] **Step 5: Geen extra commit**

Niets te committen — graph-output staat in `graphify-out/` die meestal `.gitignore`'d is. Als wel tracked, optioneel committen.

---

## Self-review notes (door auteur, niet voor implementor)

**Spec coverage:** ✓ A (Task 3+6), ✓ B (Task 1+2+5+7+8), ✓ Defaults (Task 5 — 7d default, kleurmapping), ✓ Error states (Task 5 — error/loading/empty branches), ✓ "niet in scope" features echt afwezig (geen klik-door, geen trends, geen correlatie).

**Placeholders:** geen "TBD" / "implement later" / "similar to". Alle code volledig.

**Type consistency:** `LatencyWindow`, `LatencyAggregate`, `SlowQueryRow`, `LatencySnapshot` types worden in Task 1 gedefinieerd, geïmporteerd in Task 2 (action) en Task 5 (view). Identieke property namen overal (`p50TotalMs`, `botVersion`, etc.).

**Uitvoerbaarheid stap-voor-stap:** elke task is een gesloten unit. Task 6 hangt op Task 3+5 (component bestaat). Task 7 hangt op Task 5. Task 8 hangt op Task 7 (prop bestaat). Task 9-11 zijn verificatie. Volgorde is strikt.
