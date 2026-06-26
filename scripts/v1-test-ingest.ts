// V1 PR-2 DoD-bewijs: een V1-org laadt een eigen document in en kan het bevragen.
// Deterministisch: ingest een doc met een uniek feit in de seed-org → het feit is
// retrievebaar via de match-RPC (kern-bewijs, geen LLM-variantie) → de engine geeft
// een 'answer' (geen fallback). Ruimt het test-doc daarna op (cascade) zodat de
// seed-org schoon + de test idempotent blijft — óók op een faal-pad (zie cleanup).
// Vereist: migratie 0002 + npm run v1:seed + npm run v1:seed:chunks.
// Draai met: npm run v1:test-ingest

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument } from '../lib/rag/ingest';
import { embedTexts } from '../lib/rag/embeddings';
import { runRagQuery } from '../lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, buildV1Persona } from '../app/v1/app/rag-config';

const TOKEN = 'PR2-INGEST-PROEF-KX7731';
const FILENAME = 'pr2-ingest-proef.txt';
const FACT = `Notitie: de interne onderhoudscode van Manta Bakkerij voor 2026 is ${TOKEN}. Dit is een testfeit voor het V1-ingestpad.`;
const QUESTION = 'Wat is de interne onderhoudscode van Manta Bakkerij voor 2026?';
const ORG_A = process.env.V1_SEED_ORG_ID;
if (!ORG_A) {
  console.error('✗ V1_SEED_ORG_ID vereist');
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
  if (!bot) throw new Error('geen chatbot voor seed-org — draai eerst npm run v1:seed && npm run v1:seed:chunks');
  const chatbotId = bot.id as string;

  // Defensieve pre-cleanup: verwijder een eventueel achtergebleven test-doc van een
  // vorige (gefaalde) run. Voorkomt orphan-opbouw ÉN dat een stale token-doc een
  // kapotte ingest maskeert (de retrieve-assert zou anders op het oude doc slagen).
  await client.from('documents').delete().eq('organization_id', ORG_A as string).eq('filename', FILENAME);

  // ingest het testfeit (cascade-cleanup hieronder in finally)
  const res = await ingestDocument(client, {
    organizationId: ORG_A as string,
    chatbotId,
    filename: FILENAME,
    text: FACT,
    source: 'v0_local',
  });
  console.log(`✓ ingest: doc ${res.documentId}, ${res.parents} parent(s), ${res.chunks} chunk(s)`);

  try {
    // 1) deterministisch: de match-RPC vindt het ingeladen feit terug
    const { vectors } = await embedTexts([QUESTION]);
    const { data: hits, error: rpcErr } = await client.rpc('match_chunks_with_parents', {
      p_organization_id: ORG_A,
      p_chatbot_id: chatbotId,
      query_embedding: vectors[0],
      match_count: 5,
    });
    if (rpcErr) throw new Error('RPC faalde: ' + rpcErr.message);
    if (!(hits ?? []).some((h: { content: string }) => h.content.includes(TOKEN))) {
      throw new Error('het ingeladen feit is NIET retrievebaar — ingest→embed→retrieve keten kapot');
    }
    console.log('✅ ingeladen feit is retrievebaar via de match-RPC');

    // 2) end-to-end: de engine geeft een echt answer (geen fallback)
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
    if (kind !== 'answer') throw new Error(`engine gaf '${kind}' i.p.v. een gegrond answer op het ingeladen feit`);
    console.log('\n✅ V1 ingest→query BEWEZEN (retrievebaar + gegrond answer).');
  } finally {
    // opruimen draait ALTIJD (geen process.exit in de try): hard-delete het test-doc
    // (cascade ruimt parents+children) → seed-org schoon, test idempotent.
    await client.from('documents').delete().eq('id', res.documentId);
    console.log('✓ test-doc opgeruimd.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ INGEST-PROEF FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
