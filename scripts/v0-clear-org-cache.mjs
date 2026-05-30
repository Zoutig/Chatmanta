// V0 operationeel — wis de answer-cache van één org.
//
// Waarom: de answer-cache is gekeyed op (org, bot_version, embedding). Een
// prompt-/gedragswijziging BINNEN dezelfde bot-versie (bv. v0.9.1) propageert
// daarom niet naar al-gecachte antwoorden — die blijven het oude gedrag tonen.
// Eénmalig wissen forceert regeneratie met de nieuwe code. De cache is volledig
// regenereerbaar uit de RAG-pipeline; geen brondata gaat verloren.
//
// Dry-run (telt alleen):   node --env-file=.env.local scripts/v0-clear-org-cache.mjs demo-nieuw
// Echt wissen:             node --env-file=.env.local scripts/v0-clear-org-cache.mjs demo-nieuw --apply
import { createClient } from '@supabase/supabase-js';

const ORG_IDS = {
  'dev-org': '00000000-0000-0000-0000-0000000000d0',
  'acme-corp': '00000000-0000-0000-0000-0000000000a1',
  'globex-inc': '00000000-0000-0000-0000-0000000000a2',
  initech: '00000000-0000-0000-0000-0000000000a3',
  'demo-nieuw': '00000000-0000-0000-0000-0000000000a4',
};

const slug = process.argv[2];
const apply = process.argv.includes('--apply');
const orgId = ORG_IDS[slug];
if (!orgId) {
  console.error(`✗ Onbekende org-slug "${slug}". Kies uit: ${Object.keys(ORG_IDS).join(', ')}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('✗ Missing Supabase env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { count, error: cErr } = await sb
  .from('answer_cache')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', orgId);
if (cErr) { console.error(`✗ ${cErr.message}`); process.exit(1); }

console.log(`Org "${slug}" (${orgId}) heeft ${count ?? 0} answer-cache rijen.`);
if (!apply) {
  console.log('Dry-run — niets verwijderd. Voeg --apply toe om écht te wissen.');
  process.exit(0);
}

const { error: dErr } = await sb.from('answer_cache').delete().eq('organization_id', orgId);
if (dErr) { console.error(`✗ delete faalde: ${dErr.message}`); process.exit(1); }
console.log(`✓ ${count ?? 0} cache-rijen van "${slug}" gewist. Volgende vraag regenereert met de huidige code.`);
