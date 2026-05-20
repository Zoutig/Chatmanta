// V0 Klantendashboard — Scherm 3: Test chatbot.
//
// Server component: leest welkomstbericht, startsuggesties, naam, kleur uit de
// persisted org-settings (v0_org_settings, fallback op mock-defaults via
// getOrgSettings) van de actieve org. De daadwerkelijke chat gebeurt via een
// server-action wrapper rond runRagQueryStreaming (zie ./actions.ts) —
// synchrone "ask → get answer" voor v0.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { PageHeader } from '../components/page-header';
import { ChatPreview } from './components/chat-preview';

export const dynamic = 'force-dynamic';

export default async function TestPage() {
  const activeOrg = await getActiveOrgFromCookies();
  // getOrgSettings merget v0_org_settings met de mock-defaults zodat tone-of-
  // voice wijzigingen (welkomstbericht, starter-questions, etc.) meteen
  // zichtbaar zijn in het test-scherm i.p.v. alleen in de widget-flow.
  const settings = await getOrgSettings(activeOrg.slug);

  return (
    <>
      <PageHeader
        title="Test je chatbot"
        subtitle="Stel testvragen om te zien hoe je chatbot antwoordt op basis van je bronnen — voordat je hem live zet."
      />

      <ChatPreview
        orgSlug={activeOrg.slug}
        botVersion={LATEST_BOT_VERSION}
        chatbotName={settings.chatbot.chatbotName}
        welcomeMessage={settings.chatbot.welcomeMessage}
        starterQuestions={settings.chatbot.starterQuestions}
        primaryColor={settings.widget.primaryColor}
      />
    </>
  );
}
