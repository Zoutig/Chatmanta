// Per-org content-bundles voor /widget demo-platform.
//
// Elke skin bevat de tekst + branding die de fake klant-website rendered,
// plus suggested questions die de chat-widget toont bij opening. Slugs
// matchen KNOWN_ORGS in lib/v0/server/active-org.ts. De widget gebruikt
// de slug om ?org=<slug> mee te geven aan /api/v0/chat zodat retrieval
// gescoped is op de juiste sandbox-org.
//
// Geen lorem-ipsum — branche-tone houdt de demo geloofwaardig richting
// prospects. Suggested-questions zijn breed gehouden zodat ze leunen op
// veel-voorkomende ingest-content (over-ons, diensten, tarieven).

import type { OrgSlug } from '@/lib/v0/server/active-org';

export type OrgSkin = {
  /** Stable identifier — matcht KNOWN_ORGS slug. */
  slug: OrgSlug;
  /** Wat de fake-website als bedrijfsnaam toont. */
  companyName: string;
  /** Korte 1-regel tagline onder de bedrijfsnaam in de header. */
  tagline: string;
  /** Quick-reply chips die de widget toont bij eerste opening. */
  suggestedQuestions: string[];
  /**
   * Sub-pagina's die de fake-website rendert. Elke entry mapt 1:1 naar een
   * markdown-bestand in `scripts/fixtures/sandbox-orgs/<slug>/`. De eerste
   * entry is de "home" — `/widget` redirect daar naartoe. Orgs zonder
   * markdown-bronnen (zoals `dev-org`) krijgen een lege array en worden
   * uitgesloten via `ORG_SLUGS_WIDGET`.
   */
  pages: Array<{ slug: string; navLabel: string; mdFile: string }>;
  /** Primary accent kleur (HEX). Gebruikt voor knoppen, links, accents. */
  primaryColor: string;
  /** Achtergrondkleur van de hele fake-site. */
  bgColor: string;
  /** Tekstkleur op de site. */
  textColor: string;
  /** Subtiele card-bg. */
  cardColor: string;
};

const DEV_ORG: OrgSkin = {
  slug: 'dev-org',
  companyName: 'ChatManta',
  tagline: 'AI-klantcontact voor het MKB',
  suggestedQuestions: [
    'Wat doet ChatManta precies?',
    'Wat kost het per maand?',
    'Voor wie is dit bedoeld?',
    'Hoe lang duurt installeren?',
  ],
  // Dev-org heeft geen markdown-bronnen in scripts/fixtures/. Wordt
  // uitgesloten van de widget-demo via ORG_SLUGS_WIDGET.
  pages: [],
  primaryColor: '#00CC9B',
  bgColor: '#0a1118',
  textColor: '#eaf6fb',
  cardColor: 'rgba(255,255,255,0.04)',
};

const ACME_CORP: OrgSkin = {
  slug: 'acme-corp',
  companyName: 'Dakwerken De Boer',
  tagline: 'Vakwerk op uw dak — al sinds 1987',
  suggestedQuestions: [
    'Komen jullie ook bij mij in de buurt?',
    'Wat kost een dakinspectie?',
    'Doen jullie ook spoedreparaties?',
    'Hoe lang duurt een nieuw dak?',
  ],
  pages: [
    { slug: 'over-ons', navLabel: 'Over ons', mdFile: '01-over-ons.md' },
    { slug: 'diensten', navLabel: 'Diensten', mdFile: '04-diensten-overzicht.md' },
    { slug: 'spoed', navLabel: 'Spoed', mdFile: '14-spoedreparatie-lekkages.md' },
    { slug: 'onderhoud', navLabel: 'Onderhoud', mdFile: '15-onderhoudscontract.md' },
    { slug: 'werkgebied', navLabel: 'Werkgebied', mdFile: '16-werkgebied.md' },
    { slug: 'faq', navLabel: 'FAQ', mdFile: '17-faq.md' },
    { slug: 'contact', navLabel: 'Contact', mdFile: '30-contact-en-vestiging.md' },
  ],
  primaryColor: '#c4471c',
  bgColor: '#1a1612',
  textColor: '#f4ede4',
  cardColor: 'rgba(196,71,28,0.05)',
};

const GLOBEX_INC: OrgSkin = {
  slug: 'globex-inc',
  companyName: 'FysioPlus Utrecht',
  tagline: 'Beweging zonder pijn — in het hart van de stad',
  suggestedQuestions: [
    'Heb ik een verwijzing van de huisarts nodig?',
    'Wordt fysio vergoed door mijn verzekering?',
    'Doen jullie aan manuele therapie?',
    'Hoe lang duurt een behandeling?',
  ],
  pages: [
    { slug: 'over-ons', navLabel: 'Over ons', mdFile: '01-over-ons.md' },
    { slug: 'behandelingen', navLabel: 'Behandelingen', mdFile: '04-behandelingen-overzicht.md' },
    { slug: 'manuele-therapie', navLabel: 'Manuele therapie', mdFile: '06-manuele-therapie.md' },
    { slug: 'tarieven', navLabel: 'Tarieven', mdFile: '18-tarieven.md' },
    { slug: 'vergoeding', navLabel: 'Vergoeding', mdFile: '17-zorgverzekering-vergoeding.md' },
    { slug: 'eerste-afspraak', navLabel: 'Eerste afspraak', mdFile: '19-eerste-afspraak.md' },
    { slug: 'faq', navLabel: 'FAQ', mdFile: '20-faq.md' },
  ],
  primaryColor: '#1e9a7c',
  bgColor: '#f7faf9',
  textColor: '#0e2e26',
  cardColor: '#ffffff',
};

const INITECH: OrgSkin = {
  slug: 'initech',
  companyName: 'Bakker & Vermeer Accountants',
  tagline: 'Cijfers die voor u werken',
  suggestedQuestions: [
    'Doen jullie ook ZZP-aangiften?',
    'Wat kost de boekhouding per maand?',
    'Hoe werkt het online dossier?',
    'Helpen jullie ook bij een bedrijfsovername?',
  ],
  pages: [
    { slug: 'over-ons', navLabel: 'Over ons', mdFile: '01-over-ons.md' },
    { slug: 'diensten', navLabel: 'Diensten', mdFile: '05-diensten-overzicht.md' },
    { slug: 'zzp', navLabel: 'ZZP', mdFile: '15-zzp-pakketten.md' },
    { slug: 'mkb', navLabel: 'MKB', mdFile: '16-mkb-pakketten.md' },
    { slug: 'tarieven', navLabel: 'Tarieven', mdFile: '19-tarieven-en-pakketten.md' },
    { slug: 'online-dossier', navLabel: 'Online dossier', mdFile: '21-software-tooling.md' },
    { slug: 'contact', navLabel: 'Contact', mdFile: '31-contact-en-bereikbaarheid.md' },
  ],
  primaryColor: '#1d4a8e',
  bgColor: '#f4f6fa',
  textColor: '#0d1c33',
  cardColor: '#ffffff',
};

export const ORG_SKINS: Record<OrgSlug, OrgSkin> = {
  'dev-org': DEV_ORG,
  'acme-corp': ACME_CORP,
  'globex-inc': GLOBEX_INC,
  initech: INITECH,
};

export const ORG_SLUGS_ORDERED: OrgSlug[] = [
  'dev-org',
  'acme-corp',
  'globex-inc',
  'initech',
];

/**
 * Orgs die in de `/widget` demo-rotatie meedoen — alleen orgs met
 * markdown-bronnen (`pages.length > 0`). Dev-org valt af omdat er geen
 * fixtures voor zijn. Wordt gebruikt door de demo-dropdown en de
 * cookie→eerste-pagina redirect in `app/widget/page.tsx`.
 */
export const ORG_SLUGS_WIDGET: OrgSlug[] = ORG_SLUGS_ORDERED.filter(
  (s) => ORG_SKINS[s].pages.length > 0,
);

export function getSkin(slug: string): OrgSkin {
  if (slug in ORG_SKINS) return ORG_SKINS[slug as OrgSlug];
  return DEV_ORG;
}

/**
 * Vind een `OrgSkin.pages` entry op basis van slug+pageSlug, of `null`
 * als de combinatie niet bestaat. Gebruikt door de markdown-loader voor
 * path-traversal-validatie: pageSlug moet expliciet in de curated lijst
 * staan voor we een .md-pad samenstellen.
 */
export function findPage(
  slug: string,
  pageSlug: string,
): { slug: string; navLabel: string; mdFile: string } | null {
  const skin = getSkin(slug);
  return skin.pages.find((p) => p.slug === pageSlug) ?? null;
}

/**
 * Klantendashboard-overrides → skin-velden.
 *
 * BELANGRIJK: deze helper raakt skin.primaryColor *niet* aan. Dat veld
 * wordt door FakeSite gebruikt voor de hele landing-page (buttons, links,
 * accents) en moet de org-default volgen — anders verandert de hele
 * demo-website mee wanneer de klant alleen de widget-kleur wijzigt.
 *
 * Widget-kleuren lopen daarom direct via `widgetOverrides` naar
 * ChatMantaWidget (zie WidgetShell). Hier mergen we alleen velden die
 * écht in de skin horen (suggested questions = starter-questions).
 */
export function applyWidgetOverrides(
  skin: OrgSkin,
  overrides: {
    starterQuestions?: string[];
  },
): OrgSkin {
  return {
    ...skin,
    suggestedQuestions:
      overrides.starterQuestions && overrides.starterQuestions.length > 0
        ? overrides.starterQuestions
        : skin.suggestedQuestions,
  };
}
