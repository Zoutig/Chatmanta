// Vaste voorbeelddata voor de Kennisbank van De Duinhoeve: documenten, de
// voorbeeldwebsite als website-bron en eigen Q&A. De paginatekst komt uit
// site-content.ts, zodat het dashboard precies laat zien wat de chatbot kent.
import type { UploadedDoc } from '@/app/voorbeeld/(dashboard)/kennisbank/v1-documents';
import type { QAItem } from '@/app/voorbeeld/(dashboard)/kennisbank/qa/qa-tab';
import type { WebsitePage, WebsiteSource } from '@/app/voorbeeld/(dashboard)/kennisbank/types';
import { SITE_PAGES, getPageBySlug, pageToPlainText } from '@/lib/voorbeeld/site-content';
import { daysAgo } from './contact';

const ORIGIN = 'https://www.chatmanta.nl';
export const DEMO_SITE_ROOT = `${ORIGIN}/voorbeeld/website`;
const DEMO_SITE_HOST = 'chatmanta.nl';

// ─── Documenten ──────────────────────────────────────────────────────────────

/** Elk document is een "export" van de bijbehorende websitepagina(s). */
const DOC_SOURCES: Record<string, { intro: string; slugs: string[] }> = {
  'vb-doc-huisregels': {
    intro: 'Huisregels Vakantiepark De Duinhoeve, versie 2027. Uitgereikt bij aankomst en te vinden in elke accommodatie.',
    slugs: ['huisregels'],
  },
  'vb-doc-prijslijst': {
    intro: 'Prijslijst seizoen 2027. Alle prijzen zijn inclusief btw en exclusief toeristenbelasting, tenzij anders vermeld.',
    slugs: ['prijzen'],
  },
  'vb-doc-annuleren': {
    intro: 'Annuleringsvoorwaarden Vakantiepark De Duinhoeve.',
    slugs: ['annuleren'],
  },
  'vb-doc-welkomstmap': {
    intro: 'Welkomstmap voor gasten: aankomst, vertrek en alles over je huisdier op het park.',
    slugs: ['aankomst-en-vertrek', 'huisdieren'],
  },
};

export const DEMO_DOCUMENTS: UploadedDoc[] = [
  { id: 'vb-doc-welkomstmap', filename: 'Welkomstmap gasten 2027.pdf', status: 'ready', createdAt: daysAgo(9, 14, 20), chunkCount: 14 },
  { id: 'vb-doc-huisregels', filename: 'Huisregels 2027.pdf', status: 'ready', createdAt: daysAgo(23, 10, 5), chunkCount: 8 },
  { id: 'vb-doc-prijslijst', filename: 'Prijslijst seizoen 2027.pdf', status: 'ready', createdAt: daysAgo(23, 10, 2), chunkCount: 12 },
  { id: 'vb-doc-annuleren', filename: 'Annuleringsvoorwaarden.docx', status: 'ready', createdAt: daysAgo(41, 16, 45), chunkCount: 6 },
];

export function demoDocText(docId: string): string {
  const src = DOC_SOURCES[docId];
  if (!src) return '(leeg)';
  const body = src.slugs
    .map((s) => getPageBySlug(s))
    .filter((p) => p !== undefined)
    .map((p) => pageToPlainText(p))
    .join('\n\n');
  return `${src.intro}\n\n${body}`;
}

// ─── Website-bron: de voorbeeldwebsite ───────────────────────────────────────

const MISSING_PATH = '/voorbeeld/website/nieuws';
const DISABLED_SLUGS = new Set(['privacy', 'vacatures']);

function pageId(path: string): string {
  return `vb-page-${path.replace(/^\/voorbeeld\/website\/?/, '').replace(/\//g, '-') || 'home'}`;
}

/** Een website-pagina voor een (willekeurige) URL; titel uit site-content als die bestaat. */
export function demoPageFromUrl(url: string): WebsitePage {
  let path = url;
  try {
    path = new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    // laat de rauwe URL staan
  }
  const known = SITE_PAGES.find((p) => p.path === path);
  return {
    id: known ? pageId(known.path) : `vb-page-${Math.random().toString(36).slice(2, 10)}`,
    title: known?.title ?? url,
    url,
    status: 'active',
    lastProcessedAt: new Date().toISOString(),
    included: true,
    errorMessage: null,
  };
}

/** Platte tekst van een pagina van de voorbeeldwebsite (zoals de chatbot hem kent). */
export function demoPageText(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    // geen geldige URL
  }
  const page = SITE_PAGES.find((p) => p.path === path);
  if (page) return pageToPlainText(page);
  return 'In het voorbeeld wordt deze pagina niet echt opgehaald. Bij een echte website zie je hier de tekst die je chatbot van de pagina gebruikt.';
}

/** "Gevonden" pagina's bij Website ophalen: altijd de pagina's van de voorbeeldwebsite. */
export function demoDiscoverUrls(rootUrl: string): string[] {
  let origin = ORIGIN;
  try {
    origin = new URL(rootUrl).origin;
  } catch {
    // val terug op de voorbeeldwebsite
  }
  return SITE_PAGES.map((p) => `${origin}${p.path}`);
}

export function getDemoWebsiteSources(): WebsiteSource[] {
  const crawledAt = daysAgo(2, 7, 30);
  const pages: WebsitePage[] = SITE_PAGES.map((p) => {
    const off = DISABLED_SLUGS.has(p.slug);
    return {
      id: pageId(p.path),
      title: p.title,
      url: `${ORIGIN}${p.path}`,
      status: off ? 'disabled' : 'active',
      lastProcessedAt: crawledAt,
      included: !off,
      errorMessage: null,
    };
  });
  pages.push({
    id: pageId(MISSING_PATH),
    title: `${ORIGIN}${MISSING_PATH}`,
    url: `${ORIGIN}${MISSING_PATH}`,
    status: 'error',
    lastProcessedAt: crawledAt,
    included: true,
    errorMessage: 'HTTP 404',
  });

  return [
    {
      source: { id: 'vb-src-duinhoeve', rootUrl: DEMO_SITE_ROOT, host: DEMO_SITE_HOST, status: 'ready' },
      job: {
        status: 'completed',
        error: null,
        completed: pages.length,
        total: pages.length,
        events: [
          {
            eventType: 'complete',
            firecrawlStatus: 'completed',
            completed: pages.length,
            total: pages.length,
            dataCount: pages.length,
            hasNext: false,
            decision: 'ingested',
            message: `${pages.length - 1} pagina's verwerkt, 1 niet gevonden.`,
            createdAt: crawledAt,
          },
        ],
      },
      pages,
    },
  ];
}

// ─── Eigen Q&A ───────────────────────────────────────────────────────────────

export const DEMO_QA_ITEMS: QAItem[] = [
  {
    id: 'vb-qa-1',
    question: 'Mag mijn hond mee?',
    answer:
      'Ja, honden en katten zijn welkom in de Duinlodge, het tiny house (één huisdier), 12 van de 24 strandhuisjes, De Hoeve (maximaal 2 honden) en op alle kampeerplaatsen (maximaal 2). In het Boshuis en de safaritent mogen geen huisdieren mee; erkende assistentiehonden zijn overal gratis welkom. Een huisdier kost 6,50 euro per nacht, op een kampeerplaats 4,50 euro.',
    category: 'Huisdieren',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-1',
  },
  {
    id: 'vb-qa-2',
    question: 'Hoe laat kan ik inchecken en moet ik weer weg?',
    answer:
      'Je accommodatie is klaar vanaf 15:00 uur en je vertrekt voor 10:00 uur. Op een kampeerplaats ben je welkom vanaf 13:00 uur en vertrek je voor 12:00 uur.',
    category: 'Aankomst en vertrek',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-2',
  },
  {
    id: 'vb-qa-3',
    question: 'Ik kom pas na 22:00 uur aan. Kan dat?',
    answer:
      'Ja. Na 22:00 uur haal je je sleutelpas uit de sleutelkluis naast de receptie, met een code die we je vooraf sturen. Dat kost 15 euro. Laat het ons voor 16:00 uur op de aankomstdag weten.',
    category: 'Aankomst en vertrek',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-3',
  },
  {
    id: 'vb-qa-4',
    question: 'Mag ik een vuurkorf meenemen?',
    answer:
      'Nee, open vuur, vuurkorven en vuurschalen zijn niet toegestaan. Barbecueën mag wel, met gas, elektrisch of een houtskoolbarbecue op poten. Op dinsdag en vrijdag om 20:00 uur is er een gezamenlijk kampvuur op De Vlinderweide.',
    category: 'Huisregels',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-4',
  },
  {
    id: 'vb-qa-5',
    question: 'Verkopen jullie cadeaubonnen?',
    answer:
      'Ja, een Duinhoeve-cadeaubon is er vanaf 25 euro en is 2 jaar geldig. Je kunt hem gebruiken voor een verblijf, in het restaurant, het strandpaviljoen of bij de wellness. Bestellen gaat via de receptie of per e-mail.',
    category: 'Boeken en betalen',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-5',
  },
  {
    id: 'vb-qa-6',
    question: 'Kan ik op het park mijn elektrische auto opladen?',
    answer:
      'Ja, op parkeerplaats P1 staan 12 laadpunten van 22 kW. Laden kost 0,49 euro per kWh. Bij je accommodatie of kampeerplaats opladen mag niet, ook niet met een verlengsnoer.',
    category: 'Faciliteiten',
    active: true,
    ingestedDocumentId: 'vb-doc-qa-6',
  },
  {
    id: 'vb-qa-7',
    question: 'Wanneer is het zwembad dicht voor onderhoud?',
    answer:
      'Het zwembad is van 29 november tot en met 10 december 2026 dicht voor groot onderhoud. Daarna is het weer gewoon open.',
    category: 'Zwembad',
    active: false,
    ingestedDocumentId: null,
  },
];
