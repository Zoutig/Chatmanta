// WP4 backfill — embed bestaande actieve handmatige Q&A's die nog géén
// ingestedDocId hebben, zodat ze meteen in de vector-/hybrid-search meedingen
// (nieuwe/bewerkte Q&A's regelen dit voortaan zelf via upsertQAItem).
//
//   Dry-run:   node --env-file=.env.local scripts/v0-backfill-manual-qa.mjs
//   Toepassen: node --env-file=.env.local scripts/v0-backfill-manual-qa.mjs --apply
//
// Idempotent: een Q&A met ingestedDocId wordt overgeslagen. Q&A's zijn kort →
// één chunk per Q&A (zelfde 'Vraag: … Antwoord: …'-format als ingestQAForItem).

import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/embeddings.mjs';

const apply = process.argv.includes('--apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('✗ Missing Supabase env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await sb
  .from('v0_org_settings')
  .select('organization_id, qa');
if (error) { console.error(`✗ ${error.message}`); process.exit(1); }

let toIngest = 0;
let done = 0;
for (const row of rows ?? []) {
  const orgId = row.organization_id;
  const qa = Array.isArray(row.qa) ? row.qa : [];
  const pending = qa.filter((q) => q && q.active && !q.ingestedDocId);
  if (pending.length === 0) continue;
  console.log(`org ${orgId}: ${pending.length} actieve Q&A('s) zonder chunk`);
  toIngest += pending.length;
  if (!apply) continue;

  let changed = false;
  for (const item of pending) {
    const text = `Vraag: ${item.question}\nAntwoord: ${item.answer}`;
    try {
      const { vectors } = await embedTexts([text]);
      const { data: doc, error: dErr } = await sb
        .from('documents')
        .insert({
          organization_id: orgId,
          filename: `Q&A: ${String(item.question).slice(0, 80)}`,
          source: 'v0_local',
          status: 'ready',
          metadata: { origin: 'manual_qa', qa_id: item.id, chars: text.length, chunk_count: 1 },
        })
        .select('id')
        .single();
      if (dErr) throw new Error(dErr.message);
      const docId = doc.id;
      const { error: cErr } = await sb.from('document_chunks').insert({
        organization_id: orgId,
        document_id: docId,
        content: text,
        embedding: vectors[0],
        metadata: { chunk_index: 0 },
      });
      if (cErr) throw new Error(cErr.message);
      item.ingestedDocId = docId;
      changed = true;
      done++;
      console.log(`  ✓ ${item.id} → doc ${docId}`);
    } catch (e) {
      console.error(`  ✗ ${item.id}: ${e.message}`);
    }
  }
  if (changed) {
    const { error: uErr } = await sb
      .from('v0_org_settings')
      .update({ qa })
      .eq('organization_id', orgId);
    if (uErr) console.error(`  ✗ settings-update org ${orgId}: ${uErr.message}`);
  }
}

console.log(
  apply
    ? `\n✓ ${done} Q&A('s) ge-embed.`
    : `\nDry-run — ${toIngest} Q&A('s) zouden ge-embed worden. Voeg --apply toe.`,
);
