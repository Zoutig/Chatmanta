// Installatiehulp voor de V1-widget: instructies per platform, de tekst voor
// "Stuur naar je webbouwer", de domein-aanvraag en de checklist bij "geen signaal".
// Pure data + tekstbouwers (geen React, geen server-code), gedeeld door het
// klantdashboard en de publieke demo-kopie. Unit-test: __tests__/install-guide.test.ts.
//
// Menunamen gecontroleerd op oktober 2026; CMS'en hernoemen soms menu's, dus
// we noemen waar nodig ook de oude naam.

export type InstallPlatform = {
  id: string;
  name: string;
  /** Platform-specifieke stappen. De cache- en teststap komen er altijd achter (FINISH_STEPS). */
  steps: string[];
  /** Korte waarschuwing (abonnement, valkuil). Optioneel. */
  note?: string;
};

export const INSTALL_PLATFORMS: InstallPlatform[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    steps: [
      'Installeer de gratis plugin WPCode via Plugins → Nieuwe plugin (heette eerder "Insert Headers and Footers").',
      'Ga naar Code Snippets → Header & Footer.',
      'Plak de code in het vak Footer en klik op Opslaan.',
    ],
    note: 'Plak de code niet via de thema-editor: bij een thema-update verdwijnt hij. Op WordPress.com kan dit alleen met een abonnement dat plugins toestaat.',
  },
  {
    id: 'drupal',
    name: 'Drupal',
    steps: [
      'Zet de code in de template html.html.twig van je actieve thema, vlak voor </body>. Of gebruik een module voor eigen code, zoals Asset Injector.',
      'Plak hem niet in een tekstblok of artikel: de editor haalt <script> meestal weg.',
      'Leeg de Drupal-cache: Configuratie → Ontwikkeling → Prestaties → Alle caches wissen (of drush cr).',
    ],
    note: 'Geen toegang tot de thema-bestanden? Stuur de tekst hieronder naar je webbouwer of hostingpartij.',
  },
  {
    id: 'wix',
    name: 'Wix',
    steps: [
      'Ga in je Wix-dashboard naar Instellingen → Aangepaste code (onder Geavanceerd).',
      'Klik op Aangepaste code toevoegen en plak de code.',
      'Kies Alle pagina\'s, laat de code één keer laden (Load code once) en plaats hem in Body - einde. Klik op Toepassen.',
    ],
    note: 'Aangepaste code werkt bij Wix alleen met een premium-abonnement en een gekoppeld eigen domein.',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    steps: [
      'Open Code-injectie: Instellingen → Geavanceerd → Code-injectie (in nieuwere versies: Website → Pages → Custom code → Code Injection).',
      'Plak de code in het veld Footer.',
      'Klik op Opslaan.',
    ],
    note: 'Code-injectie zit alleen in de betaalde abonnementen die eigen code toestaan.',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    steps: [
      'Ga naar Online Store → Themes, klik bij je actieve thema op ⋯ → Edit code.',
      'Open layout/theme.liquid en plak de code vlak voor </body>.',
      'Klik op Save. Wissel je later van thema, zet de code dan ook in het nieuwe thema.',
    ],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    steps: [
      'Open Site settings (vroeger Project settings) → Custom code.',
      'Plak de code in het veld Footer code en klik op Save.',
      'Publiceer je site opnieuw: zonder publiceren staat de code er nog niet op.',
    ],
    note: 'Eigen code werkt bij Webflow alleen met een betaald site-abonnement.',
  },
  {
    id: 'joomla',
    name: 'Joomla',
    steps: [
      'Ga naar Systeem → Site-templates en open de bestanden van je actieve template.',
      'Open index.php en plak de code vlak voor </body>. Sla op.',
      'Leeg de Joomla-cache via Systeem → Cache wissen.',
    ],
    note: 'Plak de code niet in een artikel of module: de editor haalt <script> weg.',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    steps: [
      'Ga naar Tags → Nieuw en kies als tagtype Aangepaste HTML (Custom HTML). Plak de code.',
      'Kies als trigger DOM gereed (DOM Ready) of Venster geladen (Window Loaded) op alle pagina\'s, niet de standaardtrigger All Pages (Page View).',
      'Sla op en klik op Verzenden → Publiceren. Zonder publiceren is de tag niet actief.',
    ],
  },
  {
    id: 'other',
    name: 'Eigen code / anders',
    steps: [
      'Plak de code op elke pagina vlak voor </body>. Het handigst is je gedeelde footer of layout-template.',
      'Gebruik je een ander systeem (bijv. Jimdo of Lightspeed)? Zoek naar een veld voor "eigen code", "footer-code" of "tracking-code".',
      'Zet de aangepaste pagina\'s online.',
    ],
  },
];

/** Komt achter elk platform: cache legen en testen. */
export const FINISH_STEPS: string[] = [
  'Leeg de cache: van je caching-plugin (zoals WP Rocket, LiteSpeed Cache of W3 Total Cache), van je hosting en van een eventueel CDN (zoals Cloudflare).',
  'Test: open je website in een privévenster. De chatknop staat rechts- of linksonder. Kijk daarna hieronder bij Status of je site gezien is.',
];

/** Checklist als er (nog) geen signaal van de website is. */
export const NO_SIGNAL_CHECKLIST: string[] = [
  'Staat de code op elke pagina, vlak voor </body>, en is de wijziging gepubliceerd?',
  'Is de code letterlijk overgenomen, met de juiste data-org?',
  'Is de cache geleegd (plugin, hosting, CDN)? Bekijk je site daarna in een privévenster.',
  'Staat het domein van je website bij Toegestane domeinen (ook www, subdomeinen en testomgevingen)?',
  'Blokkeert een optimizer (scripts samenvoegen of uitstellen) of een cookiebanner externe scripts? Zet dan een uitzondering voor de ChatManta-code.',
];

/** De embed-regel, precies zoals het dashboard hem toont. */
export function buildEmbedCode(origin: string, slug: string): string {
  return `<script src="${origin}/widget-v1.js" data-org="${slug}" defer></script>`;
}

/** Kant-en-klare tekst voor een webbouwer (kopiëren of via mailto). */
export function buildWebbouwerMessage(opts: { code: string; origin: string; allowedDomains: string[] }): string {
  const domains = opts.allowedDomains.filter(Boolean);
  const lines = [
    'Hoi,',
    '',
    'Wil je de chatbot van ChatManta op onze website zetten? Het gaat om één regel code:',
    '',
    opts.code,
    '',
    'Waar: op elke pagina, vlak voor de sluitende </body>-tag (bijvoorbeeld in de gedeelde footer of layout-template). Laat defer staan.',
  ];
  if (domains.length > 0) {
    lines.push('', `De chatbot werkt op: ${domains.join(', ')}. Voor een ander domein of een testomgeving moet ChatManta dat eerst toestaan.`);
  }
  lines.push(
    '',
    'Aandachtspunten:',
    '- Leeg daarna de cache (caching-plugin, hosting, CDN).',
    `- Gebruikt de site een Content-Security-Policy? Sta dan ${opts.origin} toe in script-src en frame-src.`,
    '- Een cookiebanner of optimizer die externe scripts blokkeert of samenvoegt: zet een uitzondering voor deze regel. De chatbot plaatst geen cookies.',
    '- Testen: open de site in een privévenster. Rechts- of linksonder verschijnt de chatknop.',
    '',
    'Bedankt!',
  );
  return lines.join('\n');
}

/** mailto-link die de mailclient van de klant opent (wij versturen niets). */
export function buildMailto(opts: { to?: string; subject: string; body: string }): string {
  return `mailto:${opts.to ?? ''}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
}

/** mailto naar ChatManta om een extra domein of testomgeving aan te vragen. */
export function buildDomainRequestMailto(opts: { supportEmail: string; slug: string; allowedDomains: string[] }): string {
  const current = opts.allowedDomains.filter(Boolean);
  const body = [
    'Hoi ChatManta,',
    '',
    'Wil je dit domein toevoegen aan de toegestane domeinen van onze chatbot?',
    '',
    'Domein: ',
    '',
    `Organisatie: ${opts.slug}`,
    `Nu toegestaan: ${current.length > 0 ? current.join(', ') : '(nog niets ingesteld)'}`,
  ].join('\n');
  return buildMailto({ to: opts.supportEmail, subject: 'Ander domein voor de chatbot', body });
}
