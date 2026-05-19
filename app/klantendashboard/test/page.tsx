// V0 Klantendashboard — Scherm 3: Test chatbot.
//
// Server component: leest welkomstbericht, startsuggesties, naam, kleur uit de
// mock chatbot/widget-settings van de actieve org. De daadwerkelijke chat
// gebeurt via een server-action wrapper rond runRagQueryStreaming (zie
// ./actions.ts) — synchrone "ask → get answer" voor v0.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getMockChatbotSettings } from '@/lib/v0/klantendashboard/mock/chatbot-settings';
import { getMockWidgetSettings } from '@/lib/v0/klantendashboard/mock/widget-settings';
import { PageHeader } from '../components/page-header';
import { ChatPreview } from './components/chat-preview';

export const dynamic = 'force-dynamic';

export default async function TestPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = getMockChatbotSettings(activeOrg.slug);
  const widget = getMockWidgetSettings(activeOrg.slug);

  return (
    <>
      <PageHeader
        title="Test je chatbot"
        subtitle="Stel testvragen om te zien hoe je chatbot antwoordt op basis van je bronnen — voordat je hem live zet."
      />

      <ChatPreview
        chatbotName={settings.chatbotName}
        welcomeMessage={settings.welcomeMessage}
        starterQuestions={settings.starterQuestions}
        primaryColor={widget.primaryColor}
      />
    </>
  );
}
