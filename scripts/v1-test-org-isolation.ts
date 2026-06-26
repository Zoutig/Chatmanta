// V1 PR-1b cross-org-isolatie-bewijs (deterministisch, geen browser). Bewijst:
//   (a) RPC-predicaat: service-role gescoopt op org A ziet org B's token-chunk NIET
//   (b) RLS staat eigen org toe: member@-session gescoopt op A krijgt A's chunks
//   (c) RLS-backstop: diezelfde session gescoopt op B (gespooft) krijgt 0 chunks
// Vereist: migratie 0002 + npm run v1:seed + npm run v1:seed:chunks.
// Draai met: npm run v1:test-org-isolation

import { createClient as createSb } from '@supabase/supabase-js';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { embedTexts } from '../lib/rag/embeddings';
import { ISO_TOKEN } from './v1-seed-chunks';

const ORG_A = process.env.V1_SEED_ORG_ID;
const URL = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY;
const MEMBER_PW = process.env.V1_SEED_MEMBER_PW;
if (!ORG_A || !URL || !ANON || !MEMBER_PW) {
  console.error('✗ V1_SEED_ORG_ID + NEXT_PUBLIC_V1_SUPABASE_URL + NEXT_PUBLIC_V1_SUPABASE_ANON_KEY + V1_SEED_MEMBER_PW vereist');
  process.exit(1);
}

function fail(msg: string): never {
  console.error('❌ ISOLATIE-FAIL:', msg);
  process.exit(1);
}

type Hit = { content: string };

async function main() {
  const admin = getV1ServiceRoleClient();

  // chatbot-id's + org B ophalen
  const { data: bots, error: botErr } = await admin.from('chatbots').select('id, organization_id');
  if (botErr) throw botErr;
  const botA = bots?.find((b) => b.organization_id === ORG_A);
  const { data: orgBRow, error: obErr } = await admin.from('organizations').select('id').eq('slug', 'seed-org-b').single();
  if (obErr || !orgBRow) throw obErr ?? new Error('seed-org-b niet gevonden');
  const orgB = orgBRow.id as string;
  const botB = bots?.find((b) => b.organization_id === orgB);
  if (!botA || !botB) fail('chatbots ontbreken — draai npm run v1:seed:chunks');

  const { vectors } = await embedTexts([`Wat is het geheime projectcodewoord? ${ISO_TOKEN}`]);
  const qv = vectors[0];

  // (a) service-role, gescoopt op A → mag B's token-chunk NIET bevatten
  const { data: aHits, error: aErr } = await admin.rpc('match_chunks_with_parents', {
    p_organization_id: ORG_A, p_chatbot_id: botA.id, query_embedding: qv, match_count: 10,
  });
  if (aErr) fail('RPC-A faalde: ' + aErr.message);
  if ((aHits ?? []).some((h: Hit) => h.content.includes(ISO_TOKEN)))
    fail("(a) org A retrieval bevat org B's geheime token — PREDICAAT LEKT");
  console.log("✅ (a) RPC-predicaat: org A ziet org B's token niet");

  // member-session (anon-client + password-login)
  const member = createSb(URL as string, ANON as string);
  const { error: signErr } = await member.auth.signInWithPassword({ email: 'member@example.com', password: MEMBER_PW as string });
  if (signErr) fail('member-login faalde: ' + signErr.message);

  // (b) member-session op eigen org A → krijgt chunks (RLS staat eigen org toe)
  const { data: bHits, error: bErr } = await member.rpc('match_chunks_with_parents', {
    p_organization_id: ORG_A, p_chatbot_id: botA.id, query_embedding: qv, match_count: 5,
  });
  if (bErr) fail('RPC-member-A faalde: ' + bErr.message);
  if ((bHits ?? []).length === 0) fail('(b) member-A kreeg 0 chunks van eigen org — RLS te streng of seed leeg');
  console.log(`✅ (b) RLS staat eigen org toe: member-A kreeg ${(bHits ?? []).length} chunk(s)`);

  // (c) member-A gespooft naar org B → RLS-backstop blokkeert (leeg)
  const { data: cHits, error: cErr } = await member.rpc('match_chunks_with_parents', {
    p_organization_id: orgB, p_chatbot_id: botB.id, query_embedding: qv, match_count: 10,
  });
  if (cErr) fail('RPC-member-B faalde: ' + cErr.message);
  if ((cHits ?? []).length !== 0) fail("(c) member-A las org B's chunks — RLS-BACKSTOP LEKT");
  console.log('✅ (c) RLS-backstop: member-A leest org B niet (0 chunks)');

  console.log('\n✅ V1 cross-org-isolatie INTACT (predicaat + RLS).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
