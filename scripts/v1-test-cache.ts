// V1 PR-3 (3a) answer_cache DoD-bewijs. Drie asserts, deterministisch (vaste
// unit-vector, geen OpenAI/LLM-call), ruimt alles op in finally:
//
//   (1) answer_cache is service-role-write-only — een NIET-service-role client
//       (anon, RLS-rol; staat model voor de `authenticated` session-client die
//       askV1 injecteert — beide hebben géén INSERT-policy) krijgt z'n INSERT
//       door RLS GEWEIGERD. Dít is waarom de engine cache-writes via een
//       service-role `serviceClient` routet i.p.v. de session-client (anders
//       faalt elke write stil → cacheEnabled wordt een dode no-op).
//   (2) een service-role INSERT landt WÉL (de fix werkt).
//   (3) de cache is chatbot-scoped: lookup_cached_answer filtert op chatbot_id,
//       dus chatbot A serveert nooit chatbot B's gecachte antwoord (landmijn 1).
//
// Vereist: migratie 0003 toegepast + npm run v1:seed (een actieve chatbot in de
// seed-org). Draai met: npm run v1:test-cache

import { createClient } from '@supabase/supabase-js';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';

const ORG = process.env.V1_SEED_ORG_ID;
const ANON_URL = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY;
if (!ORG || !ANON_URL || !ANON_KEY) {
  console.error('✗ V1_SEED_ORG_ID + NEXT_PUBLIC_V1_SUPABASE_URL + NEXT_PUBLIC_V1_SUPABASE_ANON_KEY vereist');
  process.exit(1);
}

const MARK = 'PR3-CACHE-PROEF vraag KX9920';
const BOT_VERSION = 'cache-test-v1'; // eigen versie-tag → raakt geen echte cache-rijen
// Deterministische unit-vector (lengte 1536): index 0 = 1, rest 0. Cosine met
// zichzelf = 1.0 ≥ elke threshold → gegarandeerde hit, geen embedding-call nodig.
const VEC = Array(1536).fill(0);
VEC[0] = 1;

const resp = (tag: string) => ({ kind: 'answer', answer: tag, sources: [], totalCostUsd: 0 });

async function main() {
  const svc = getV1ServiceRoleClient();
  const anon = createClient(ANON_URL as string, ANON_KEY as string, { auth: { persistSession: false } });

  // chatbot A = de actieve chatbot van de seed-org
  const { data: botA } = await svc
    .from('chatbots')
    .select('id, bot_version')
    .eq('organization_id', ORG as string)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!botA) throw new Error('geen chatbot voor seed-org — draai eerst npm run v1:seed');
  const chatbotA = botA.id as string;

  // chatbot B = een tweede chatbot in dezelfde org, ALLÉÉN voor de isolatietest.
  // deleted_at gezet zodat de one-active-per-org unique index (WHERE deleted_at is
  // null) niet breekt; de answer_cache-FK + de lookup-RPC kijken niet naar deleted_at.
  const { data: botB, error: bErr } = await svc
    .from('chatbots')
    .insert({ organization_id: ORG, name: 'pr3-cache-test-b', deleted_at: new Date().toISOString() })
    .select('id')
    .single();
  if (bErr) throw new Error('kon test-chatbot B niet aanmaken: ' + bErr.message);
  const chatbotB = (botB as { id: string }).id;

  // defensieve pre-clean van een eventueel restant van een gefaalde run
  await svc.from('answer_cache').delete().eq('organization_id', ORG as string).eq('bot_version', BOT_VERSION);

  try {
    // (1) anon (RLS-rol) INSERT moet GEWEIGERD worden — answer_cache heeft alleen
    // een SELECT-policy, geen INSERT-policy voor anon/authenticated.
    const { error: anonErr } = await anon.from('answer_cache').insert({
      organization_id: ORG,
      chatbot_id: chatbotA,
      bot_version: BOT_VERSION,
      question: MARK,
      question_embedding: VEC,
      response_json: resp('ANON-MAG-NIET'),
    });
    if (!anonErr) {
      throw new Error('RLS-LEK: anon-client mocht answer_cache schrijven — de SELECT-only policy zou dit moeten blokkeren');
    }
    console.log('✅ (1) niet-service-role INSERT geweigerd door RLS → service-role-write noodzakelijk + correct');

    // (2) service-role INSERT landt wél — voor chatbot A én B (verschillende answers)
    const insA = await svc.from('answer_cache').insert({
      organization_id: ORG, chatbot_id: chatbotA, bot_version: BOT_VERSION,
      question: MARK, question_embedding: VEC, response_json: resp('CACHED-A'),
    });
    if (insA.error) throw new Error('service-role INSERT (A) faalde: ' + insA.error.message);
    const insB = await svc.from('answer_cache').insert({
      organization_id: ORG, chatbot_id: chatbotB, bot_version: BOT_VERSION,
      question: MARK, question_embedding: VEC, response_json: resp('CACHED-B'),
    });
    if (insB.error) throw new Error('service-role INSERT (B) faalde: ' + insB.error.message);
    console.log('✅ (2) service-role INSERT landt (de engine cache-write-fix werkt)');

    // (3) chatbot-isolatie via lookup_cached_answer
    const lookup = async (chatbotId: string) => {
      const { data, error } = await svc.rpc('lookup_cached_answer', {
        p_organization_id: ORG,
        p_chatbot_id: chatbotId,
        p_bot_version: BOT_VERSION,
        query_embedding: VEC,
        min_similarity: 0,
      });
      if (error) throw new Error('lookup RPC faalde: ' + error.message);
      return (data ?? []) as { response_json: { answer: string }; similarity: number }[];
    };
    const a = await lookup(chatbotA);
    const b = await lookup(chatbotB);
    if (a.length !== 1 || a[0].response_json.answer !== 'CACHED-A') {
      throw new Error("lookup(A) gaf niet exact A's rij: " + JSON.stringify(a));
    }
    if (b.length !== 1 || b[0].response_json.answer !== 'CACHED-B') {
      throw new Error("lookup(B) gaf niet exact B's rij: " + JSON.stringify(b));
    }
    console.log(
      `✅ (3) chatbot-isolatie: A→CACHED-A (sim=${a[0].similarity.toFixed(3)}), B→CACHED-B — geen cross-chatbot lek`,
    );

    console.log('\n✅ V1 PR-3 3a cache BEWEZEN: RLS-write-gate + service-role-write + chatbot-scoped lookup.');
  } finally {
    await svc.from('answer_cache').delete().eq('organization_id', ORG as string).eq('bot_version', BOT_VERSION);
    await svc.from('chatbots').delete().eq('id', chatbotB);
    console.log('✓ test-rijen + test-chatbot B opgeruimd.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ CACHE-PROEF FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
