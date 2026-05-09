// V0 ingest CLI — file → chunks → embeddings → DB.
//
// Usage:
//   node --env-file=.env.local scripts/v0-ingest.mjs <path-to-.txt-or-.md>
//
// Schrijft tegen de seeded V0 dev-organization (geen auth, geen user-session).
// Gebruikt service-role direct ipv lib/supabase/admin.ts wrappers omdat die
// een browser/Next.js request-context vereisen via lib/auth.ts.
//
// Output: doc_id + chunk-count + token/cost summary. Bij fout wordt de
// document.status op 'failed' gezet zodat een herhaalde run niet stilletjes
// dubbel inserteert.

import { readFileSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chunkText } from '../lib/v0/chunker.mjs';
import { embedTexts } from '../lib/v0/embeddings.mjs';

// Sync met lib/v0/config.ts + migratie 0002 seed.
const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
const ALLOWED_EXT = new Set(['.txt', '.md']);

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node --env-file=.env.local scripts/v0-ingest.mjs <file>');
  process.exit(1);
}

const path = resolve(arg);
const stat = statSync(path, { throwIfNoEntry: false });
if (!stat || !stat.isFile()) {
  console.error(`✗ Not a file: ${path}`);
  process.exit(1);
}
const ext = extname(path).toLowerCase();
if (!ALLOWED_EXT.has(ext)) {
  console.error(`✗ V0 ingest only accepts .txt or .md (got ${ext})`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read + chunk
// ---------------------------------------------------------------------------
const text = readFileSync(path, 'utf8');
const chunks = chunkText(text);
console.log(`File:    ${basename(path)} (${text.length} chars)`);
console.log(`Chunks:  ${chunks.length}`);

if (chunks.length === 0) {
  console.error('✗ Empty file — nothing to ingest');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client (service-role, no session)
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// 1. Insert document row (status=processing)
// ---------------------------------------------------------------------------
const { data: doc, error: docErr } = await sb
  .from('documents')
  .insert({
    organization_id: DEV_ORG_ID,
    filename: basename(path),
    source: 'v0_local',
    status: 'processing',
    metadata: { chars: text.length, chunk_count: chunks.length },
  })
  .select('id')
  .single();
if (docErr) {
  console.error(`✗ document insert failed: ${docErr.message}`);
  process.exit(1);
}
console.log(`Doc:     ${doc.id} (status=processing)`);

// ---------------------------------------------------------------------------
// 2. Embed chunks
// ---------------------------------------------------------------------------
console.log(`Embedding ${chunks.length} chunks via OpenAI...`);
let vectors, tokens, costUsd;
try {
  ({ vectors, tokens, costUsd } = await embedTexts(chunks));
} catch (err) {
  console.error(`✗ embedding failed: ${err.message}`);
  await sb.from('documents').update({ status: 'failed' }).eq('id', doc.id);
  process.exit(1);
}
console.log(`Embed:   ${tokens} tokens · $${costUsd.toFixed(6)}`);

// ---------------------------------------------------------------------------
// 3. Insert chunks
// ---------------------------------------------------------------------------
const rows = chunks.map((content, i) => ({
  organization_id: DEV_ORG_ID,
  document_id: doc.id,
  content,
  // pgvector column accepts JSON-array via supabase-js / postgrest
  embedding: vectors[i],
  metadata: { chunk_index: i },
}));

const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
if (chunkErr) {
  console.error(`✗ chunk insert failed: ${chunkErr.message}`);
  await sb.from('documents').update({ status: 'failed' }).eq('id', doc.id);
  process.exit(1);
}
console.log(`Chunks:  ${rows.length} rows inserted`);

// ---------------------------------------------------------------------------
// 4. Mark ready
// ---------------------------------------------------------------------------
const { error: updErr } = await sb
  .from('documents')
  .update({ status: 'ready' })
  .eq('id', doc.id);
if (updErr) {
  console.error(`⚠ status update to 'ready' failed: ${updErr.message}`);
  // chunks staan al in DB; non-fatal — exit 0 maar met warning
}

console.log('');
console.log(`✓ Done. doc_id=${doc.id}, chunks=${rows.length}, tokens=${tokens}, cost=$${costUsd.toFixed(6)}`);
