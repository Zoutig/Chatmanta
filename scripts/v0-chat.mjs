// V0 chat CLI — vraag → embed → match_chunks → threshold-check → LLM-call.
//
// Usage:
//   node --env-file=.env.local scripts/v0-chat.mjs "wat doet ChatManta?"
//
// Anti-hallucinatie hard rule (blueprint sectie 16): als geen enkele
// opgehaalde chunk de SIMILARITY_THRESHOLD haalt, valt de bot terug op de
// fallback-zin ZONDER een LLM-call te doen. Dit voorkomt dat het model gaat
// verzinnen op basis van een lege/zwakke context.

import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/embeddings.mjs';
import { chatV0 } from '../lib/v0/chat.mjs';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

// Houd in sync met lib/rag/config.ts RAG_CONFIG (canonical V1 bron).
// V0 gebruikt deze waardes hardcoded zodat .mjs geen .ts hoeft te importeren.
// SIMILARITY_THRESHOLD is een startpunt — V0-testing toont dat OpenAI
// text-embedding-3-small op NL content vaak in 0.4-0.6 range scoort zelfs
// voor goede matches. Per-tenant validatie via testset (blueprint sectie 17)
// gaat de echte waarde voor V1 bepalen. Override via --threshold=0.5.
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const TOP_K = 5;
const MAX_CONTEXT_CHARS = 12000; // ruwe stop-clip; tokens in V1
const FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

const SYSTEM_PROMPT = `Je bent een Nederlandse kennisassistent. Beantwoord de vraag van de gebruiker UITSLUITEND op basis van de gegeven context-fragmenten.

Strikte regels:
- Verzin niets. Als de context geen antwoord geeft, zeg dat letterlijk.
- Citeer feiten direct uit de context. Geen aannames.
- Antwoord in dezelfde taal als de vraag (default: Nederlands).
- Houd het antwoord beknopt en feitelijk.`;

// ---------------------------------------------------------------------------
// CLI parsing — supports `--threshold=0.5` flag, rest is the question.
// ---------------------------------------------------------------------------
let similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD;
const args = [];
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--threshold=(.+)$/);
  if (m) {
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      console.error(`✗ --threshold must be between 0 and 1 (got ${m[1]})`);
      process.exit(1);
    }
    similarityThreshold = v;
  } else {
    args.push(arg);
  }
}
const question = args.join(' ').trim();
if (!question) {
  console.error('Usage: node --env-file=.env.local scripts/v0-chat.mjs [--threshold=0.5] "<vraag>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Q:  ${question}`);
console.log('');

// ---------------------------------------------------------------------------
// 1. Embed the question
// ---------------------------------------------------------------------------
let queryVector, embedTokens, embedCostUsd;
try {
  const { vectors, tokens, costUsd } = await embedTexts([question]);
  queryVector = vectors[0];
  embedTokens = tokens;
  embedCostUsd = costUsd;
} catch (err) {
  console.error(`✗ embed failed: ${err.message}`);
  process.exit(1);
}
console.log(`embed:    ${embedTokens} tokens · $${embedCostUsd.toFixed(6)}`);

// ---------------------------------------------------------------------------
// 2. Vector search via match_chunks RPC
// ---------------------------------------------------------------------------
const { data: matches, error: rpcErr } = await sb.rpc('match_chunks', {
  p_organization_id: DEV_ORG_ID,
  query_embedding: queryVector,
  match_count: TOP_K,
});
if (rpcErr) {
  console.error(`✗ match_chunks failed: ${rpcErr.message}`);
  process.exit(1);
}

const hits = matches ?? [];
console.log(`retrieved: ${hits.length} chunks (top similarity: ${hits[0]?.similarity?.toFixed(3) ?? 'n/a'})`);

// ---------------------------------------------------------------------------
// 3. Threshold check (anti-hallucinatie)
// ---------------------------------------------------------------------------
const relevant = hits.filter((h) => h.similarity >= similarityThreshold);
if (relevant.length === 0) {
  console.log('');
  console.log('A:  ' + FALLBACK_MESSAGE);
  console.log('');
  console.log(`(no chunk passed similarity threshold ${similarityThreshold} — no LLM call)`);
  process.exit(0);
}

console.log(`relevant:  ${relevant.length}/${hits.length} pass threshold ${similarityThreshold}`);

// ---------------------------------------------------------------------------
// 4. Format context (truncate at MAX_CONTEXT_CHARS for V0 cost-cap)
// ---------------------------------------------------------------------------
let contextText = '';
let usedChunks = 0;
for (const c of relevant) {
  const block = `[chunk ${usedChunks + 1}, similarity=${c.similarity.toFixed(3)}]\n${c.content}\n\n`;
  if (contextText.length + block.length > MAX_CONTEXT_CHARS) break;
  contextText += block;
  usedChunks++;
}
console.log(`context:   ${usedChunks} chunks · ${contextText.length} chars`);

const userMessage = `CONTEXT:
${contextText.trim()}

VRAAG: ${question}`;

// ---------------------------------------------------------------------------
// 5. LLM call
// ---------------------------------------------------------------------------
let answer, inputTokens, outputTokens, chatCostUsd;
try {
  ({ text: answer, inputTokens, outputTokens, costUsd: chatCostUsd } = await chatV0({
    system: SYSTEM_PROMPT,
    userMessage,
  }));
} catch (err) {
  console.error(`✗ chat failed: ${err.message}`);
  process.exit(1);
}

console.log(`chat:      ${inputTokens}→${outputTokens} tokens · $${chatCostUsd.toFixed(6)}`);
console.log('');
console.log('A:  ' + answer.trim());
console.log('');
console.log(`Total cost: $${(embedCostUsd + chatCostUsd).toFixed(6)}`);
