// V1 PR-2 DoD-bewijs: een V1-org laadt een eigen document in en kan het bevragen.
// Deterministisch: ingest een doc met een uniek feit in de seed-org → het feit is
// retrievebaar via de match-RPC (kern-bewijs, geen LLM-variantie) → de engine geeft
// een 'answer' (geen fallback). Ruimt het test-doc daarna op (cascade) zodat de
// seed-org schoon + de test idempotent blijft.
// Vereist: migratie 0002 + npm run v1:seed + npm run v1:seed:chunks.
// Draai met: npm run v1:test-ingest

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument } from '../lib/rag/ingest';
import { embedTexts } from '../lib/rag/embeddings';
import { runRagQuery } from '../lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, buildV1Persona } from '../app/v1/app/rag-config';

const TOKEN = 'PR2-INGEST-PROEF-KX7731';
const FACT = `Notitie: de interne onderhoudscode van Manta Bakkerij voor 2026 is ${TOKEN}. Dit is een testfeit voor het V1-ingestpad.`;
const QUESTION = 'Wat is de interne onderhoudscode van Manta Bakkerij voor 2026?';
const ORG_A = process.env.V1_SEED_ORG_ID;
if (!ORG_A) {
  console.error('✗ V1_SEED_ORG_ID vereist');
  process.exit(1);
}

function fail(m: string): never {
  console.error('❌ INGEST-PROEF FAIL:', m);
  process.exit(1);
}

async function main() {
  const client = getV1ServiceRoleClient();
  const { data: bot } = await client
    .from('chatbots')
    .select('id, name, bot_version')
    .eq('organization_id', ORG_A as string)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!bot) fail('geen chatbot voor seed-org — draai eerst npm run v1:seed && npm run v1:seed:chunks');
  const chatbotId = bot.id as string;

  // 1) ingest het testfeit
  const res = await ingestDocument(client, {
    organizationId: ORG_A as string,
    chatbotId,
    filename: 'pr2-ingest-proef.txt',
    text: FACT,
    source: 'v0_local',
  });
  console.log(`✓ ingest: doc ${res.documentId}, ${res.parents} parent(s), ${res.chunks} chunk(s)`);

  try {
    // 2) deterministisch: de match-RPC vindt het ingeladen feit terug
    const { vectors } = await embedTexts([QUESTION]);
    const { data: hits, error: rpcErr } = await client.rpc('match_chunks_with_parents', {
      p_organization_id: ORG_A,
      p_chatbot_id: chatbotId,
      query_embedding: vectors[0],
      match_count: 5,
    });
    if (rpcErr) fail('RPC faalde: ' + rpcErr.message);
    if (!(hits ?? []).some((h: { content: string }) => h.content.includes(TOKEN))) {
      fail('het ingeladen feit is NIET retrievebaar — ingest→embed→retrieve keten kapot');
    }
    console.log('✅ ingeladen feit is retrievebaar via de match-RPC');

    // 3) end-to-end: de engine geeft een echt answer (geen fallback)
    const config = { ...V1_RAG_DEFAULTS, version: bot.bot_version as string };
    const persona = buildV1Persona(bot.name as string);
    let kind = 'none';
    let answer = '';
    for await (const ev of runRagQuery(client, {
      question: QUESTION,
      threshold: config.similarityThreshold,
      enableRewrite: config.enableRewriteByDefault,
      config,
      persona,
      organizationId: ORG_A as string,
      chatbotId,
      disableCache: true,
    })) {
      if (ev.kind === 'answer-done' || ev.kind === 'fallback' || ev.kind === 'smalltalk' || ev.kind === 'replacement') {
        kind = ev.response.kind;
        answer = ev.response.answer;
      }
    }
    console.log(`engine kind=${kind}; antwoord: ${answer.slice(0, 160)}`);
    if (kind !== 'answer') fail(`engine gaf '${kind}' i.p.v. een gegrond answer op het ingeladen feit`);
    console.log('\n✅ V1 ingest→query BEWEZEN (retrievebaar + gegrond answer).');
  } finally {
    // opruimen: hard-delete het test-doc (cascade ruimt parents+children) → seed-org schoon
    await client.from('documents').delete().eq('id', res.documentId);
    console.log('✓ test-doc opgeruimd.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
