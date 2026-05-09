// V0 embeddings — OpenAI text-embedding-3-small (1536-dim).
//
// Model is gepind op text-embedding-3-small omdat dat (a) overeenkomt met de
// vector(1536) kolom in migratie 0002 en (b) cheap genoeg is voor V0 testing.
// Wisselen van model vereist een nieuwe migratie (kolom-dim) — niet "gewoon
// even" doen.

import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';
const DIM = 1536;
// $0.02 per 1M tokens (OpenAI prijslijst, peildatum 2026-05). Gebruik voor
// V0 cost-logging; geen contract.
const COST_PER_M_TOKENS_USD = 0.02;
// OpenAI staat tot 2048 inputs per call toe; we batchen kleiner voor
// netwerk-robuustheid.
const BATCH_SIZE = 100;

let _client = null;
function client() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing in env');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/**
 * Embed an array of strings. Order of returned vectors matches input order.
 * Empty input returns empty result.
 *
 * @param {string[]} strings
 * @returns {Promise<{vectors: number[][], tokens: number, costUsd: number}>}
 */
export async function embedTexts(strings) {
  if (!Array.isArray(strings)) throw new TypeError('embedTexts expects string[]');
  if (strings.length === 0) return { vectors: [], tokens: 0, costUsd: 0 };
  if (strings.some((s) => typeof s !== 'string' || s.length === 0)) {
    throw new Error('embedTexts: all entries must be non-empty strings');
  }

  const c = client();
  const vectors = [];
  let totalTokens = 0;

  for (let i = 0; i < strings.length; i += BATCH_SIZE) {
    const batch = strings.slice(i, i + BATCH_SIZE);
    const resp = await c.embeddings.create({ model: MODEL, input: batch });
    // OpenAI guarantees data[].index matches input order; we rely on it.
    for (const item of resp.data) {
      if (!Array.isArray(item.embedding) || item.embedding.length !== DIM) {
        throw new Error(`expected ${DIM}-dim embedding, got ${item.embedding?.length}`);
      }
      vectors.push(item.embedding);
    }
    totalTokens += resp.usage?.total_tokens ?? 0;
  }

  const costUsd = (totalTokens / 1_000_000) * COST_PER_M_TOKENS_USD;
  return { vectors, tokens: totalTokens, costUsd };
}

export const V0_EMBEDDING_CONFIG = { MODEL, DIM, BATCH_SIZE };
