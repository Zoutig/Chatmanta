// V0 Klantendashboard — root layout met sidebar + topbar.
//
// Server component: leest active-org cookie + org-list voor de switcher, geeft
// dat aan de Sidebar (waarvan een client-deel — OrgSwitcher — de switch via
// setActiveOrgAction triggert). Eén layout = consistente nav over alle 7
// schermen.

import './klant.css';
import type { Metadata } from 'next';
import { getActiveOrgFromCookies, listKnownOrgs, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { getMockChatbotSettings } from '@/lib/v0/klantendashboard/mock/chatbot-settings';
import { getMockWidgetSettings } from '@/lib/v0/klantendashboard/mock/widget-settings';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { TweaksPanel } from './components/tweaks/tweaks-panel';

export const metadata: Metadata = {
  title: 'ChatManta · Klantendashboard',
  description: 'Beheer je chatbot, bronnen en widget.',
};

export const dynamic = 'force-dynamic';

// V0 heeft geen ChatbotStatus persistence — afgeleid uit widget + bronnen.
// Bij V1 vervangt een echte status-kolom in `chatbots` deze afleiding.
function deriveChatbotStatus(
  widgetActive: boolean,
  widgetInstalled: boolean,
  hasSources: boolean,
): ChatbotStatus {
  if (widgetActive && widgetInstalled) return 'live';
  if (widgetInstalled && !widgetActive) return 'paused';
  if (hasSources) return 'testing';
  return 'concept';
}

export default async function KlantendashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const activeOrgBase = await getActiveOrgFromCookies();
  const activeOrg = {
    slug: activeOrgBase.slug,
    name: KNOWN_ORGS[activeOrgBase.slug].name,
  };
  const orgs = listKnownOrgs();
  const widget = getMockWidgetSettings(activeOrg.slug);
  const settings = getMockChatbotSettings(activeOrg.slug);

  // Approximation: heeft de org chatbot-name + welcome → mag in "testing".
  // Voor de demo-orgs (acme, globex, initech) zien we hierdoor 'testing' of
  // 'live' afhankelijk van widget; dev-org zonder widget blijft 'concept'.
  const hasSources = settings.companyDescription.length > 0;
  const chatbotStatus = deriveChatbotStatus(widget.isActive, widget.isInstalled, hasSources);

  return (
    <div data-klant-scope className="klant-shell">
      <Sidebar activeOrg={activeOrg} orgs={orgs} />
      <Topbar orgName={activeOrg.name} chatbotStatus={chatbotStatus} />
      <main className="klant-main">{children}</main>
      <TweaksPanel />
    </div>
  );
}
