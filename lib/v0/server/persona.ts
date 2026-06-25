// V0 persona-registry — vertaalt KNOWN_ORGS naar de RagPersona-velden die in
// bot-prompts, general-knowledge-prompt, en off-topic refusals worden
// geïnjecteerd.
//
// De PURE rendering-helpers (renderPersonaTemplate, composeBotPrompts,
// buildGeneralClosingStripRegex) en het RagPersona-type wonen sinds de
// kernel-graduatie in @/lib/rag/persona resp. @/lib/rag/types. Dit bestand
// houdt alleen de V0-org-DATA (PERSONAS) + de lookups (getPersonaById /
// getPersonaBySlug) en re-exporteert de renderers + OrgPersona-alias voor
// back-compat met bestaande importers van dit pad.
//
// Achtergrond: alle bot-prompts (bots.ts) en zero-hit fallback-paden in
// rag.ts hadden DEV_ORG-identiteit hard-coded ("klantcontact-medewerker van
// ChatManta — een product van Jorion Solutions"). Wanneer een gebruiker via
// de v0_active_org cookie naar een andere sandbox-org schakelde, kwamen de
// chunks netjes uit die org maar bleef de persona ChatManta/Jorion — de bot
// stelt zich dus voor als "wij van ChatManta" terwijl hij accountancy-
// content uit Initech aan het samenvatten is.
//
// Belangrijke invariant: de DEV_ORG persona-velden zijn zo gekozen dat de
// gerenderde prompts EXACT gelijk zijn aan de oude hard-coded strings.
// Eval-vergelijkingen tegen DEV_ORG blijven daarmee reproduceerbaar.

import 'server-only';

// Type-only import — voorkomt een module-eval cycle (rag.ts → persona.ts →
// active-org.ts → rag.ts) die anders een TDZ-ReferenceError op DEV_ORG_ID
// zou geven. De UUIDs hieronder zijn handgemapd uit `KNOWN_ORGS` in
// active-org.ts; checked-in als comment om drift zichtbaar te maken bij
// future-edits.
import type { OrgSlug } from './active-org';
import type { RagPersona } from '@/lib/rag/types';

// Back-compat alias — RagPersona is the canonical type home in lib/rag/types.ts.
export type OrgPersona = RagPersona;

// Back-compat re-export — de pure rendering-helpers wonen nu in @/lib/rag/persona.
// Bestaande importers van @/lib/v0/server/persona (rag.ts, app/admintool) blijven
// werken.
export {
  renderPersonaTemplate,
  composeBotPrompts,
  buildGeneralClosingStripRegex,
} from '@/lib/rag/persona';

// Slug → UUID mapping; spiegelt KNOWN_ORGS uit active-org.ts. Houden we
// hier los zodat persona.ts geen runtime-import van active-org.ts nodig
// heeft (zie comment hierboven over module-eval cycle). Bij een wijziging
// in active-org.ts MOET dit hier ook bijgewerkt worden — een eval-test in
// scripts/v0-test-org-isolation.ts kan eventueel een drift-assert
// toevoegen.
const ORG_SLUG_TO_ID: Record<OrgSlug, string> = {
  'dev-org': '00000000-0000-0000-0000-0000000000d0',
  'acme-corp': '00000000-0000-0000-0000-0000000000a1',
  'globex-inc': '00000000-0000-0000-0000-0000000000a2',
  initech: '00000000-0000-0000-0000-0000000000a3',
  'demo-nieuw': '00000000-0000-0000-0000-0000000000a4',
};

// ---------------------------------------------------------------------------
// Personas — één per OrgSlug.
// ---------------------------------------------------------------------------
//
// DEV_ORG velden zijn zo gekozen dat alle 6 bot-prompts (V0_1 t/m V0_6) na
// rendering byte-identiek zijn aan hun hard-coded voorgangers. Eval-runs op
// DEV_ORG zijn daarmee reproduceerbaar. Voor de andere orgs zijn de waarden
// afgeleid uit hun fixture-content (zie scripts/fixtures/sandbox-orgs/).

const PERSONAS: Record<OrgSlug, OrgPersona> = {
  'dev-org': {
    company: 'ChatManta',
    companySuffix: ' — een product van Jorion Solutions',
    audience:
      'meestal mensen die het project leren kennen: vrienden van de founders, geïnteresseerden, en de founders zelf',
    citationExample1: 'ChatManta gebruikt pgvector voor semantische zoek',
    citationExample2: 'We bouwen voor MKB-bedrijven',
    smalltalkGreeting: 'Hoi! Leuk dat je er bent. Wat wil je weten over ChatManta?',
    smalltalkHelpScope:
      'alles rond ChatManta — wat het is, wat het doet, voor wie het gebouwd wordt, en hoe het technisch werkt',
    domainKeywords: [
      'MKB',
      'SaaS',
      'AI',
      'RAG',
      'chatbots',
      'klantcontact',
      'ondernemerschap',
      'marketing',
    ],
    generalKnowledgeClosing:
      ' Wil je weten hoe ChatManta hier specifiek mee omgaat? Vraag gerust.',
    offTopicScope:
      'ChatManta en aanverwante onderwerpen — denk aan MKB-tech, chatbots, klantcontact',
  },

  'acme-corp': {
    company: 'Dakwerken De Boer',
    companySuffix: '',
    audience:
      'meestal klanten en geïnteresseerden die meer willen weten over onze dakwerken-diensten',
    citationExample1: 'Onze werkgarantie geldt 10 jaar op nieuw dakwerk',
    citationExample2: 'We werken in heel Noord-Holland',
    smalltalkGreeting:
      'Hoi! Leuk dat je er bent. Waar kan ik je mee helpen op het gebied van dakwerk?',
    smalltalkHelpScope:
      'al onze diensten — dakvernieuwing, isolatie, reparaties bij lekkages, zonnepanelen, en onderhoudscontracten',
    domainKeywords: [
      'dakwerken',
      'daken',
      'isolatie',
      'lekkages',
      'pannendaken',
      'EPDM',
      'bitumen',
      'zonnepanelen',
      'garanties',
    ],
    generalKnowledgeClosing:
      ' Wil je weten hoe Dakwerken De Boer hier specifiek mee omgaat? Vraag gerust.',
    offTopicScope:
      'dakwerken en aanverwante onderwerpen — denk aan onderhoud, isolatie, lekkages, garanties',
  },

  'globex-inc': {
    company: 'FysioPlus Utrecht',
    companySuffix: '',
    audience:
      'meestal cliënten en geïnteresseerden die meer willen weten over onze behandelingen',
    citationExample1: 'FysioPlus Utrecht behandelt nek- en rugklachten',
    citationExample2: 'We werken samen met de meeste zorgverzekeraars',
    smalltalkGreeting:
      'Hoi! Leuk dat je er bent. Waar kan ik je mee helpen op het gebied van fysiotherapie?',
    smalltalkHelpScope:
      'al onze behandelingen — wat we doen, vergoedingen, afspraak maken, en welke klachten we behandelen',
    domainKeywords: [
      'fysiotherapie',
      'behandelingen',
      'klachten',
      'rugklachten',
      'nekklachten',
      'sportblessures',
      'manuele therapie',
      'vergoedingen',
      'verwijzingen',
    ],
    generalKnowledgeClosing:
      ' Wil je weten hoe FysioPlus Utrecht hier specifiek mee omgaat? Vraag gerust.',
    offTopicScope:
      'fysiotherapie en aanverwante onderwerpen — denk aan behandelingen, klachten, vergoedingen',
  },

  initech: {
    company: 'Bakker & Vermeer Accountants',
    companySuffix: '',
    audience:
      'meestal MKB-ondernemers, zzp\'ers en DGA\'s die meer willen weten over onze dienstverlening',
    citationExample1:
      'Bakker & Vermeer Accountants verzorgt de jaarrekening voor MKB-klanten',
    citationExample2: 'We adviseren over de juiste rechtsvorm voor jouw situatie',
    smalltalkGreeting:
      'Hoi! Leuk dat je er bent. Waar kan ik je mee helpen op fiscaal of administratief gebied?',
    smalltalkHelpScope:
      'al onze diensten — administratie, jaarrekeningen, fiscaal advies, btw-aangiften, en loonadministratie',
    domainKeywords: [
      'accountancy',
      'belasting',
      'jaarrekening',
      'btw',
      'MKB-administratie',
      'zzp',
      'bv',
      'fiscaal advies',
      'loonadministratie',
    ],
    generalKnowledgeClosing:
      ' Wil je weten hoe Bakker & Vermeer hier specifiek mee omgaat? Vraag gerust.',
    offTopicScope:
      'accountancy en aanverwante onderwerpen — denk aan administratie, belastingen, jaarrekeningen',
  },

  // Lege demo-org — neutrale persona. Heeft geen RAG-content, dus deze velden
  // worden in de praktijk nauwelijks gebruikt; ze houden de demo wél generiek
  // en voorkomen dat de DEV_ORG/ChatManta-persona doorlekt.
  'demo-nieuw': {
    company: 'Demo Nieuw',
    companySuffix: '',
    audience:
      'meestal klanten en geïnteresseerden die meer willen weten over onze producten en diensten',
    citationExample1: 'Onze openingstijden staan op de contactpagina',
    citationExample2: 'We zijn telefonisch en per e-mail bereikbaar',
    smalltalkGreeting: 'Hoi! Leuk dat je er bent. Waar kan ik je mee helpen?',
    smalltalkHelpScope:
      'onze producten, diensten, tarieven en contactmogelijkheden',
    domainKeywords: ['producten', 'diensten', 'tarieven', 'contact', 'openingstijden'],
    generalKnowledgeClosing: ' Wil je weten hoe wij hier specifiek mee omgaan? Vraag gerust.',
    offTopicScope: 'onze producten en diensten — denk aan aanbod, tarieven, contact',
  },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Resolve persona via OrgSlug. Onbekende slug → DEV_ORG persona als fallback
 * (consistent met getActiveOrgFromCookies safety-net).
 */
export function getPersonaBySlug(slug: string): OrgPersona {
  return (
    (PERSONAS as Record<string, OrgPersona | undefined>)[slug] ??
    PERSONAS['dev-org']
  );
}

/**
 * Resolve persona via organization UUID. Loopt de lokale slug→id map door
 * om de juiste persona te vinden. Onbekende ID → DEV_ORG persona.
 */
export function getPersonaById(orgId: string): OrgPersona {
  for (const slug of Object.keys(ORG_SLUG_TO_ID) as OrgSlug[]) {
    if (ORG_SLUG_TO_ID[slug] === orgId) return PERSONAS[slug];
  }
  return PERSONAS['dev-org'];
}
