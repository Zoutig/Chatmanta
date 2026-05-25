// Mock widget-settings per V0 sandbox-org.
//
// In V0 bestaat widget_settings nog niet als tabel. De /widget demo-route
// gebruikt z'n eigen org-skins (lib/widget/org-skins) voor de visuele branding;
// dit hier is de klantendashboard-zijde: hoe ZIET de klant zijn widget-config?

import type { OrgSlug } from '../../server/active-org';
import type { WidgetSettings } from '../types';

const MOCK_WIDGET: Record<OrgSlug, WidgetSettings> = {
  'dev-org': {
    primaryColor: '#4dd6e8',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'Hoi! Hoe kan ik je helpen?',
    subtitle: 'Wij reageren meestal binnen een paar minuten.',
    launcherText: 'Chat met ons',
    theme: 'auto',
    isInstalled: false,
    isActive: false,
    lastCheckedAt: null,
  },
  'acme-corp': {
    primaryColor: '#d97706',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'Vraag het Dakwerken De Boer',
    subtitle: 'Stel je vraag over daken, lekkages of offertes.',
    launcherText: 'Stel je vraag',
    theme: 'light',
    isInstalled: true,
    isActive: true,
    lastCheckedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  'globex-inc': {
    primaryColor: '#0891b2',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'FysioPlus chat-assistent',
    subtitle: 'Vraag naar afspraken, vergoedingen en behandelingen.',
    launcherText: 'Open chat',
    theme: 'light',
    isInstalled: true,
    isActive: true,
    lastCheckedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  initech: {
    primaryColor: '#475569',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'Bakker & Vermeer · advies',
    subtitle: 'Snel antwoord op je administratie- en belastingvraag.',
    launcherText: 'Stel je vraag',
    theme: 'light',
    isInstalled: false,
    isActive: false,
    lastCheckedAt: null,
  },
  // Lege demo-org — widget nog niet geplaatst/actief → status blijft 'concept'.
  'demo-nieuw': {
    primaryColor: '#00CC9B',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'Hoi! Hoe kan ik je helpen?',
    subtitle: 'Stel je vraag, ik help je graag verder.',
    launcherText: 'Chat met ons',
    theme: 'auto',
    isInstalled: false,
    isActive: false,
    lastCheckedAt: null,
  },
};

export function getMockWidgetSettings(orgSlug: OrgSlug): WidgetSettings {
  return MOCK_WIDGET[orgSlug] ?? MOCK_WIDGET['dev-org'];
}
