// V1 PR-1b chunk-seed: 1 chatbot + echte chunks (parents + children) per seed-org.
// Org A (V1_SEED_ORG_ID) = Manta-demo; Org B (seed-org-b) = isolatie-token.
// Systeem-write via de V1 service-role (SA-5). Idempotent: wist de RAG-data van de
// seed-orgs (FK-cascade vanaf chatbots) en herseedt.
//
// Vereist: migratie 0002 toegepast + `npm run v1:seed` (org + users) gedraaid.
// Draai met: npm run v1:seed:chunks   (= --conditions=react-server --import tsx)

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument } from '../lib/rag/ingest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ISO_TOKEN } from './v1-iso-token';

const ORG_A = process.env.V1_SEED_ORG_ID;
if (!ORG_A) {
  console.error('✗ V1_SEED_ORG_ID vereist in .env.local');
  process.exit(1);
}

const MANTA_TEXT = `Manta Bakkerij is een ambachtelijke bakkerij in Amsterdam.
Onze openingstijden: maandag tot en met vrijdag van 08:00 tot 18:00 uur,
zaterdag van 08:00 tot 16:00 uur. Op zondag zijn wij gesloten.
Wij bakken dagelijks vers brood, taarten en koekjes. Bestellingen voor
taarten kunnen telefonisch via 020-1234567 of per e-mail naar info@manta-bakkerij.nl.
Ons adres is Mantastraat 12, 1011 AB Amsterdam.`;

const ORG_B_TEXT = `Interne notitie van organisatie B. Het geheime projectcodewoord is ${ISO_TOKEN}.
Dit document hoort uitsluitend bij organisatie B en mag niet zichtbaar zijn voor andere organisaties.`;

async function seedOrg(client: SupabaseClient, orgId: string, name: string, text: string) {
  // idempotent: wis bestaande RAG-data van deze org (FK-cascade vanaf chatbots)
  const { error: delErr } = await client.from('chatbots').delete().eq('organization_id', orgId);
  if (delErr) throw delErr;

  // chatbot (één actieve per org)
  const { data: bot, error: be } = await client
    .from('chatbots')
    .insert({ organization_id: orgId, name, bot_version: 'v1.0' })
    .select('id')
    .single();
  if (be) throw be;

  // document + parents + children via de gedeelde ingest (zelfde 3200/400 + 800/100)
  const res = await ingestDocument(client, {
    organizationId: orgId,
    chatbotId: bot.id as string,
    filename: `${name}.txt`,
    text,
    source: 'v0_local',
  });
  console.log(`✓ ${name}: chatbot ${bot.id}, ${res.parents} parent(s), ${res.chunks} chunk(s)`);
}

async function main() {
  const client = getV1ServiceRoleClient();
  await seedOrg(client, ORG_A as string, 'Manta Demo', MANTA_TEXT);

  const { data: orgB, error: obe } = await client
    .from('organizations')
    .select('id')
    .eq('slug', 'seed-org-b')
    .single();
  if (obe || !orgB) throw obe ?? new Error('seed-org-b niet gevonden — draai eerst npm run v1:seed');
  await seedOrg(client, orgB.id as string, 'Org B Demo', ORG_B_TEXT);

  console.log('\n✓ v1 chunk-seed klaar.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
