// V0.4 re-ingest: reconstrueer per bestaand document de oorspronkelijke tekst
// uit bestaande document_chunks, hak die opnieuw in parent (~3200 chars) en
// child (~800 chars), embed de children, en schrijf alles terug met de
// parent_chunk_id-koppeling.
//
// Werkt destructief PER DOCUMENT (drop chunks + parents van dat doc, bouw
// opnieuw op). Gewoon documents-rijen worden NOOIT verwijderd of aangepast —
// de originele documents.id en filename blijven hetzelfde.
//
// Reconstructie van originele tekst: chunks waren gemaakt met CHUNK_CHARS=2000,
// CHUNK_OVERLAP=200 (zie rag.ts). We sorteren op metadata.chunk_index en
// stripten de overlap-prefix van elke chunk na de eerste. Lossy als chunks
// individueel zijn ge-trimmed maar OK voor V0 — de eval framework verwerkt
// het verschil.
//
// Usage:
//   npm run v0:reingest-parents                    # alle docs
//   npm run v0:reingest-parents -- --doc=<uuid>    # alleen dit doc
//   npm run v0:reingest-parents -- --dry           # preview, geen schrijfacties

import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/server/rag';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

// Originele chunker config — moet matchen met rag.ts om reconstructie correct
// te hebben.
const ORIG_CHUNK_OVERLAP_CHARS = 200;

// V0.4 dual-niveau config.
const PARENT_CHUNK_CHARS = 3200; // ~800 tokens
const PARENT_OVERLAP_CHARS = 400;
const CHILD_CHUNK_CHARS = 800;   // ~200 tokens
const CHILD_OVERLAP_CHARS = 100;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseFlag(name: string): string | null {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(new RegExp(`^--${name}=(.+)$`));
    if (m) return m[1];
  }
  return null;
}
function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

const docFilter = parseFlag('doc');
const dry = hasFlag('dry');

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) fail('Missing OPENAI_API_KEY');

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Documents-lijst
  let docQuery = sb
    .from('documents')
    .select('id, filename')
    .eq('organization_id', DEV_ORG_ID)
    .is('deleted_at', null)
    .order('created_at');
  if (docFilter) docQuery = docQuery.eq('id', docFilter);
  const { data: docs, error: docsErr } = await docQuery;
  if (docsErr) fail(`documents select: ${docsErr.message}`);
  if (!docs || docs.length === 0) {
    console.log('Geen documenten gevonden — niets te re-ingest.');
    return;
  }

  console.log(`--- V0.4 re-ingest: ${docs.length} document(en) ${dry ? '(DRY RUN)' : ''} ---`);

  let totalParents = 0;
  let totalChildren = 0;
  let totalEmbedTokens = 0;
  let totalCost = 0;

  for (const doc of docs) {
    const docId = doc.id as string;
    const filename = doc.filename as string;

    // 2. Lees bestaande chunks van dit document
    const { data: oldChunks, error: oldErr } = await sb
      .from('document_chunks')
      .select('id, content, metadata')
      .eq('organization_id', DEV_ORG_ID)
      .eq('document_id', docId);
    if (oldErr) {
      console.error(`✗ ${filename}: oude chunks ophalen — ${oldErr.message}`);
      continue;
    }
    if (!oldChunks || oldChunks.length === 0) {
      console.log(`  ⊘ ${filename}: geen chunks → skip`);
      continue;
    }

    // 3. Reconstrueer originele tekst — sorteer op metadata.chunk_index en
    //    strip overlap van elke chunk na de eerste.
    const sorted = [...oldChunks].sort((a, b) => {
      const ai = (a.metadata as Record<string, unknown> | null)?.chunk_index;
      const bi = (b.metadata as Record<string, unknown> | null)?.chunk_index;
      const an = typeof ai === 'number' ? ai : 0;
      const bn = typeof bi === 'number' ? bi : 0;
      return an - bn;
    });
    let reconstructed = String(sorted[0].content ?? '');
    for (let i = 1; i < sorted.length; i++) {
      const c = String(sorted[i].content ?? '');
      // Strip alleen als de chunk groter is dan de overlap (anders edge case
      // van een hele kleine laatste chunk).
      reconstructed +=
        c.length > ORIG_CHUNK_OVERLAP_CHARS ? c.slice(ORIG_CHUNK_OVERLAP_CHARS) : c;
    }
    const charCount = reconstructed.length;

    // 4. Hak in parents en children (children per-parent, niet doc-globaal,
    //    zodat parent_index voor elk kind ondubbelzinnig is).
    const parents = chunkSliding(reconstructed, PARENT_CHUNK_CHARS, PARENT_OVERLAP_CHARS);
    if (parents.length === 0) {
      console.log(`  ⊘ ${filename}: lege reconstructie → skip`);
      continue;
    }
    const children: { parentIndex: number; content: string }[] = [];
    for (let pi = 0; pi < parents.length; pi++) {
      const subs = chunkSliding(parents[pi], CHILD_CHUNK_CHARS, CHILD_OVERLAP_CHARS);
      for (const s of subs) children.push({ parentIndex: pi, content: s });
    }

    console.log(
      `  ${filename}: ${charCount} chars → ${parents.length} parents × ${children.length} children`,
    );
    if (dry) {
      totalParents += parents.length;
      totalChildren += children.length;
      continue;
    }

    // 5. Embed alle children (één batch via embedTexts — dat is al batched).
    const embedResult = await embedTexts(children.map((c) => c.content));
    totalEmbedTokens += embedResult.tokens;
    totalCost += embedResult.costUsd;

    // 6. Atomair vervangen: drop oude chunks + parents van dit doc, schrijf
    //    nieuwe in dezelfde "transactie" (geen Supabase tx, dus best-effort
    //    met error-bail).
    const { error: delChunksErr } = await sb
      .from('document_chunks')
      .delete()
      .eq('organization_id', DEV_ORG_ID)
      .eq('document_id', docId);
    if (delChunksErr) {
      console.error(`✗ ${filename}: oude chunks verwijderen — ${delChunksErr.message}`);
      continue;
    }
    const { error: delParentsErr } = await sb
      .from('parent_chunks')
      .delete()
      .eq('organization_id', DEV_ORG_ID)
      .eq('document_id', docId);
    if (delParentsErr) {
      console.error(`✗ ${filename}: oude parents verwijderen — ${delParentsErr.message}`);
      continue;
    }

    // 7. Insert nieuwe parents — krijg de IDs terug zodat we children kunnen
    //    koppelen.
    const parentRows = parents.map((content, parent_index) => ({
      organization_id: DEV_ORG_ID,
      document_id: docId,
      parent_index,
      content,
    }));
    const { data: insertedParents, error: parentInsErr } = await sb
      .from('parent_chunks')
      .insert(parentRows)
      .select('id, parent_index');
    if (parentInsErr) {
      console.error(`✗ ${filename}: parents insert — ${parentInsErr.message}`);
      continue;
    }
    const parentIdByIndex = new Map<number, string>(
      (insertedParents ?? []).map((p) => [p.parent_index as number, p.id as string]),
    );

    // 8. Insert nieuwe children met parent_chunk_id en embedding.
    const childRows = children.map((c, i) => ({
      organization_id: DEV_ORG_ID,
      document_id: docId,
      content: c.content,
      embedding: embedResult.vectors[i],
      metadata: { chunk_index: i, parent_index: c.parentIndex },
      parent_chunk_id: parentIdByIndex.get(c.parentIndex) ?? null,
    }));
    const { error: childInsErr } = await sb.from('document_chunks').insert(childRows);
    if (childInsErr) {
      console.error(`✗ ${filename}: children insert — ${childInsErr.message}`);
      continue;
    }

    totalParents += parents.length;
    totalChildren += children.length;
    console.log(
      `  ✓ ${filename}: ${parents.length} parents, ${children.length} children, ${embedResult.tokens} tokens, $${embedResult.costUsd.toFixed(4)}`,
    );
  }

  console.log('');
  console.log(
    `--- Klaar ${dry ? '(DRY)' : ''}: ${totalParents} parents, ${totalChildren} children, ${totalEmbedTokens} embed-tokens, $${totalCost.toFixed(4)} ---`,
  );
}

// Sliding-window chunker, identiek qua patroon aan rag.ts maar met aanpasbare
// chunk-grootte en overlap. Trimt elk slice; lege slices worden geskipt.
function chunkSliding(text: string, size: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= size) return [trimmed];
  const stride = size - overlap;
  if (stride <= 0) throw new Error(`bad config: size=${size}, overlap=${overlap}`);
  const out: string[] = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    const slice = trimmed.slice(start, start + size).trim();
    if (slice.length > 0) out.push(slice);
    if (start + size >= trimmed.length) break;
  }
  return out;
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
