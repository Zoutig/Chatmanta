// V0 Klantendashboard — Scherm 5: Widget.
//
// Installatie + uiterlijk + preview + live-status. Voor v0 zijn alle writes
// (uiterlijk-save, activate/pause, "installatie testen") mock. De /widget
// route op deze app (gemerged in PR #59) is een aparte demo-pagina voor
// prospects — we linken er heen vanuit live-status.

import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { getMockWidgetSettings } from '@/lib/v0/klantendashboard/mock/widget-settings';
import { getMockChatbotSettings } from '@/lib/v0/klantendashboard/mock/chatbot-settings';
import { PageHeader } from '../components/page-header';
import { WidgetForm } from './components/widget-form';

export const dynamic = 'force-dynamic';

export default async function WidgetPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const widget = getMockWidgetSettings(activeOrg.slug);
  const settings = getMockChatbotSettings(activeOrg.slug);

  return (
    <>
      <PageHeader
        title="Widget"
        subtitle="Plaats de chatbot op je website en bepaal hoe hij eruitziet."
      />

      <WidgetForm
        initial={widget}
        chatbotName={settings.chatbotName}
        welcomeMessage={settings.welcomeMessage}
        workspaceId={KNOWN_ORGS[activeOrg.slug].id}
      />
    </>
  );
}
