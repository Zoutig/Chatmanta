// V1 PR-3b crawler DoD-bewijs — FIXTURE (geen Firecrawl-call, alleen OpenAI-embed).
// Bewijst de pages-as-documents ingest end-to-end: ingest een fixture-crawl (1 gecrawld
// feit + 1 failed + 1 excluded) in de seed-org → het feit is retrievebaar via
// match_chunks_with_parents MÉT source_url; failed/excluded krijgen een chunk-loze
// documents-rij (included=false); re-ingest is idempotent (geen duplicaten). Ruimt
// alles op in finally. Draai: npm run v1:test-crawl

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestCrawlResults, ingestSinglePage } from '../lib/v1/crawler/processCrawl';
import { embedTexts } from '../lib/rag/embeddings';

const TOKEN = 'PR3B-CRAWL-PROEF-QZ4417';
const HOST = 'pr3b-crawl-proef.example';
const ROOT = `https://${HOST}/`;
const ORG = process.env.V1_SEED_ORG_ID;
if (!ORG) {
  console.error('✗ V1_SEED_ORG_ID vereist');
  process.exit(1);
}

const PAGES = [
  { url: `${ROOT}feit`, title: 'Het feit', markdown: `Belangrijk: de geheime crawl-proefcode is ${TOKEN}. Dit staat op de testwebsite.`, statusCode: 200, error: null },
  { url: `${ROOT}kapot`, title: 'Kapotte pagina', markdown: '', statusCode: 500, error: 'Server error' },
  { url: `${ROOT}leeg`, title: 'Lege pagina', markdown: '   ', statusCode: 200, error: null },
];

async function main() {
  const sb = getV1ServiceRoleClient();
  const { data: bot } = await sb
    .from('chatbots').select('id')
    .eq('organization_id', ORG as string).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!bot) throw new Error('geen chatbot voor seed-org — draai npm run v1:seed');
  const chatbotId = bot.id as string;

  // pre-clean een restant + maak een test-knowledge_source
  await sb.from('knowledge_sources').delete()
    .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('normalized_host', HOST);
  const { data: src, error: srcErr } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: ORG, chatbot_id: chatbotId, type: 'website', name: HOST, root_url: ROOT, normalized_host: HOST, status: 'crawling' })
    .select('id').single();
  if (srcErr) throw new Error('knowledge_source insert: ' + srcErr.message);
  const ksId = (src as { id: string }).id;

  try {
    const r1 = await ingestCrawlResults(sb, ksId, ORG as string, chatbotId, PAGES);
    if (r1.pagesCrawled !== 1 || r1.pagesFailed !== 1 || r1.pagesExcluded !== 1) {
      throw new Error(`onverwachte tellingen: ${JSON.stringify(r1)}`);
    }
    console.log(`✅ ingest: ${r1.pagesCrawled} gecrawld, ${r1.pagesFailed} failed, ${r1.pagesExcluded} excluded, ${r1.chunks} chunk(s)`);

    const { data: docs } = await sb
      .from('documents').select('status, included')
      .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('knowledge_source_id', ksId);
    if ((docs ?? []).length !== 3) throw new Error(`verwacht 3 website-documents, kreeg ${(docs ?? []).length}`);
    const nonCrawled = (docs ?? []).filter((d) => d.status === 'failed' || d.status === 'excluded');
    if (nonCrawled.length !== 2 || nonCrawled.some((d) => d.included !== false)) {
      throw new Error('failed/excluded pagina is niet status+included=false: ' + JSON.stringify(nonCrawled));
    }
    console.log('✅ 3 website-documents; failed/excluded = included=false');

    const { vectors } = await embedTexts(['Wat is de geheime crawl-proefcode?']);
    const { data: hits, error: rpcErr } = await sb.rpc('match_chunks_with_parents', {
      p_organization_id: ORG, p_chatbot_id: chatbotId, query_embedding: vectors[0], match_count: 5,
    });
    if (rpcErr) throw new Error('RPC: ' + rpcErr.message);
    const hit = (hits ?? []).find((h: { content: string }) => h.content.includes(TOKEN)) as
      | { content: string; source_url: string | null }
      | undefined;
    if (!hit) throw new Error('het gecrawlde feit is NIET retrievebaar via de match-RPC');
    if (hit.source_url !== `${ROOT}feit`) throw new Error(`source_url ontbreekt/klopt niet: ${JSON.stringify(hit.source_url)}`);
    console.log(`✅ feit retrievebaar met source_url=${hit.source_url}`);

    await ingestCrawlResults(sb, ksId, ORG as string, chatbotId, PAGES);
    const { count } = await sb
      .from('documents').select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('knowledge_source_id', ksId);
    if (count !== 3) throw new Error(`re-ingest gaf ${count} documents i.p.v. 3 (niet idempotent)`);
    console.log('✅ re-ingest idempotent (3 documents, geen duplicaten)');

    // retry-pad (verifieert de metadata->>source_url JSON-filter in ingestSinglePage)
    const single = await ingestSinglePage(sb, ksId, ORG as string, chatbotId, {
      url: `${ROOT}feit`, title: 'Het feit v2', markdown: `Update: de geheime crawl-proefcode blijft ${TOKEN}.`, statusCode: 200, error: null,
    });
    if (single.status !== 'crawled') throw new Error(`ingestSinglePage faalde: ${JSON.stringify(single)}`);
    const { count: feitCount } = await sb
      .from('documents').select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('knowledge_source_id', ksId)
      .eq('metadata->>source_url', `${ROOT}feit`);
    if (feitCount !== 1) throw new Error(`ingestSinglePage gaf ${feitCount} docs voor de URL i.p.v. 1 (JSON-filter of dedup kapot)`);
    console.log('✅ ingestSinglePage (retry) werkt — metadata->>source_url JSON-filter valide, geen duplicaat');

    // included-preservatie bij re-crawl: zet het feit uit → re-crawl → moet uit blijven
    const { error: offErr } = await sb.from('documents').update({ included: false })
      .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('knowledge_source_id', ksId)
      .eq('metadata->>source_url', `${ROOT}feit`);
    if (offErr) throw new Error(`included→false faalde: ${offErr.message}`);
    await ingestCrawlResults(sb, ksId, ORG as string, chatbotId, PAGES);
    const { data: afterRecrawl } = await sb.from('documents').select('included')
      .eq('organization_id', ORG as string).eq('chatbot_id', chatbotId).eq('knowledge_source_id', ksId)
      .eq('metadata->>source_url', `${ROOT}feit`).maybeSingle();
    if (!afterRecrawl || afterRecrawl.included !== false) {
      throw new Error(`re-crawl reset included naar ${JSON.stringify(afterRecrawl?.included)} i.p.v. behouden=false`);
    }
    console.log('✅ re-crawl behoudt de uitgezette pagina (included=false)');

    console.log('\n✅ V1 PR-3b crawler-ingest BEWEZEN (pages-as-documents + source_url + failed/excluded + idempotent + retry + included-preservatie).');
  } finally {
    await sb.from('knowledge_sources').delete().eq('id', ksId);
    console.log('✓ test-knowledge_source + documents (CASCADE) opgeruimd.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ CRAWL-PROEF FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
