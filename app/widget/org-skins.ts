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
  /** Hero-content (groot blok bovenaan). */
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
  };
  /** 3-4 feature-cards in de "wat we doen"-sectie. */
  features: Array<{ title: string; body: string }>;
  /** 2-3 pricing/service-tiers. */
  pricing: Array<{ name: string; price: string; perks: string[] }>;
  /** Korte over-ons / contact-tekst onderaan. */
  about: { title: string; body: string };
  /** Quick-reply chips die de widget toont bij eerste opening. */
  suggestedQuestions: string[];
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
  hero: {
    eyebrow: 'CHATMANTA · DEMO',
    title: 'De vragen van je klanten, 24/7 beantwoord.',
    subtitle:
      'Een AI-chatbot die jouw website en documenten kent als zijn broekzak. Klanten krijgen direct antwoord — jij houdt tijd over voor het werk dat ertoe doet.',
    primaryCta: 'Vraag een demo aan',
    secondaryCta: 'Lees meer',
  },
  features: [
    {
      title: 'Leest jouw website',
      body: 'We crawlen je site, bouwen een kennisbasis en houden die automatisch up-to-date.',
    },
    {
      title: 'Geen hallucinaties',
      body: 'Antwoorden komen uit jouw content. Geen verzonnen feiten, geen losse gokjes.',
    },
    {
      title: 'In jouw stijl',
      body: 'Toon, kleur en woordkeuze passen we aan op jouw merk — niet op een generieke AI-stem.',
    },
    {
      title: 'Snel te installeren',
      body: 'Eén script-tag op je site en je bent live. Wij doen de zware techniek.',
    },
  ],
  pricing: [
    {
      name: 'Starter',
      price: '€49 / mnd',
      perks: ['1 website', 'tot 500 chats / maand', 'e-mail support'],
    },
    {
      name: 'Groei',
      price: '€129 / mnd',
      perks: ['3 websites', 'tot 2000 chats / maand', 'priority support'],
    },
    {
      name: 'Schaal',
      price: 'Op maat',
      perks: ['onbeperkte websites', 'custom branding', 'eigen account-manager'],
    },
  ],
  about: {
    title: 'Over ChatManta',
    body: 'ChatManta is een product van Jorion Solutions. We helpen MKB-bedrijven om hun klantcontact te automatiseren zonder de menselijke toon te verliezen.',
  },
  suggestedQuestions: [
    'Wat doet ChatManta precies?',
    'Wat kost het per maand?',
    'Voor wie is dit bedoeld?',
    'Hoe lang duurt installeren?',
  ],
  primaryColor: '#00CC9B',
  bgColor: '#0a1118',
  textColor: '#eaf6fb',
  cardColor: 'rgba(255,255,255,0.04)',
};

const ACME_CORP: OrgSkin = {
  slug: 'acme-corp',
  companyName: 'Dakwerken De Boer',
  tagline: 'Vakwerk op uw dak — al sinds 1987',
  hero: {
    eyebrow: 'DAKWERKEN DE BOER',
    title: 'Een dak waar u jaren op kunt rekenen.',
    subtitle:
      'Hellende daken, platte daken, dakgoten en zinkwerk — wij zijn de vakman die het werk eerlijk doet. Vraag vrijblijvend een inspectie aan.',
    primaryCta: 'Inspectie aanvragen',
    secondaryCta: 'Bel direct',
  },
  features: [
    {
      title: 'Hellende daken',
      body: 'Pannendaken, leien, dakkapellen en isolatie. Wij vervangen en herstellen vakkundig.',
    },
    {
      title: 'Platte daken',
      body: 'EPDM, bitumen en PVC dakbedekking. Onderhoud, vernieuwing en lekkage-reparatie.',
    },
    {
      title: 'Dakgoten & zink',
      body: 'Nieuwe goten, reparatie en zinkwerk rondom schoorstenen en dakkapellen.',
    },
    {
      title: 'Spoedreparatie',
      body: 'Bij lekkage staan we binnen 24 uur op uw dak — ook in het weekend.',
    },
  ],
  pricing: [
    {
      name: 'Inspectie',
      price: '€95 incl. btw',
      perks: ['volledige dakcheck', 'foto-rapportage', 'kostenraming'],
    },
    {
      name: 'Onderhoud',
      price: '€250 / jaar',
      perks: ['jaarlijkse inspectie', 'kleine reparaties', 'voorrang bij spoed'],
    },
    {
      name: 'Renovatie',
      price: 'Op maat',
      perks: ['volledige offerte', 'eigen materialen of merk', '10 jaar garantie'],
    },
  ],
  about: {
    title: 'Over Dakwerken De Boer',
    body: 'Drie generaties dakdekkers in de regio. We werken alleen met materialen die we zelf zouden gebruiken en geven 10 jaar garantie op nieuw werk.',
  },
  suggestedQuestions: [
    'Komen jullie ook bij mij in de buurt?',
    'Wat kost een dakinspectie?',
    'Doen jullie ook spoedreparaties?',
    'Hoe lang duurt een nieuw dak?',
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
  hero: {
    eyebrow: 'FYSIOPLUS UTRECHT',
    title: 'Weer fit, zonder gedoe.',
    subtitle:
      'Algemene fysiotherapie, manuele therapie en sportblessures. Korte wachttijden, persoonlijke aanpak en behandelingen die werken.',
    primaryCta: 'Afspraak inplannen',
    secondaryCta: 'Vergoeding checken',
  },
  features: [
    {
      title: 'Algemene fysio',
      body: 'Rugklachten, nek, schouder, knie — we beoordelen, behandelen en geven oefeningen mee.',
    },
    {
      title: 'Manuele therapie',
      body: 'Gespecialiseerde behandeling voor gewrichtsklachten. Onze therapeuten zijn extra geschoold.',
    },
    {
      title: 'Sportfysio',
      body: 'Snel terug naar je sport — van hardloopblessure tot tenniselleboog.',
    },
    {
      title: 'Hands-on revalidatie',
      body: 'Na een operatie of langdurig probleem: een traject op maat, met de fysio als coach.',
    },
  ],
  pricing: [
    {
      name: 'Eerste consult',
      price: '€48',
      perks: ['intake + onderzoek', 'eerste behandeling', 'oefenschema'],
    },
    {
      name: 'Vervolgbehandeling',
      price: '€37',
      perks: ['25–30 minuten', 'manuele technieken', 'voortgangsverslag'],
    },
    {
      name: 'Sportscreening',
      price: '€75',
      perks: ['blessurepreventie', 'beweegtest', 'persoonlijk advies'],
    },
  ],
  about: {
    title: 'Over FysioPlus Utrecht',
    body: 'Twee praktijken in het centrum van Utrecht. Wij geloven dat fysiotherapie efficiënt en menselijk hoort te zijn — geen lange wachtkamers, wel echte aandacht.',
  },
  suggestedQuestions: [
    'Heb ik een verwijzing van de huisarts nodig?',
    'Wordt fysio vergoed door mijn verzekering?',
    'Doen jullie aan manuele therapie?',
    'Hoe lang duurt een behandeling?',
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
  hero: {
    eyebrow: 'BAKKER & VERMEER',
    title: 'Uw boekhouding zonder zorgen.',
    subtitle:
      'Boekhouding, belastingaangiften en zakelijk advies voor ZZP, MKB en familiebedrijven. Een vast aanspreekpunt — geen wisselende gezichten.',
    primaryCta: 'Vrijblijvend kennismaken',
    secondaryCta: 'Tarieven bekijken',
  },
  features: [
    {
      title: 'Boekhouding',
      body: 'Maandelijkse verwerking, btw-aangiften en jaarrekening. Wij regelen het — u ondertekent.',
    },
    {
      title: 'Belastingaangifte',
      body: 'IB, VPB en btw. We rekenen door wat fiscaal het beste uitkomt, en leggen het ook uit.',
    },
    {
      title: 'Zakelijk advies',
      body: 'Van startersbegeleiding tot bedrijfsoverdracht — strategisch sparren met iemand die de cijfers kent.',
    },
    {
      title: 'Online dossier',
      body: 'Uw stukken in één veilige omgeving. Bonnetjes upload je via de app.',
    },
  ],
  pricing: [
    {
      name: 'ZZP',
      price: 'vanaf €65 / mnd',
      perks: ['boekhouding + btw', 'IB-aangifte inclusief', 'online dossier'],
    },
    {
      name: 'MKB',
      price: 'vanaf €175 / mnd',
      perks: ['boekhouding + jaarrekening', 'VPB + IB', 'kwartaalbespreking'],
    },
    {
      name: 'Advies',
      price: '€135 / uur',
      perks: ['strategisch sparren', 'fiscaal advies', 'overname-begeleiding'],
    },
  ],
  about: {
    title: 'Over Bakker & Vermeer',
    body: 'Sinds 2009 een vast adres voor ondernemers die hun cijfers wél belangrijk vinden, maar er liever niet zelf mee bezig zijn. Klein team, vaste contactpersoon, geen verrassingen op de factuur.',
  },
  suggestedQuestions: [
    'Doen jullie ook ZZP-aangiften?',
    'Wat kost de boekhouding per maand?',
    'Hoe werkt het online dossier?',
    'Helpen jullie ook bij een bedrijfsovername?',
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

export function getSkin(slug: string): OrgSkin {
  if (slug in ORG_SKINS) return ORG_SKINS[slug as OrgSlug];
  return DEV_ORG;
}
