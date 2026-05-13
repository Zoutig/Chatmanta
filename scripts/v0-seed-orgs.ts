// V0 multi-org sandbox seed — seed 3 fake orgs (acme-corp, globex-inc, initech)
// met realistische "scraped website"-content. Docs komen uit
// scripts/fixtures/sandbox-orgs/<slug>/*.md. Stable UUIDs uit
// lib/v0/server/active-org.ts zodat re-seed idempotent is.
//
// Per file:
//   - filename = basename (bv. "01-over-ons.md")
//   - title    = eerste H1 in de file, fallback = filename zonder ext
//   - body     = volledige file-inhoud (incl. H1)
//
// Re-seeds zijn destructive op deze 3 orgs: docs die in de DB staan maar niet
// (meer) in de fixture-folder krijgen deleted_at — zodat oude embeddings niet
// blijven lekken in eval-resultaten wanneer een file hernoemd of verwijderd
// wordt.
//
// Usage:
//   npm run v0:seed-orgs

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/server/rag';
import { KNOWN_ORGS, type OrgSlug } from '../lib/v0/server/active-org';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'sandbox-orgs');

// Chunker config: matcht v0:reingest-parents (zie v0-reingest-parents.ts).
const PARENT_CHUNK_CHARS = 3200;
const PARENT_OVERLAP_CHARS = 400;
const CHILD_CHUNK_CHARS = 800;
const CHILD_OVERLAP_CHARS = 100;

type FixtureDoc = {
  filename: string;
  title: string;
  text: string;
};

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

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function deriveTitle(filename: string, body: string): string {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('# ')) return line.slice(2).trim();
    if (line.length > 0 && !line.startsWith('#')) break;
  }
  return filename
    .replace(/\.md$/i, '')
    .replace(/^\d+[-_]?/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

async function loadOrgDocs(slug: Exclude<OrgSlug, 'dev-org'>): Promise<FixtureDoc[]> {
  const folder = join(FIXTURE_ROOT, slug);
  let entries: string[];
  try {
    entries = await readdir(folder);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      console.warn(`! folder ontbreekt: ${folder} — org ${slug} krijgt 0 docs`);
      return [];
    }
    throw err;
  }

  const mdFiles = entries
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .filter((name) => !name.startsWith('_'))
    .sort();

  const docs: FixtureDoc[] = [];
  for (const filename of mdFiles) {
    const path = join(folder, filename);
    const s = await stat(path);
    if (!s.isFile()) continue;
    const text = await readFile(path, 'utf8');
    const title = deriveTitle(filename, text);
    docs.push({ filename, title, text });
  }
  return docs;
}

async function softDeleteRemoved(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  keepFilenames: Set<string>,
): Promise<number> {
  const { data: existing, error } = await sb
    .from('documents')
    .select('id, filename')
    .eq('organization_id', orgId)
    .is('deleted_at', null);
  if (error) fail(`document scan: ${error.message}`);
  const removed = ((existing ?? []) as { id: string; filename: string }[]).filter(
    (d) => !keepFilenames.has(d.filename),
  );
  if (removed.length === 0) return 0;
  const ids = removed.map((d) => d.id);
  const { error: delErr } = await sb
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids);
  if (delErr) fail(`soft-delete: ${delErr.message}`);
  for (const d of removed) {
    console.log(`  − doc   ${d.filename}  (soft-deleted, niet meer in fixtures)`);
  }
  return removed.length;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) fail('Missing OPENAI_API_KEY');

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sandboxSlugs: Exclude<OrgSlug, 'dev-org'>[] = ['acme-corp', 'globex-inc', 'initech'];

  console.log('--- V0 multi-org sandbox seed ---');
  console.log(`fixture-root: ${FIXTURE_ROOT}\n`);

  let totalDocs = 0;
  let totalParents = 0;
  let totalChildren = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;

  for (const slug of sandboxSlugs) {
    const org = KNOWN_ORGS[slug];
    const docs = await loadOrgDocs(slug);

    const { error: orgErr } = await sb.from('organizations').upsert(
      { id: org.id, name: org.name, slug: org.slug },
      { onConflict: 'id' },
    );
    if (orgErr) fail(`organizations upsert (${slug}): ${orgErr.message}`);
    console.log(`✓ org   ${slug}  (${org.name}, ${docs.length} docs)`);

    const keep = new Set(docs.map((d) => d.filename));
    await softDeleteRemoved(sb, org.id, keep);

    for (const doc of docs) {
      let docId: string;
      const { data: existing, error: selErr } = await sb
        .from('documents')
        .select('id, deleted_at')
        .eq('organization_id', org.id)
        .eq('filename', doc.filename)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (selErr) fail(`document lookup (${slug}/${doc.filename}): ${selErr.message}`);

      if (existing) {
        docId = existing.id as string;
        const { error: updErr } = await sb
          .from('documents')
          .update({
            deleted_at: null,
            status: 'processing',
            metadata: { chars: doc.text.length, title: doc.title },
          })
          .eq('id', docId);
        if (updErr) fail(`document update (${slug}/${doc.filename}): ${updErr.message}`);
        console.log(`  ↻ doc   ${doc.filename}  (re-ingest)`);
      } else {
        const { data: newDoc, error: insErr } = await sb
          .from('documents')
          .insert({
            organization_id: org.id,
            filename: doc.filename,
            source: 'v0_local',
            status: 'processing',
            metadata: { chars: doc.text.length, title: doc.title },
          })
          .select('id')
          .single();
        if (insErr) fail(`document insert (${slug}/${doc.filename}): ${insErr.message}`);
        docId = newDoc!.id as string;
        console.log(`  + doc   ${doc.filename}`);
      }

      await sb.from('document_chunks').delete().eq('organization_id', org.id).eq('document_id', docId);
      await sb.from('parent_chunks').delete().eq('organization_id', org.id).eq('document_id', docId);

      const parents = chunkSliding(doc.text, PARENT_CHUNK_CHARS, PARENT_OVERLAP_CHARS);
      const children: { parentIndex: number; content: string }[] = [];
      for (let pi = 0; pi < parents.length; pi++) {
        const subs = chunkSliding(parents[pi], CHILD_CHUNK_CHARS, CHILD_OVERLAP_CHARS);
        for (const s of subs) children.push({ parentIndex: pi, content: s });
      }

      const embed = await embedTexts(children.map((c) => c.content));

      const parentRows = parents.map((content, parent_index) => ({
        organization_id: org.id,
        document_id: docId,
        parent_index,
        content,
      }));
      const { data: insParents, error: pErr } = await sb
        .from('parent_chunks')
        .insert(parentRows)
        .select('id, parent_index');
      if (pErr) fail(`parent_chunks insert (${slug}/${doc.filename}): ${pErr.message}`);
      const parentIdByIndex = new Map<number, string>(
        (insParents ?? []).map((p) => [p.parent_index as number, p.id as string]),
      );

      const childRows = children.map((c, i) => ({
        organization_id: org.id,
        document_id: docId,
        content: c.content,
        embedding: embed.vectors[i],
        metadata: { chunk_index: i, parent_index: c.parentIndex },
        parent_chunk_id: parentIdByIndex.get(c.parentIndex) ?? null,
      }));
      const { error: cErr } = await sb.from('document_chunks').insert(childRows);
      if (cErr) fail(`document_chunks insert (${slug}/${doc.filename}): ${cErr.message}`);

      await sb.from('documents').update({ status: 'ready' }).eq('id', docId);

      totalDocs++;
      totalParents += parents.length;
      totalChildren += children.length;
      totalTokens += embed.tokens;
      totalCostUsd += embed.costUsd;
    }
    console.log('');
  }

  console.log('--- klaar ---');
  console.log(`docs:     ${totalDocs}`);
  console.log(`parents:  ${totalParents}`);
  console.log(`children: ${totalChildren}`);
  console.log(`tokens:   ${totalTokens.toLocaleString('en-US')}`);
  console.log(`cost:     $${totalCostUsd.toFixed(4)}`);
  console.log('\nTest isolatie via een chat-query met ?org=<slug>.');
}

main().catch((err) => {
  console.error('✗ fout:', err);
  process.exit(1);
});
