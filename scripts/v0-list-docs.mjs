// V0 helper — list documents + chunk-counts in dev-org. Read-only, useful for
// poking around after ingest runs. Service-role; never logs key values.
//
// Run: node --env-file=.env.local scripts/v0-list-docs.mjs

import { createClient } from '@supabase/supabase-js';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing Supabase env');
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: docs, error: docsErr } = await sb
  .from('documents')
  .select('id, filename, source, status, created_at, deleted_at, metadata')
  .eq('organization_id', DEV_ORG_ID)
  .order('created_at', { ascending: false });
if (docsErr) {
  console.error(`✗ ${docsErr.message}`);
  process.exit(1);
}

if (!docs || docs.length === 0) {
  console.log('(no documents in dev-org)');
  process.exit(0);
}

// Per-doc chunk count
for (const d of docs) {
  const { count, error: cErr } = await sb
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', d.id);
  const chunkCount = cErr ? '?' : count ?? 0;
  const tag = d.deleted_at ? '[DELETED]' : `[${d.status}]`;
  console.log(`${tag.padEnd(12)} ${d.id}  ${d.filename.padEnd(28)} chunks=${chunkCount}  ${d.created_at}`);
}
