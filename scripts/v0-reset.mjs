// V0 dev-org reset — hard-deletes ALL documents + chunks in DEV_ORG_ID.
//
// Bewust géén soft-delete: V0 is leerprototype, we willen herhaalbare
// experimenten zonder oude rijen. De CASCADE op document_chunks.document_id
// ruimt de chunks automatisch op.
//
// In V1 is hard-delete per document een service-role admin actie; soft-delete
// is de default voor klant-zichtbare flows (blueprint sectie 27).
//
// Run: npm run v0:reset
//
// Veiligheidsclausule: weigert te draaien als DEV_ORG_ID ergens anders dan
// de gezaaide UUID heen wijst. Dit voorkomt dat een copy-paste-fout per
// ongeluk een echte tenant leegmaakt.

import { createClient } from '@supabase/supabase-js';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
if (!DEV_ORG_ID.endsWith('00d0')) {
  console.error('✗ Refuse to run: DEV_ORG_ID does not match expected V0 dev-org sentinel');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing Supabase env');
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Count first so the user sees what's about to disappear.
const { count: docCount } = await sb
  .from('documents')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', DEV_ORG_ID);
const { count: chunkCount } = await sb
  .from('document_chunks')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', DEV_ORG_ID);

console.log(`dev-org has ${docCount ?? 0} documents and ${chunkCount ?? 0} chunks`);

if ((docCount ?? 0) === 0 && (chunkCount ?? 0) === 0) {
  console.log('(nothing to delete)');
  process.exit(0);
}

// Delete documents → CASCADE removes chunks.
const { error: delErr } = await sb
  .from('documents')
  .delete()
  .eq('organization_id', DEV_ORG_ID);
if (delErr) {
  console.error(`✗ delete failed: ${delErr.message}`);
  process.exit(1);
}

// Belt-and-braces: delete chunks that lacked document_id (e.g. future
// website_page_id chunks from Phase 5 — none yet, but safe).
const { error: chunkDelErr } = await sb
  .from('document_chunks')
  .delete()
  .eq('organization_id', DEV_ORG_ID)
  .is('document_id', null);
if (chunkDelErr) {
  console.error(`⚠ orphan chunk cleanup failed: ${chunkDelErr.message}`);
}

console.log(`✓ deleted ${docCount} documents (chunks cascaded)`);
