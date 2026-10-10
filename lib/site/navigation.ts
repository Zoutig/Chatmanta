// Marketingsite — routes, sectie-ankers en navigatie. Eén bron voor nav, footer,
// sitemap en de sectie-componenten (contract: docs/site/CONTRACT.md).

export const SITE_URL = 'https://www.chatmanta.nl';

export const ROUTES = {
  home: '/',
  kennismaking: '/kennismaking',
  login: '/v1/login',
  demo: '/voorbeeld',
  privacy: '/privacy',
  voorwaarden: '/voorwaarden',
} as const;

/** Anker-id per sectie op `/`. Wijzig nooit los: nav, footer en sectie lezen dit. */
export const SECTION_IDS = {
  hero: 'top',
  trust: 'vertrouwen',
  problem: 'probleem',
  how: 'hoe-het-werkt',
  features: 'functies',
  honest: 'eerlijk',
  dashboard: 'dashboard',
  roi: 'rekenhulp',
  pricing: 'prijzen',
  demo: 'demo',
  faq: 'faq',
  finalCta: 'contact',
} as const;

export type SectionKey = keyof typeof SECTION_IDS;

/** `/#id` werkt zowel op de homepage (zelfde document → scrollt) als op subpagina's. */
export const anchor = (key: SectionKey): string => `/#${SECTION_IDS[key]}`;

/** Hoofdnavigatie (volgorde = volgorde op de pagina; actieve-sectie-indicator leest dit). */
export const NAV_ITEMS: ReadonlyArray<{ label: string; key: SectionKey }> = [
  { label: 'Hoe het werkt', key: 'how' },
  { label: 'Functies', key: 'features' },
  { label: 'Prijzen', key: 'pricing' },
  { label: 'Demo', key: 'demo' },
  { label: 'FAQ', key: 'faq' },
];
