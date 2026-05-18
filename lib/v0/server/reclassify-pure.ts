// Pure parser + constants for reclassify logic.
// No 'server-only' import — safe to test with tsx.

/**
 * DEV_ORG default domain — gebruikt door de standalone smoke-tests en als
 * fallback in `buildReclassifySystem` wanneer er geen persona is meegegeven.
 * Productie-pad (runRagQueryStreaming) levert ALTIJD een persona.domainKeywords
 * mee, dus deze waarde is dan irrelevant.
 */
export const DOMAIN_ALLOWLIST = [
  'MKB',
  'SaaS',
  'AI',
  'RAG',
  'chatbots',
  'klantcontact',
  'ondernemerschap',
  'marketing',
  'web-tech',
];

/**
 * Bouw de RECLASSIFY-system-prompt met de actieve persona-domein-keywords.
 * Vroeger was DOMAIN_ALLOWLIST hard-coded met ChatManta/Jorion + MKB/SaaS/AI
 * — dat classificeerde voor Initech (accountancy) een vraag als "wat is
 * btw?" als OFF_TOPIC ipv GENERAL. Per-org keywords vermijdt die misclass.
 *
 * @param domainKeywords  persona.domainKeywords (bv. ["accountancy", "btw",
 *                        "jaarrekening"] voor Initech). Geen entry: DEV_ORG
 *                        default.
 * @param companyExample  Bedrijfsnaam voor het FALLBACK-voorbeeld ("Hoeveel
 *                        kost X per maand?"). DEV_ORG: "ChatManta".
 */
export function buildReclassifySystem(
  domainKeywords: string[] = DOMAIN_ALLOWLIST,
  companyExample = 'ChatManta',
): string {
  return `Je classificeert een gebruikersvraag in EXACT één van drie categorieën:

A) GENERAL — algemene kennis BINNEN het domein van dit bedrijf.
   Het domein omvat: ${domainKeywords.join(', ')}.
   Voorbeelden: korte definitie-vragen over begrippen die in dit domein
   vallen (bv. "Wat is RAG?", "Wat zijn MKB-bedrijven?", "Wat is een
   vector database?").

B) OFF_TOPIC — buiten het domein. Voorbeelden: "Wat is de hoofdstad van
   Frankrijk?", "Schrijf een gedicht over zalmen", "Hoeveel is 743 × 28?",
   "Wat is mijn sterrenbeeld?", "Geef me een recept voor pasta carbonara".

C) FALLBACK — onduidelijk, of een vraag die in de docs HAD moeten staan
   maar niet gevonden is (specifiek bedrijfs-detail dat we eerlijk niet
   weten). Voorbeeld: "Hoeveel kost ${companyExample} per maand?" (specifiek
   detail, geen algemene kennis).

Antwoord ALLEEN met één woord in hoofdletters: GENERAL, OFF_TOPIC, of FALLBACK.
Geen uitleg, geen aanhalingstekens, geen punt.`;
}

/**
 * Backwards-compat export: de DEV_ORG-versie van het systeem-prompt. Wordt
 * gebruikt door de tsx smoke-test in `reclassify.ts` (__test.RECLASSIFY_SYSTEM).
 * Productie-pad gebruikt buildReclassifySystem() met persona-keywords.
 */
export const RECLASSIFY_SYSTEM = buildReclassifySystem();

export type ReclassifyResult = 'general' | 'off_topic' | 'fallback';

export function parseReclassifyOutput(raw: string): ReclassifyResult | null {
  const t = raw.trim().toUpperCase();
  const first = t.split(/\s+/)[0]?.replace(/[.,!?:;]+$/, '');
  if (first === 'GENERAL') return 'general';
  if (first === 'OFF_TOPIC' || first === 'OFFTOPIC' || first === 'OFF-TOPIC')
    return 'off_topic';
  if (first === 'FALLBACK') return 'fallback';
  return null;
}
