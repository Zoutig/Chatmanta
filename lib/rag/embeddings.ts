// Neutrale embedding-primitief voor de RAG-laag.
//
// embedTexts is een pure infra-helper (OpenAI text-embedding-3-small, batched,
// met timeout/retry) zonder V0-specifieke data. Voorheen woonde dit in
// de V0 RAG-engine; verplaatst naar lib/rag/ zodat de pure RAG-helpers
// (o.a. claims.ts) hem kunnen gebruiken zonder een import uit de V0-laag. De
// V0-engine re-exporteert embedTexts/EmbedResult voor back-compat met
// bestaande importers (crawler, faq, scripts).
//
// 'server-only' import: gebruikt OPENAI_API_KEY — nooit in een client-bundle.

import 'server-only';

import OpenAI from 'openai';
import { AppError } from '../errors/app-error';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const EMBED_COST_PER_M_USD = 0.02;
const EMBED_BATCH_SIZE = 100;

// V0.4 latency-cap: per-batch timeout 4s + max 1 retry. OpenAI SDK v6 doet de
// retry zelf met exponential backoff op 429/5xx en op aborted timeouts. Zonder
// timeout zagen we p99=5.4s en max=6.0s op embedding-calls, helemaal binnen
// het kritieke pad. 4s + 1 retry = absolute worst-case ~8s, maar p99 zal naar
// ~4-5s zakken (SDK retried snel op transiente fouten).
const EMBED_TIMEOUT_MS = 4000;
const EMBED_MAX_RETRIES = 1;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError('INTERNAL', { message: 'OPENAI_API_KEY missing' });
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export type EmbedResult = {
  vectors: number[][];
  tokens: number;
  costUsd: number;
};

export async function embedTexts(strings: string[]): Promise<EmbedResult> {
  if (strings.length === 0) return { vectors: [], tokens: 0, costUsd: 0 };
  const vectors: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < strings.length; i += EMBED_BATCH_SIZE) {
    const batch = strings.slice(i, i + EMBED_BATCH_SIZE);
    const resp = await openai().embeddings.create(
      {
        model: EMBED_MODEL,
        input: batch,
      },
      { timeout: EMBED_TIMEOUT_MS, maxRetries: EMBED_MAX_RETRIES },
    );
    for (const item of resp.data) {
      if (item.embedding.length !== EMBED_DIM) {
        throw new AppError('EMBED_FAILED', {
          message: `expected ${EMBED_DIM}-dim, got ${item.embedding.length}`,
        });
      }
      vectors.push(item.embedding);
    }
    totalTokens += resp.usage?.total_tokens ?? 0;
  }
  return {
    vectors,
    tokens: totalTokens,
    costUsd: (totalTokens / 1_000_000) * EMBED_COST_PER_M_USD,
  };
}
