// Read-only: verifieer waarom de keyword-helft van match_chunks_hybrid niets bijdraagt.
// Hypothese: plainto_tsquery AND't alle content-woorden → hele vraagzin matcht ~niets.
// Geen embeddings, puur Postgres FTS via PostgREST .textSearch. $0.
import { createClient } from '@supabase/supabase-js';

const ORG = '00000000-0000-0000-0000-0000000000a2'; // globex-inc
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function cnt(label: string, query: string, type: 'plain' | 'websearch' | 'phrase') {
  const { data, error, count } = await sb
    .from('document_chunks')
    .select('id, content', { count: 'exact' })
    .eq('organization_id', ORG)
    .textSearch('content_tsv', query, { config: 'dutch', type })
    .limit(3);
  if (error) {
    console.log(`${label} [${type}]: ERROR ${error.message}`);
    return;
  }
  console.log(`\n${label} [${type}] "${query}" → ${count} hits`);
  (data ?? []).forEach((r: any) => console.log(`   · ${String(r.content).replace(/\s+/g, ' ').slice(0, 75)}`));
}

async function main() {
  const Q = 'Telt fysiotherapie mee voor mijn eigen risico?';
  await cnt('full-question', Q, 'plain');
  await cnt('full-question', Q, 'websearch');
  await cnt('single: fysiotherapie', 'fysiotherapie', 'plain');
  await cnt('single: fysio', 'fysio', 'plain');
  await cnt('two-word: eigen risico', 'eigen risico', 'plain');
  await cnt('three-word: fysiotherapie eigen risico', 'fysiotherapie eigen risico', 'plain');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
