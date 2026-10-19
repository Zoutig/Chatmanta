// Marketingsite — routes, sectie-ankers en navigatie. Eén bron voor nav, footer,
// sitemap en de sectie-componenten (contract: docs/site/CONTRACT.md).

export const SITE_URL = 'https://www.chatmanta.nl';

export const ROUTES = {
  home: '/',
  kennismaking: '/kennismaking',
  contact: '/contact',
  login: '/v1/login',
  demo: '/voorbeeld',
  privacy: '/privacy',
  voorwaarden: '/voorwaarden',
} as const;

/** Anker-id per sectie op `/`. Wijzig nooit los: nav, footer en sectie lezen dit. */
export const SECTION_IDS = {
  hero: 'top',
  how: 'hoe-het-werkt',
  features: 'functies',
  honest: 'eerlijk',
  /** Uitklapbare rekenhulp binnen de prijzensectie (geen eigen sectie meer). */
  roi: 'rekenhulp',
  pricing: 'prijzen',
  demo: 'demo',
  faq: 'faq',
  finalCta: 'contact',
} as const;

export type SectionKey = keyof typeof SECTION_IDS;

/**
 * Volgorde van de secties op `/` (app/(site)/page.tsx volgt dit). Ronde "site rustiger"
 * (okt 2026): 12 → 8 secties; bewijs (demo) en "eerlijk" staan vooraan. Vervallen als
 * eigen sectie: vertrouwensstrook (nu in "eerlijk"), probleem (opgegaan in "eerlijk"),
 * dashboard (screenshot nu in "functies", alleen desktop), rekenhulp (uitklapbaar in "prijzen").
 */
export const PAGE_ORDER: ReadonlyArray<SectionKey> = [
  'hero',
  'honest',
  'demo',
  'how',
  'features',
  'pricing',
  'faq',
  'finalCta',
];

/** `/#id` werkt zowel op de homepage (zelfde document → scrollt) als op subpagina's. */
export const anchor = (key: SectionKey): string => `/#${SECTION_IDS[key]}`;

/** Hoofdnavigatie (volgorde = volgorde op de pagina; actieve-sectie-indicator leest dit). */
export const NAV_ITEMS: ReadonlyArray<{ label: string; key: SectionKey }> = [
  { label: 'Demo', key: 'demo' },
  { label: 'Hoe het werkt', key: 'how' },
  { label: 'Functies', key: 'features' },
  { label: 'Prijzen', key: 'pricing' },
  { label: 'FAQ', key: 'faq' },
];
