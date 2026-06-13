// WP3-hulpje: tel de answer_cache-rijen van één org (pure supabase, geen
// pipeline-import → geen server-only-blokkade). Gebruikt tijdens de browser-
// repro om te bewijzen dat een settings-save de cache leegt.
//
//   node --env-file=.env.local scripts/wp3-cache-count.mjs dev-org
import { createClient } from '@supabase/supabase-js';

const ORG_IDS = {
  'dev-org': '00000000-0000-0000-0000-0000000000d0',
  'acme-corp': '00000000-0000-0000-0000-0000000000a1',
  'globex-inc': '00000000-0000-0000-0000-0000000000a2',
  initech: '00000000-0000-0000-0000-0000000000a3',
  'demo-nieuw': '00000000-0000-0000-0000-0000000000a4',
};
const slug = process.argv[2] ?? 'dev-org';
const orgId = ORG_IDS[slug];
if (!orgId) { console.error(`✗ onbekende org "${slug}"`); process.exit(1); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { count, error } = await sb
  .from('answer_cache')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', orgId);
if (error) { console.error(`✗ ${error.message}`); process.exit(1); }
console.log(`${slug}: ${count ?? 0} answer_cache-rijen`);
