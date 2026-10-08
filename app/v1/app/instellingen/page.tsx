// V1 Instellingen: klant configureert z'n chatbot (toon/taal/antwoordgedrag/fallback).
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie. Read onder
// de session-client (RLS); de save-action schrijft via de V1 service-role ná
// requireOrgMember (zie actions.ts, SA-1).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import Link from 'next/link';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
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
      return <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return <PageHeader title="Chatbot" description="Er is nog geen chatbot voor je organisatie ingesteld." />;
  }

  const settings = await getChatbotSettings(supabase, chatbot.id);

  return (
    <div className="v1-page">
      <PageHeader
        title="Chatbot"
        description="Hoe je chatbot heet, klinkt en antwoordt. Wijzigingen gelden direct voor nieuwe gesprekken."
        actions={
          <Link href="/v1/app/preview" className={buttonClass({ variant: 'secondary' })}>
            Bekijk chatbot
          </Link>
        }
      />
      <V1SettingsForm initial={settings} />
    </div>
  );
}
