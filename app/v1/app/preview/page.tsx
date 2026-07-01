// V1 Preview — "Test je chatbot": dezelfde echte RAG (askV1) als /v1/app, maar
// gepresenteerd als de bezoeker-look (chat-kaart op een sfeer-backdrop).
//
// Auth-keten = die van /v1/app/instellingen: geen sessie → getSessionOrg →
// requireAuth → redirect /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang".
// Org uit de sessie; chatbot onder de session-client (RLS).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { PreviewFrame } from './preview-frame';
import { V1Chat } from './v1-chat';

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

  return (
    <>
      <PageHead
        eyebrow="Preview"
        title="Test je chatbot"
        subtitle="Stel een vraag en zie het antwoord dat je bezoekers krijgen, gegrond op je kennisbank — precies zoals op je eigen site, vóór je live gaat."
      />
      <PreviewFrame>
        {chatbot ? (
          <V1Chat chatbotName={chatbot.name} />
        ) : (
          <div className="klant-card" style={{ width: 'min(560px, 100%)' }}>
            <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: 0 }}>
              Deze organisatie heeft nog geen chatbot geconfigureerd.
            </p>
          </div>
        )}
      </PreviewFrame>
    </>
  );
}
