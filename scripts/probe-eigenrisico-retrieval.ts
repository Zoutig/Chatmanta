// Read-only probe: waar rankt het eigen-risico-antwoord-doc voor de eigenrisico-vraag?
// Repliceert de hybrid-retrieval (match_chunks_hybrid) met topK=20 en print ranked
// (filename, combined_score, keyword_score). Bepaalt: top-K-afkap vs diepere ranking-miss.
import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/server/rag';

const ORG = '00000000-0000-0000-0000-0000000000a2'; // globex-inc
const Q = 'Telt fysiotherapie mee voor mijn eigen risico?';
const TOPK = 20;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const emb = await embedTexts([Q]);
  const vec = emb.vectors[0];
  const { data, error } = await sb.rpc('match_chunks_hybrid', {
    p_organization_id: ORG,
    query_embedding: vec,
    query_text: Q,
    match_count: TOPK,
  });
  if (error) {
    console.error('RPC error:', error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as any[];
  const docIds = [...new Set(rows.map((r) => r.document_id).filter(Boolean))];
  const { data: docs } = await sb.from('documents').select('id, filename').in('id', docIds);
  const nameMap = new Map((docs ?? []).map((d: any) => [d.id, d.filename]));
  console.log(`Query: "${Q}"  org=globex-inc  topK=${TOPK}  hits=${rows.length}\n`);
  rows.forEach((r, i) => {
    const fn = nameMap.get(r.document_id) ?? '(?)';
    const comb = typeof r.combined_score === 'number' ? r.combined_score.toFixed(4) : '?';
    const kw = typeof r.keyword_score === 'number' ? r.keyword_score.toFixed(4) : '?';
    const sim = typeof r.similarity === 'number' ? r.similarity.toFixed(4) : '?';
    console.log(`#${String(i + 1).padStart(2)} ${String(fn).padEnd(34)} comb=${comb} kw=${kw} sim=${sim} :: ${String(r.content).replace(/\s+/g, ' ').slice(0, 80)}`);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
