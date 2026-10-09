// Demo-org voor /voorbeeld vullen met de tekst van de voorbeeldwebsite.
// run: npm run voorbeeld:seed            (V1-project, service-role, SA-5)
//
// Idempotent: maakt de fictieve org + chatbot aan als ze er niet zijn, vervangt
// daarna ALLE documenten van die chatbot door de huidige pagina's van de
// voorbeeldwebsite (lib/voorbeeld/site-content.ts = precies wat de site toont) en
// purget de answer-cache. Raakt geen andere org: alles is gescoped op de org die
// bij DEMO_ORG_SLUG hoort. Bevat uitsluitend fictieve demo-content.

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument, purgeAnswerCache } from '../lib/rag/ingest';
import { SITE_PAGES, pageToPlainText } from '../lib/voorbeeld/site-content';
import { DEMO_ORG_SLUG } from '../lib/voorbeeld/constants';

const SITE_ORIGIN = process.env.VOORBEELD_SITE_ORIGIN ?? 'https://www.chatmanta.nl';
const ORG_NAME = 'Vakantiepark De Duinhoeve (voorbeeld)';
// Ruimer dan de default (1 euro): de demo wordt aan prospects getoond.
const DAILY_BUDGET_EUR = 5;

async function main() {
  const sb = getV1ServiceRoleClient();

  // Nooit een echte org overnemen: bestaat de slug al, dan moet het onze demo zijn.
  const { data: prior, error: perr } = await sb
    .from('organizations')
    .select('id, name')
    .eq('slug', DEMO_ORG_SLUG)
    .maybeSingle();
  if (perr) throw perr;
  if (prior && prior.name !== ORG_NAME) {
    throw new Error(`slug ${DEMO_ORG_SLUG} is in gebruik door "${prior.name}", geen demo-org; afgebroken`);
  }
  const { data: org, error: oerr } = await sb
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: DEMO_ORG_SLUG }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (oerr) throw oerr;
  const orgId = org.id as string;
  console.log(`✓ org ${DEMO_ORG_SLUG}: ${orgId}`);

  const { error: berr } = await sb
    .from('organizations')
    .update({ daily_budget_eur: DAILY_BUDGET_EUR })
    .eq('id', orgId);
  if (berr) console.warn(`! dagbudget zetten faalde: ${berr.message}`);

  const { data: existing, error: lerr } = await sb
    .from('chatbots')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lerr) throw lerr;
  let chatbotId = existing?.id as string | undefined;
  if (!chatbotId) {
    const { data: bot, error } = await sb
      .from('chatbots')
      .insert({ organization_id: orgId, name: 'De Duinhoeve', bot_version: 'v1.0' })
      .select('id')
      .single();
    if (error) throw error;
    chatbotId = bot.id as string;
    console.log(`+ chatbot aangemaakt: ${chatbotId}`);
  }

  // Oude pagina's weg (chunks volgen via on delete cascade), dan opnieuw ingesten.
  const { error: derr } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId);
  if (derr) throw derr;

  let chunks = 0;
  let cost = 0;
  for (const page of SITE_PAGES) {
    const text = pageToPlainText(page);
    const url = `${SITE_ORIGIN}${page.path}`;
    const res = await ingestDocument(sb, {
      organizationId: orgId,
      chatbotId,
      filename: page.title,
      text,
      source: 'website',
      metadata: { source_url: url, source_title: page.title },
    });
    chunks += res.chunks;
    cost += res.costUsd;
    console.log(`  · ${page.path} (${res.chunks} chunks)`);
  }

  await purgeAnswerCache(sb, orgId, chatbotId);
  console.log(`✓ ${SITE_PAGES.length} pagina's, ${chunks} chunks, $${cost.toFixed(4)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('✗ voorbeeld-seed mislukt:', e);
  process.exit(1);
});
