// V0 Klantendashboard — Scherm 5: Widget.
//
// Installatie + uiterlijk + preview + live-status. "Installatie testen" leest
// nu de echte heartbeat-status (lastSeenAt) via checkWidgetInstallationAction;
// uiterlijk-save + activate/pause persisteren in v0_org_settings.widget jsonb.
// De embed-snippet wijst naar /widget.js → iframe op /embed/<slug>.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { DashboardWidgetSwitch } from '@/app/components/dashboard-widget-switch';
import { PageHead } from '../components/ui/page-head';
import { WidgetForm } from './components/widget-form';

export const dynamic = 'force-dynamic';

export default async function WidgetPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const orgSettings = await getOrgSettings(activeOrg.slug);
  const widget = orgSettings.widget;
  const settings = orgSettings.chatbot;

  return (
    <>
      <PageHead
        eyebrow="Widget"
        title="Plaats je chatbot op je website"
        subtitle="Een paar regels code, jouw kleuren, jouw positie — bezoekers zien meteen dat het bij je site hoort."
        actions={<DashboardWidgetSwitch current="dashboard" variant="dashboard" />}
      />

      <WidgetForm
        key={activeOrg.slug}
        initial={widget}
        chatbotName={settings.chatbotName}
        welcomeMessage={settings.welcomeMessage}
        orgSlug={activeOrg.slug}
        botVersion={LATEST_BOT_VERSION}
        starterQuestions={settings.showStarterQuestions === false ? [] : settings.starterQuestions}
      />
    </>
  );
}
