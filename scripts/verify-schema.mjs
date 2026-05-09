// Schema verifier — bevestigt dat migraties 0001 + 0002 zijn toegepast.
// Draait met service-role (RLS bypassed) zodat we tabellen + RPC kunnen
// raken zonder afhankelijk te zijn van een ingelogde user.
//
// Logt nooit key-waardes. Output is alleen pass/fail.
//
// Run: npm run verify-schema

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('✗ Ontbrekende env: NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY');
  console.error('  Run `npm run check-env` eerst.');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let allOk = true;
const pass = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => { console.log(`✗ ${msg}`); allOk = false; };

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

console.log('--- Migratie 0001: core tenancy ---');
for (const t of ['organizations', 'users', 'organization_members']) {
  const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (error) fail(`tabel ${t}: ${error.message}`);
  else pass(`tabel ${t} bereikbaar`);
}

console.log('\n--- Migratie 0002: V0 RAG ---');
for (const t of ['documents', 'document_chunks']) {
  const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (error) fail(`tabel ${t}: ${error.message}`);
  else pass(`tabel ${t} bereikbaar`);
}

console.log('\n--- match_chunks RPC ---');
const dummyEmbedding = new Array(1536).fill(0);
const { error: rpcErr } = await sb.rpc('match_chunks', {
  p_organization_id: DEV_ORG_ID,
  query_embedding: dummyEmbedding,
  match_count: 1,
});
if (rpcErr) fail(`match_chunks: ${rpcErr.message}`);
else pass('match_chunks aanroepbaar');

console.log('\n--- Dev-organization seed ---');
const { data: org, error: orgErr } = await sb
  .from('organizations')
  .select('id, name, slug')
  .eq('id', DEV_ORG_ID)
  .maybeSingle();
if (orgErr) fail(`dev-org lookup: ${orgErr.message}`);
else if (!org) fail(`dev-org row niet gevonden (id=${DEV_ORG_ID}) — re-run migratie 0002`);
else pass(`dev-org aanwezig: name="${org.name}", slug="${org.slug}"`);

console.log('');
if (allOk) {
  console.log('✓ Schema OK. V0-code mag gebouwd worden.');
  process.exit(0);
} else {
  console.log('✗ Verificatie gefaald. Pas de juiste migratie opnieuw toe in Supabase SQL Editor.');
  process.exit(1);
}
