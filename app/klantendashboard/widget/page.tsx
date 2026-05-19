// V0 Klantendashboard — Scherm 5: Widget.
//
// Installatie + uiterlijk + preview + live-status. Voor v0 zijn alle writes
// (uiterlijk-save, activate/pause, "installatie testen") mock. De /widget
// route op deze app (gemerged in PR #59) is een aparte demo-pagina voor
// prospects — we linken er heen vanuit live-status.

import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHeader } from '../components/page-header';
import { WidgetForm } from './components/widget-form';

export const dynamic = 'force-dynamic';

export default async function WidgetPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const orgSettings = await getOrgSettings(activeOrg.slug);
  const widget = orgSettings.widget;
  const settings = orgSettings.chatbot;

  return (
    <>
      <PageHeader
        title="Widget"
        subtitle="Plaats de chatbot op je website en bepaal hoe hij eruitziet."
      />

      <WidgetForm
        key={activeOrg.slug}
        initial={widget}
        chatbotName={settings.chatbotName}
        welcomeMessage={settings.welcomeMessage}
        workspaceId={KNOWN_ORGS[activeOrg.slug].id}
      />
    </>
  );
}
