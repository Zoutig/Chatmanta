// V1 PR-1b cross-org-isolatie-bewijs (deterministisch, geen browser). Bewijst:
//   (a) RPC-predicaat: service-role gescoopt op org A ziet org B's token-chunk NIET
//   (b) RLS staat eigen org toe: member@-session gescoopt op A krijgt A's chunks
//   (c) RLS-backstop: diezelfde session gescoopt op B (gespooft) krijgt 0 chunks
//   (d) contact_requests (bezoekers-PII): member-A leest geen rijen van org B (alleen lezen)
// Vereist: migratie 0002 + npm run v1:seed + npm run v1:seed:chunks.
// Draai met: npm run v1:test-org-isolation

import { createClient as createSb } from '@supabase/supabase-js';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { embedTexts } from '../lib/rag/embeddings';
import { embedModelFor } from '../lib/rag/index-version';
import { ISO_TOKEN } from './v1-iso-token';

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
  const { data: bots, error: botErr } = await admin.from('chatbots').select('id, organization_id, index_version');
  if (botErr) throw botErr;
  const botA = bots?.find((b) => b.organization_id === ORG_A);
  const { data: orgBRow, error: obErr } = await admin.from('organizations').select('id').eq('slug', 'seed-org-b').single();
  if (obErr || !orgBRow) throw obErr ?? new Error('seed-org-b niet gevonden');
  const orgB = orgBRow.id as string;
  const botB = bots?.find((b) => b.organization_id === orgB);
  if (!botA || !botB) fail('chatbots ontbreken — draai npm run v1:seed:chunks');

  const { vectors } = await embedTexts([`Wat is het geheime projectcodewoord? ${ISO_TOKEN}`], embedModelFor(botA.index_version));
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

  // (d) contact_requests (echte bezoekers-PII): member-A mag org B's verzoeken niet
  //     lezen, ook niet als hij expliciet op org B filtert. ALLEEN LEZEN: dit script
  //     maakt hiervoor geen rijen aan. Heeft org B geen verzoeken, dan bewijst (d)
  //     niets — dat melden we dan expliciet in plaats van groen te tonen.
  const { count: bCount, error: bcErr } = await admin
    .from('contact_requests')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgB);
  if (bcErr) fail('contact_requests-telling (service-role) faalde: ' + bcErr.message);
  const { data: dRows, error: dErr } = await member
    .from('contact_requests')
    .select('id, organization_id')
    .eq('organization_id', orgB)
    .limit(5);
  if (dErr) fail('contact_requests-read (member-A op B) faalde: ' + dErr.message);
  if ((dRows ?? []).length !== 0) fail("(d) member-A las org B's contactverzoeken — RLS LEKT (PII)");
  const { data: dAny, error: dAnyErr } = await member.from('contact_requests').select('organization_id').limit(50);
  if (dAnyErr) fail('contact_requests-read (member-A, ongefilterd) faalde: ' + dAnyErr.message);
  if ((dAny ?? []).some((r) => r.organization_id !== ORG_A))
    fail('(d) member-A ziet contactverzoeken van een andere org — RLS LEKT (PII)');
  if ((bCount ?? 0) === 0) {
    console.log('⚠️  (d) contact_requests: org B heeft 0 verzoeken → check is leeg (geen bewijs, wel geen lek)');
  } else {
    console.log(`✅ (d) contact_requests: member-A leest geen van org B's ${bCount} verzoek(en)`);
  }

  console.log('\n✅ V1 cross-org-isolatie INTACT (predicaat + RLS).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
