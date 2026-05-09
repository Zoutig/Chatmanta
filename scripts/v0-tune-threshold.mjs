// V0 threshold tuner — vaste set vragen, top-K similarities, threshold-advies.
//
// Doel: empirische data voor blueprint sectie 16/17 — welke
// SIMILARITY_THRESHOLD werkt voor OpenAI text-embedding-3-small + NL content.
// Output is een tabel per vraag (expected vs. actual top-3) en aan het einde
// een suggested threshold die het scheidingsvlak tussen relevant en off-topic
// het beste raakt.
//
// Deze test-set is klein en hardcoded — voor V1 (blueprint sectie 17) komt
// een per-tenant testset met 30+ Q&A pairs in de DB.
//
// Run: npm run v0:tune
//
// Forecast: text-embedding-3-small geeft op NL similarities die clusteren
// rond 0.4-0.6 voor relevante matches en 0.1-0.3 voor off-topic. Een
// drempel van 0.4 is een redelijke startwaarde; 0.7 (huidige RAG_CONFIG
// default) is te streng en blokkeert legitieme antwoorden.

import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../lib/v0/embeddings.mjs';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
const TOP_K = 5;

// Hardcoded test set: vraag + verwacht doc-keyword (substring van filename).
// 'OFF_TOPIC' = expectatie is dat ALLE chunks onder de drempel vallen.
const TESTS = [
  { q: 'wat doet ChatManta?',                                    expect: 'v0-sample' },
  { q: 'wie heeft ChatManta gemaakt?',                           expect: 'v0-sample' },
  { q: 'welke stack gebruikt ChatManta?',                        expect: 'v0-sample' },
  { q: 'hoeveel vakantiedagen krijgt een voltijder bij Acme?',  expect: 'vakantie' },
  { q: 'wat is de aanvraagtermijn voor lange vakanties?',        expect: 'vakantie' },
  { q: 'wat gebeurt er als ik ziek word op vakantie?',           expect: 'vakantie' },
  { q: 'hoe werken zonnepanelen?',                               expect: 'zonnepanelen' },
  { q: 'wat gebeurt er bij stroomuitval met mijn zonnepanelen?', expect: 'zonnepanelen' },
  { q: 'wanneer wordt de salderingsregeling afgeschaft?',        expect: 'zonnepanelen' },
  { q: 'wat is de kostprijs van een installatie?',               expect: 'zonnepanelen' },
  { q: 'wat is het kookpunt van helium?',                        expect: 'OFF_TOPIC' },
  { q: 'hoe maak ik een Italiaanse pasta carbonara?',            expect: 'OFF_TOPIC' },
  { q: 'wie won de Tour de France in 2023?',                     expect: 'OFF_TOPIC' },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing Supabase env');
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Build document_id → filename lookup so we can show which doc each chunk
// belongs to without a JOIN per-query.
const { data: docs, error: docsErr } = await sb
  .from('documents')
  .select('id, filename')
  .eq('organization_id', DEV_ORG_ID);
if (docsErr) {
  console.error(`✗ docs lookup: ${docsErr.message}`);
  process.exit(1);
}
const docName = new Map(docs.map((d) => [d.id, d.filename]));
console.log(`Documents in dev-org: ${docs.length}`);
for (const d of docs) console.log(`  - ${d.filename}`);
console.log('');

// Track per-result whether the top hit matched expectation (for threshold suggestion).
const relevantTopSims = []; // top-1 similarities for cases that matched expected doc
const offTopicTopSims = []; // top-1 similarities for OFF_TOPIC cases
const wrongDocTopSims = []; // top-1 similarities where top hit pointed at wrong doc

let totalEmbedTokens = 0;
let totalEmbedCostUsd = 0;

console.log('| expected         | top doc          | top-1 | top-2 | top-3 | verdict   | question');
console.log('|------------------|------------------|-------|-------|-------|-----------|----------');

for (const test of TESTS) {
  const { vectors, tokens, costUsd } = await embedTexts([test.q]);
  totalEmbedTokens += tokens;
  totalEmbedCostUsd += costUsd;

  const { data: hits, error: rpcErr } = await sb.rpc('match_chunks', {
    p_organization_id: DEV_ORG_ID,
    query_embedding: vectors[0],
    match_count: TOP_K,
  });
  if (rpcErr) {
    console.error(`  ✗ rpc fail "${test.q}": ${rpcErr.message}`);
    continue;
  }

  const top = hits.slice(0, 3);
  const sims = top.map((h) => h.similarity?.toFixed(3) ?? '-');
  while (sims.length < 3) sims.push('-');
  const topDoc = top[0] ? (docName.get(top[0].document_id) ?? '?') : '(no chunks)';
  const topDocShort = topDoc.replace(/\.md$/, '').slice(0, 16);
  const topSim = top[0]?.similarity ?? 0;

  let verdict;
  if (test.expect === 'OFF_TOPIC') {
    offTopicTopSims.push(topSim);
    verdict = 'OFF_TOPIC';
  } else if (topDoc.includes(test.expect)) {
    relevantTopSims.push(topSim);
    verdict = 'CORRECT';
  } else {
    wrongDocTopSims.push(topSim);
    verdict = 'WRONG_DOC';
  }

  console.log(
    `| ${test.expect.padEnd(16)} | ${topDocShort.padEnd(16)} | ${sims[0].padStart(5)} | ${sims[1].padStart(5)} | ${sims[2].padStart(5)} | ${verdict.padEnd(9)} | ${test.q}`,
  );
}

console.log('');
console.log(`Embed totals: ${totalEmbedTokens} tokens · $${totalEmbedCostUsd.toFixed(6)}`);
console.log('');

// ---------------------------------------------------------------------------
// Threshold suggestion
// ---------------------------------------------------------------------------
const minRelevant = relevantTopSims.length ? Math.min(...relevantTopSims) : null;
const maxOffTopic = offTopicTopSims.length ? Math.max(...offTopicTopSims) : null;
const meanRelevant = relevantTopSims.length
  ? relevantTopSims.reduce((a, b) => a + b, 0) / relevantTopSims.length
  : null;
const meanOffTopic = offTopicTopSims.length
  ? offTopicTopSims.reduce((a, b) => a + b, 0) / offTopicTopSims.length
  : null;

console.log('Statistics:');
console.log(`  relevant top-1 sims:    n=${relevantTopSims.length}  min=${minRelevant?.toFixed(3)}  mean=${meanRelevant?.toFixed(3)}`);
console.log(`  off-topic top-1 sims:   n=${offTopicTopSims.length}  max=${maxOffTopic?.toFixed(3)}  mean=${meanOffTopic?.toFixed(3)}`);
if (wrongDocTopSims.length) {
  console.log(`  ⚠ wrong-doc cases:      n=${wrongDocTopSims.length} (top hit pointed at wrong document)`);
}

console.log('');
if (minRelevant !== null && maxOffTopic !== null) {
  if (minRelevant > maxOffTopic) {
    const suggested = ((minRelevant + maxOffTopic) / 2).toFixed(2);
    console.log(`✓ CLEAN SEPARATION: relevant min (${minRelevant.toFixed(3)}) > off-topic max (${maxOffTopic.toFixed(3)})`);
    console.log(`  suggested threshold: ${suggested}`);
  } else {
    console.log(`✗ OVERLAP: off-topic max (${maxOffTopic.toFixed(3)}) >= relevant min (${minRelevant.toFixed(3)})`);
    console.log(`  no threshold cleanly separates these cases. either revise the test set or accept`);
    console.log(`  some false positives/negatives. midpoint of means: ${(((meanRelevant ?? 0) + (meanOffTopic ?? 0)) / 2).toFixed(2)}`);
  }
}
