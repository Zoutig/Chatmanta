// V0.4 multi-org sandbox seed — schrijft 3 fake orgs (acme-corp, globex-inc,
// initech) elk met één eigen document, geïngestedt naar de v0.4 dual-level
// (parent + child) structuur. Stable UUIDs uit lib/v0/server/active-org.ts
// zodat re-seed idempotent is — bestaande orgs/docs worden ge-update.
//
// Doel: demonstreer dat retrieval scoped is op organization_id; queries van
// org A zien geen chunks van org B. Validatie via een aparte test (zie
// scripts/v0-test-org-isolation.ts).
//
// Usage:
//   npm run v0:seed-orgs

import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/server/rag';
import { KNOWN_ORGS, type OrgSlug } from '../lib/v0/server/active-org';

// Disjuncte content per org — bewust unieke entiteiten zodat een vraag over
// "ACME" niets zou moeten matchen tegen "Globex" of "Initech" tekst.
const SANDBOX_DOCS: Record<Exclude<OrgSlug, 'dev-org'>, { filename: string; text: string }> = {
  'acme-corp': {
    filename: 'acme-overview.md',
    text: `# ACME Corporation

ACME Corporation is een fictief bedrijf gespecialiseerd in aambeelden, raket-sleeën, en houtskool-explosie-pakketten. Opgericht in 1948 in Tucson, Arizona. CEO is Wile E. Coyote en Hoofd Productontwikkeling is The Roadrunner.

## Producten
- Aambeelden in elf maten (mini tot mastodon-class)
- Raket-sleeën met afstandsbediening
- Vleugel-pakken voor amateurgebruik

## Vestigingen
ACME heeft kantoren in Tucson, Albuquerque en Death Valley. Het hoofdkantoor staat in Tucson aan de 123 Coyote Way.`,
  },
  'globex-inc': {
    filename: 'globex-overview.md',
    text: `# Globex Corporation

Globex Corporation is een fictief energie- en consumer-electronics conglomeraat. Opgericht door Hank Scorpio en gevestigd in Cypress Creek. Bekende klanten omvatten meerdere super-villains en de UN.

## Diensten
- Hyperloop-tunnels onder de Pacific
- Doomsday devices voor business-clients
- Office space rentals in Cypress Creek

## Leiderschap
Founder Hank Scorpio leidt Globex sinds dag één. CFO is Homer Simpson (project lead Hyperloop divisie).`,
  },
  initech: {
    filename: 'initech-overview.md',
    text: `# Initech Inc

Initech is een fictief software-ontwikkelbedrijf in Austin, Texas. Bekend van pijnlijke TPS reports en de moeilijkste boss in tech: Bill Lumbergh.

## Producten
- Banking software voor mid-market klanten
- Y2K compliance kits (legacy)

## Notable employees
- Peter Gibbons (developer, later CEO)
- Michael Bolton (developer, geen relatie tot de zanger)
- Samir Nagheenanajar (developer)
- Milton Waddams (storage officer, eindelijk eigen rode stapler)
- Bill Lumbergh (VP, gevreesde meeting-organizer)`,
  },
};

// Chunker config: matcht v0:reingest-parents (zie v0-reingest-parents.ts).
const PARENT_CHUNK_CHARS = 3200;
const PARENT_OVERLAP_CHARS = 400;
const CHILD_CHUNK_CHARS = 800;
const CHILD_OVERLAP_CHARS = 100;

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

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) fail('Missing OPENAI_API_KEY');

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sandboxSlugs: Exclude<OrgSlug, 'dev-org'>[] = ['acme-corp', 'globex-inc', 'initech'];

  console.log('--- V0.4 multi-org sandbox seed ---');
  for (const slug of sandboxSlugs) {
    const org = KNOWN_ORGS[slug];
    const doc = SANDBOX_DOCS[slug];

    // 1. Upsert organization rij — stable UUID dus simpele insert-with-conflict.
    const { error: orgErr } = await sb.from('organizations').upsert(
      { id: org.id, name: org.name, slug: org.slug },
      { onConflict: 'id' },
    );
    if (orgErr) fail(`organizations upsert (${slug}): ${orgErr.message}`);
    console.log(`✓ org   ${slug}  (${org.id})`);

    // 2. Vind of maak een document. Filter op (organization_id, filename) want
    //    documents heeft geen unique-constraint op filename.
    let docId: string;
    const { data: existing, error: selErr } = await sb
      .from('documents')
      .select('id')
      .eq('organization_id', org.id)
      .eq('filename', doc.filename)
      .is('deleted_at', null)
      .maybeSingle();
    if (selErr) fail(`document lookup (${slug}): ${selErr.message}`);
    if (existing) {
      docId = existing.id as string;
      console.log(`  ↻ doc   ${doc.filename}  (re-ingest)`);
    } else {
      const { data: newDoc, error: insErr } = await sb
        .from('documents')
        .insert({
          organization_id: org.id,
          filename: doc.filename,
          source: 'v0_local',
          status: 'processing',
          metadata: { chars: doc.text.length },
        })
        .select('id')
        .single();
      if (insErr) fail(`document insert (${slug}): ${insErr.message}`);
      docId = newDoc!.id as string;
      console.log(`  + doc   ${doc.filename}`);
    }

    // 3. Drop oude parents/chunks van dit doc (idempotency).
    await sb.from('document_chunks').delete().eq('organization_id', org.id).eq('document_id', docId);
    await sb.from('parent_chunks').delete().eq('organization_id', org.id).eq('document_id', docId);

    // 4. Hak in parents + children, embed children, insert.
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
    if (pErr) fail(`parent_chunks insert (${slug}): ${pErr.message}`);
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
    if (cErr) fail(`document_chunks insert (${slug}): ${cErr.message}`);

    await sb.from('documents').update({ status: 'ready' }).eq('id', docId);

    console.log(
      `  ✓ ${parents.length} parents, ${children.length} children, ${embed.tokens} tokens, $${embed.costUsd.toFixed(4)}`,
    );
  }

  console.log('\n✓ Klaar. Test isolatie via een chat-query met ?org=acme-corp.');
}

main().catch((err) => {
  console.error('✗ fout:', err);
  process.exit(1);
});
