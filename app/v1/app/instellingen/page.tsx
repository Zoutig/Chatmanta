// V1 Instellingen — klant configureert z'n chatbot (toon/taal/antwoordgedrag/fallback).
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie. Read onder
// de session-client (RLS); de save-action schrijft via de V1 service-role ná
// requireOrgMember (zie actions.ts, SA-1).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from './settings-config';
import { V1SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function V1InstellingenPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Instellingen" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <PageHead
        eyebrow="Instellingen"
        title="Hoe je chatbot praat en denkt"
        subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
      />
    );
  }

  const settings = await getChatbotSettings(supabase, chatbot.id);

  return (
    <>
      <PageHead
        eyebrow="Instellingen"
        title="Hoe je chatbot praat en denkt"
        subtitle={
          <>
            Bepaal hoe <strong>{chatbot.name}</strong> antwoordt — toon, taal, antwoordgedrag en het fallbackbericht.
            Wijzigingen werken direct door in nieuwe gesprekken.
          </>
        }
      />
      <V1SettingsForm initial={settings} />
    </>
  );
}
