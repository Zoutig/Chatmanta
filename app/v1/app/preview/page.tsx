// V1 Preview — "Test je chatbot": FAB+paneel widget-look over een faux-website-mockup,
// gespiegeld op V0's preview-pagina. Auth-keten = die van /v1/app: geen sessie →
// getSessionOrg → requireAuth → redirect /v1/login; geen lid → AUTH_FORBIDDEN.
// Org uit de sessie; chatbot + settings onder de session-client (RLS).
//
// Firecrawl-screenshot is bewust overgeslagen (billable) — de PreviewFrame toont
// een stijlvol mockup-backdrop in plaats van een echte screenshot.

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import { PreviewFrame } from './preview-frame';
import { V1PreviewWidget } from './v1-chat';

export const dynamic = 'force-dynamic';

export default async function V1PreviewPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Preview" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  const settings = chatbot ? await getChatbotSettings(supabase, chatbot.id) : null;

  return (
    <>
      <PageHead
        eyebrow="Preview"
        title="Test je chatbot"
        subtitle="Stel een vraag en zie het antwoord dat je bezoekers krijgen, gegrond op je kennisbank — precies zoals op je eigen site, vóór je live gaat."
      />
      {chatbot && settings ? (
        <PreviewFrame>
          <V1PreviewWidget
            orgId={orgId}
            chatbotId={chatbot.id}
            chatbotName={chatbot.name}
            welcomeMessage={settings.welcomeMessage}
            // showStarterQuestions=false → geen chips; undefined/true → toon ze.
            starterQuestions={settings.showStarterQuestions === false ? [] : (settings.starterQuestions ?? [])}
            accentColor={settings.accentColor}
            position={settings.position}
            headerTitle={settings.headerTitle}
            launcherText={settings.launcherText}
          />
        </PreviewFrame>
      ) : (
        <div className="klant-card" style={{ width: 'min(560px, 100%)' }}>
          <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: 0 }}>
            Deze organisatie heeft nog geen chatbot geconfigureerd.
          </p>
        </div>
      )}
    </>
  );
}
