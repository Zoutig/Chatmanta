// Mock website-pages per V0 sandbox-org.
//
// In V0 bestaat de website_pages tabel nog niet (komt in V1 Fase 5 met de
// Firecrawl-crawler). Deze mock geeft de UI een realistische set fake
// "gecrawlde pagina's" zodat de Kennisbank-tab Website iets te tonen heeft.
// Bij V1-koppeling vervangt een `listWebsitePages(orgId)` server-wrapper deze
// import; de types blijven identiek.

import type { OrgSlug } from '../../server/active-org';
import type { WebsitePage } from '../types';

const NOW = new Date();

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const MOCK_PAGES: Record<OrgSlug, WebsitePage[]> = {
  'dev-org': [
    {
      id: 'dev-1',
      title: 'Demo-organisatie · Home',
      url: 'https://demo.chatmanta.nl/',
      status: 'active',
      lastProcessedAt: daysAgo(1),
    },
    {
      id: 'dev-2',
      title: 'Demo-organisatie · Diensten',
      url: 'https://demo.chatmanta.nl/diensten',
      status: 'active',
      lastProcessedAt: daysAgo(1),
    },
  ],
  'acme-corp': [
    {
      id: 'acme-1',
      title: 'Dakwerken De Boer — Home',
      url: 'https://dakwerkendeboer.nl/',
      status: 'active',
      lastProcessedAt: daysAgo(2),
    },
    {
      id: 'acme-2',
      title: 'Onze diensten',
      url: 'https://dakwerkendeboer.nl/diensten',
      status: 'active',
      lastProcessedAt: daysAgo(2),
    },
    {
      id: 'acme-3',
      title: 'Prijzen & offerte',
      url: 'https://dakwerkendeboer.nl/prijzen',
      status: 'active',
      lastProcessedAt: daysAgo(2),
    },
    {
      id: 'acme-4',
      title: 'Veelgestelde vragen',
      url: 'https://dakwerkendeboer.nl/faq',
      status: 'active',
      lastProcessedAt: daysAgo(2),
    },
    {
      id: 'acme-5',
      title: 'Werkgebied',
      url: 'https://dakwerkendeboer.nl/werkgebied',
      status: 'disabled',
      lastProcessedAt: daysAgo(7),
    },
    {
      id: 'acme-6',
      title: 'Contact',
      url: 'https://dakwerkendeboer.nl/contact',
      status: 'active',
      lastProcessedAt: daysAgo(2),
    },
  ],
  'globex-inc': [
    {
      id: 'globex-1',
      title: 'FysioPlus Utrecht — Home',
      url: 'https://fysioplus-utrecht.nl/',
      status: 'active',
      lastProcessedAt: daysAgo(3),
    },
    {
      id: 'globex-2',
      title: 'Behandelingen',
      url: 'https://fysioplus-utrecht.nl/behandelingen',
      status: 'active',
      lastProcessedAt: daysAgo(3),
    },
    {
      id: 'globex-3',
      title: 'Tarieven & vergoedingen',
      url: 'https://fysioplus-utrecht.nl/tarieven',
      status: 'active',
      lastProcessedAt: daysAgo(3),
    },
    {
      id: 'globex-4',
      title: 'Afspraak maken',
      url: 'https://fysioplus-utrecht.nl/afspraak',
      status: 'active',
      lastProcessedAt: daysAgo(3),
    },
    {
      id: 'globex-5',
      title: 'Team',
      url: 'https://fysioplus-utrecht.nl/team',
      status: 'processing',
      lastProcessedAt: daysAgo(0),
    },
    {
      id: 'globex-6',
      title: 'Vacatures',
      url: 'https://fysioplus-utrecht.nl/vacatures',
      status: 'error',
      lastProcessedAt: daysAgo(5),
    },
  ],
  initech: [
    {
      id: 'initech-1',
      title: 'Bakker & Vermeer — Home',
      url: 'https://bakkervermeer.nl/',
      status: 'active',
      lastProcessedAt: daysAgo(4),
    },
    {
      id: 'initech-2',
      title: 'Diensten voor ondernemers',
      url: 'https://bakkervermeer.nl/ondernemers',
      status: 'active',
      lastProcessedAt: daysAgo(4),
    },
    {
      id: 'initech-3',
      title: 'Diensten voor particulieren',
      url: 'https://bakkervermeer.nl/particulier',
      status: 'active',
      lastProcessedAt: daysAgo(4),
    },
    {
      id: 'initech-4',
      title: 'Tarieven',
      url: 'https://bakkervermeer.nl/tarieven',
      status: 'active',
      lastProcessedAt: daysAgo(4),
    },
    {
      id: 'initech-5',
      title: 'Over ons',
      url: 'https://bakkervermeer.nl/over-ons',
      status: 'active',
      lastProcessedAt: daysAgo(4),
    },
  ],
};

export function getMockWebsitePages(orgSlug: OrgSlug): WebsitePage[] {
  return MOCK_PAGES[orgSlug] ?? [];
}
