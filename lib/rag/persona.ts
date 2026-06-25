// Neutrale persona-rendering — pure helpers die {{TOKENS}} in bot-prompts
// vervangen door de velden van een RagPersona. Geen V0-org-registry hier
// (die woont in lib/v0/server/persona.ts als getPersonaById/PERSONAS); deze
// file is V0/V1-agnostisch en imports niets uit lib/v0.
//
// Achtergrond: alle bot-prompts en zero-hit fallback-paden in de RAG-engine
// hadden DEV_ORG-identiteit hard-coded ("klantcontact-medewerker van ChatManta
// — een product van Jorion Solutions"). Per-org persona-velden + token-
// rendering houden de prompt org-correct.
//
// Belangrijke invariant: de DEV_ORG persona-velden (in de V0-registry) zijn zo
// gekozen dat de gerenderde prompts EXACT gelijk zijn aan de oude hard-coded
// strings. Eval-vergelijkingen tegen DEV_ORG blijven daarmee reproduceerbaar.

import type { RagConfig, RagPersona } from '@/lib/rag/types';

// Back-compat alias — RagPersona is the canonical type home in lib/rag/types.ts.
export type OrgPersona = RagPersona;

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
 * Render alle prompt-strings van een RagConfig met een persona. Eén call
 * voor de drie strings die de RAG-engine nodig heeft.
 */
export function composeBotPrompts(
  bot: RagConfig,
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
