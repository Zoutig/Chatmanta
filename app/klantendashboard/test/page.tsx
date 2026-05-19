// V0 Klantendashboard — Scherm 3: Test chatbot.
//
// Server component: leest welkomstbericht, startsuggesties, naam uit de
// chatbot-settings, en de hele widget-config uit `getOrgSettings` (DB-merged
// over mock-defaults). Daardoor reflecteert de testomgeving exact wat in
// /klantendashboard/widget is opgeslagen: kleuren, titel, subtitel, logo,
// positie. De daadwerkelijke chat gebeurt via een server-action wrapper
// rond runRagQueryStreaming (zie ./actions.ts) — synchrone "ask → get answer"
// voor v0.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHeader } from '../components/page-header';
import { ChatPreview } from './components/chat-preview';

export const dynamic = 'force-dynamic';

export default async function TestPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = await getOrgSettings(activeOrg.slug);

  return (
    <>
      <PageHeader
        title="Test je chatbot"
        subtitle="Stel testvragen om te zien hoe je chatbot antwoordt op basis van je bronnen — voordat je hem live zet."
      />

      <ChatPreview
        welcomeMessage={settings.chatbot.welcomeMessage}
        starterQuestions={settings.chatbot.starterQuestions}
        widget={settings.widget}
      />
    </>
  );
}
