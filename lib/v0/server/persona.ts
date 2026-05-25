// V0 persona-laag — vertaalt KNOWN_ORGS naar de strings die in bot-prompts,
// general-knowledge-prompt, en off-topic refusals worden geïnjecteerd.
//
// Achtergrond: alle bot-prompts (bots.ts) en zero-hit fallback-paden in
// rag.ts hadden DEV_ORG-identiteit hard-coded ("klantcontact-medewerker van
// ChatManta — een product van Jorion Solutions"). Wanneer een gebruiker via
// de v0_active_org cookie naar een andere sandbox-org schakelde, kwamen de
// chunks netjes uit die org maar bleef de persona ChatManta/Jorion — de bot
// stelt zich dus voor als "wij van ChatManta" terwijl hij accountancy-
// content uit Initech aan het samenvatten is.
//
// Deze file definieert per OrgSlug één OrgPersona, en biedt twee helpers:
//
//   renderPersonaTemplate(template, persona)
//     Vervangt {{TOKENS}} in `template` door persona-velden. Idempotent —
//     templates zonder placeholders renderen ongewijzigd.
//
//   composeBotPrompts(bot, persona)
//     Convenience: rendert systemPrompt + preProcessSystem + preProcessMultiTurnAddon
//     van een BotConfig in één call.
//
// Belangrijke invariant: de DEV_ORG persona-velden zijn zo gekozen dat de
// gerenderde prompts EXACT gelijk zijn aan de oude hard-coded strings.
// Eval-vergelijkingen tegen DEV_ORG blijven daarmee reproduceerbaar.

import 'server-only';

import type { BotConfig } from './bots';
// Type-only import — voorkomt een module-eval cycle (rag.ts → persona.ts →
// active-org.ts → rag.ts) die anders een TDZ-ReferenceError op DEV_ORG_ID
// zou geven. De UUIDs hieronder zijn handgemapd uit `KNOWN_ORGS` in
// active-org.ts; checked-in als comment om drift zichtbaar te maken bij
// future-edits.
import type { OrgSlug } from './active-org';

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

export type OrgPersona = {
  /**
   * Naam zoals de bot zichzelf noemt. Wordt in {{COMPANY}} ingelezen.
   * DEV_ORG: "ChatManta". Anders: bedrijfsnaam ("Dakwerken De Boer").
   */
  company: string;

  /**
   * Optionele aanvulling op de bedrijfsnaam. Bij DEV_ORG: " — een product
   * van Jorion Solutions" (incl. leading punctuation). Bij anderen: "".
   * Wordt direct na {{COMPANY}} geplakt zodat één template beide vormen
   * (parent / standalone) dekt.
   */
  companySuffix: string;

  /**
   * Beschrijving van de typische gesprekspartner — staat na "Je
   * gesprekspartners zijn ". DEV_ORG: "meestal mensen die het project leren
   * kennen: vrienden van de founders, geïnteresseerden, en de founders
   * zelf". Anders org-specifiek.
   */
  audience: string;

  /**
   * Pedagogische voorbeelden in de inline-citaties-uitleg van V0.3+ system
   * prompts. Twee voorbeelden zodat we de "[1]" en "[2][3]"-patronen kunnen
   * blijven tonen. Org-specifiek, anders leest de LLM "ChatManta gebruikt
   * pgvector" terwijl hij accountancy-content moet citeren.
   */
  citationExample1: string;
  citationExample2: string;

  /**
   * Smalltalk-voorbeeld voor `"hey"` in de preProcessSystem. DEV_ORG:
   * "Hoi! Leuk dat je er bent. Wat wil je weten over ChatManta?". Anders
   * passend bij de org-naam.
   */
  smalltalkGreeting: string;

  /**
   * Smalltalk-voorbeeld voor `"wat kan je?"` in de preProcessSystem.
   * Beschrijft kort welke onderwerpen de bot kan toelichten.
   */
  smalltalkHelpScope: string;

  /**
   * Domein-keywords voor (a) de general-knowledge prompt ("vraag binnen ons
   * domein: ..."), (b) de DOMAIN_ALLOWLIST in reclassify-pure.ts, en (c)
   * de off-topic refusal-zin. DEV_ORG: ["MKB", "SaaS", "AI", "RAG",
   * "chatbots", "klantcontact", "ondernemerschap", "marketing"].
   */
  domainKeywords: string[];

  /**
   * Sluitzin van het general-knowledge antwoord (na GENERAL_OPENING + LLM-
   * core). DEV_ORG: " Wil je weten hoe ChatManta hier specifiek mee omgaat?
   * Vraag gerust." — wordt 1-op-1 achter de core geplakt.
   */
  generalKnowledgeClosing: string;

  /**
   * Korte beschrijving voor de off-topic refusal — staat na "Ik help met
   * vragen rondom ". DEV_ORG: "ChatManta en aanverwante onderwerpen — denk
   * aan MKB-tech, chatbots, klantcontact".
   */
  offTopicScope: string;
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

// ---------------------------------------------------------------------------
// Template-rendering
// ---------------------------------------------------------------------------

/**
 * Vervang {{TOKEN}} placeholders in een template door persona-waardes.
 * Templates die geen placeholders bevatten worden ongewijzigd geretourneerd
 * (idempotent — handig voor prompts die niets persona-specifieks bevatten).
 *
 * Ondersteunde tokens:
 *   {{COMPANY}}                — persona.company
 *   {{COMPANY_SUFFIX}}         — persona.companySuffix
 *   {{AUDIENCE}}               — persona.audience
 *   {{CITATION_EXAMPLE_1}}     — persona.citationExample1
 *   {{CITATION_EXAMPLE_2}}     — persona.citationExample2
 *   {{SMALLTALK_GREETING}}     — persona.smalltalkGreeting
 *   {{SMALLTALK_HELP_SCOPE}}   — persona.smalltalkHelpScope
 *   {{DOMAIN_KEYWORDS}}        — persona.domainKeywords.join(', ')
 *   {{GENERAL_CLOSING}}        — persona.generalKnowledgeClosing
 *   {{OFF_TOPIC_SCOPE}}        — persona.offTopicScope
 *
 * Onbekende {{...}} placeholders worden ongewijzigd gelaten. Dat is een
 * bewuste keuze: als iemand een nieuwe placeholder in een template zet maar
 * vergeet hem hier toe te voegen, valt dat in een dev-run op (de literal
 * "{{FOO}}" verschijnt in de chat), niet stilletjes als lege string.
 */
export function renderPersonaTemplate(
  template: string,
  persona: OrgPersona,
): string {
  return template
    .replace(/\{\{COMPANY\}\}/g, persona.company)
    .replace(/\{\{COMPANY_SUFFIX\}\}/g, persona.companySuffix)
    .replace(/\{\{AUDIENCE\}\}/g, persona.audience)
    .replace(/\{\{CITATION_EXAMPLE_1\}\}/g, persona.citationExample1)
    .replace(/\{\{CITATION_EXAMPLE_2\}\}/g, persona.citationExample2)
    .replace(/\{\{SMALLTALK_GREETING\}\}/g, persona.smalltalkGreeting)
    .replace(/\{\{SMALLTALK_HELP_SCOPE\}\}/g, persona.smalltalkHelpScope)
    .replace(/\{\{DOMAIN_KEYWORDS\}\}/g, persona.domainKeywords.join(', '))
    .replace(/\{\{GENERAL_CLOSING\}\}/g, persona.generalKnowledgeClosing)
    .replace(/\{\{OFF_TOPIC_SCOPE\}\}/g, persona.offTopicScope);
}

/**
 * Render alle prompt-strings van een BotConfig met een persona. Eén call
 * voor de drie strings die runRagQueryStreaming nodig heeft.
 */
export function composeBotPrompts(
  bot: BotConfig,
  persona: OrgPersona,
): {
  systemPrompt: string;
  preProcessSystem: string;
  preProcessMultiTurnAddon: string;
} {
  return {
    systemPrompt: renderPersonaTemplate(bot.systemPrompt, persona),
    preProcessSystem: renderPersonaTemplate(bot.preProcessSystem, persona),
    preProcessMultiTurnAddon: renderPersonaTemplate(
      bot.preProcessMultiTurnAddon,
      persona,
    ),
  };
}

/**
 * Bouw een persona-aware regex die de generated-by-LLM-varianten van de
 * GENERAL_CLOSING uit antwoord-tekst strippen. De LLM moet de closing NIET
 * zelf produceren (zie generalSystem template) maar varianten lekken in de
 * praktijk door en moeten post-hoc worden weggepoetst. Bij DEV_ORG matcht
 * deze regex precies dezelfde patronen als de hard-coded /Wil je\.\.\.
 * ChatManta\.\.\./ uit V0.5.
 */
export function buildGeneralClosingStripRegex(persona: OrgPersona): RegExp {
  const escapedCompany = persona.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\s*Wil je(?: meer)? weten\\s+hoe\\s+${escapedCompany}\\s+hier\\s+(?:specifiek\\s+)?mee\\s+omgaat\\??\\s*(?:Vraag gerust\\.?)?\\s*$`,
    'i',
  );
}
