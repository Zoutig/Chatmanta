// Batches-API voor volle eval-rondes (−50%, plan 016 §7). Zelfde params en dezelfde
// fail-closed interpretatie als het synchrone pad (judge-client.ts).

import type Anthropic from '@anthropic-ai/sdk';
import { buildParams, interpretMessage, JUDGE_MODEL, type JudgeCall, type JudgeResult } from './judge-client';

export async function runJudgeBatch<T>(
  client: Anthropic,
  items: { id: string; call: JudgeCall<T> }[],
  opts: { pollMs?: number; onCost: (usd: number, model: string) => void; log?: (s: string) => void },
): Promise<Map<string, JudgeResult<T>>> {
  const log = opts.log ?? console.log;
  const byId = new Map(items.map((it) => [it.id, it.call]));
  if (byId.size !== items.length) throw new Error('runJudgeBatch: dubbele custom_id');
  const batch = await client.messages.batches.create({
    requests: items.map((it) => ({ custom_id: it.id, params: buildParams(it.call) })),
  });
  log(`batch ${batch.id}: ${items.length} requests ingediend`);
  for (;;) {
    const b = await client.messages.batches.retrieve(batch.id);
    if (b.processing_status === 'ended') break;
    log(`batch ${batch.id}: ${b.request_counts.processing} bezig, ${b.request_counts.succeeded} klaar`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 30_000));
  }
  const out = new Map<string, JudgeResult<T>>();
  for await (const res of await client.messages.batches.results(batch.id)) {
    const call = byId.get(res.custom_id);
    if (!call) continue;
    if (res.result.type === 'succeeded') {
      const r = interpretMessage(res.result.message, call, { batch: true });
      opts.onCost(r.costUsd, call.model ?? JUDGE_MODEL);
      out.set(res.custom_id, r);
    } else {
      out.set(res.custom_id, { ok: false, kind: 'api', detail: `batch-resultaat: ${res.result.type}`, costUsd: 0 });
    }
  }
  // Ontbrekende ids expliciet als fout — nooit stil weglaten.
  for (const it of items) {
    if (!out.has(it.id)) out.set(it.id, { ok: false, kind: 'api', detail: 'ontbreekt in batch-resultaten', costUsd: 0 });
  }
  return out;
}
