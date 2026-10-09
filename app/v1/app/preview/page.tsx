// V1 Preview (spec §7.6b): de echte V1-widget-weergave op een neutrale nep-website.
// Geen menu-item; bereikbaar via "Bekijk chatbot" op Overzicht en Widget.
// Auth-keten = die van /v1/app: geen sessie → redirect /v1/login; geen lid →
// AUTH_FORBIDDEN. Org uit de sessie; chatbot + settings onder de session-client (RLS).
//
// Privacy: de client krijgt alleen WidgetAppearance (expliciet per veld), nooit
// de ruwe settings.

import Link from 'next/link';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { toWidgetAppearance } from '@/lib/v1/widget/appearance';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import { PreviewFrame } from './preview-frame';
import { V1PreviewWidget } from './v1-chat';
import './preview.css';

export const dynamic = 'force-dynamic';

export default async function V1PreviewPage() {
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
    return <PageHeader title="Test je chatbot" description="Er is nog geen chatbot ingesteld." />;
  }
  const settings = await getChatbotSettings(supabase, chatbot.id);
  const appearance = toWidgetAppearance(settings, chatbot.name);

  return (
    <div className="v1-page">
      <PageHeader
        title="Test je chatbot"
        description="Stel een vraag en zie precies wat je bezoekers te zien krijgen."
        actions={
          <Link href="/v1/app/widget" className={buttonClass({ variant: 'secondary' })}>
            Naar Widget
          </Link>
        }
      />
      <PreviewFrame>
        <V1PreviewWidget orgId={orgId} chatbotId={chatbot.id} appearance={appearance} />
      </PreviewFrame>
    </div>
  );
}
