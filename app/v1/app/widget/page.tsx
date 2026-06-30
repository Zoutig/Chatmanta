// V1 Widget — uiterlijk van de embed-widget + installatie-snippet.
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie
// (organization_members), niet uit env. Reads onder de session-client (RLS). De
// uiterlijk-velden worden opgeslagen via de BESTAANDE saveChatbotSettingsAction
// (instellingen/actions.ts) — die accepteert de widget-velden al via
// sanitizeChatbotPatch. De embed-snippet wijst naar /widget-v1.js → iframe op
// /embed-v1/<slug> (zie public/widget-v1.js). allowed_domains is Jorion-beheerd
// (M-D): hier alleen READ-ONLY getoond, niet klant-instelbaar.

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import { V1WidgetForm } from './widget-form';

export const dynamic = 'force-dynamic';

export default async function V1WidgetPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Widget" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <PageHead
        eyebrow="Widget"
        title="Plaats je chatbot op je website"
        subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
      />
    );
  }

  const settings = await getChatbotSettings(supabase, chatbot.id);

  // Slug (voor de embed-snippet) + allowed_domains (read-only) — onder RLS.
  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle();
  const { data: botRow } = await supabase
    .from('chatbots')
    .select('allowed_domains')
    .eq('id', chatbot.id)
    .maybeSingle();
  const allowedDomains = ((botRow?.allowed_domains as string[] | null) ?? []).filter(Boolean);

  return (
    <>
      <PageHead
        eyebrow="Widget"
        title="Plaats je chatbot op je website"
        subtitle="Een paar regels code, jouw kleuren, jouw positie — bezoekers zien meteen dat het bij je site hoort."
      />
      <V1WidgetForm initial={settings} slug={(org?.slug as string | undefined) ?? ''} allowedDomains={allowedDomains} />
    </>
  );
}
