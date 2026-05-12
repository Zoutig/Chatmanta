// Pure parser + constants for reclassify logic.
// No 'server-only' import — safe to test with tsx.

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
  'ChatManta',
  'Jorion Solutions',
];

export const RECLASSIFY_SYSTEM = `Je classificeert een gebruikersvraag in EXACT één van drie categorieën:

A) GENERAL — algemene kennis BINNEN het domein van een MKB-chatbot-product.
   Het domein omvat: ${DOMAIN_ALLOWLIST.join(', ')}.
   Voorbeelden: "Wat is RAG?", "Wat zijn MKB-bedrijven?", "Wat doet een
   klantcontact-medewerker?", "Wat is een vector database?", "Wat is SaaS?".

B) OFF_TOPIC — buiten het domein. Voorbeelden: "Wat is de hoofdstad van
   Frankrijk?", "Schrijf een gedicht over zalmen", "Hoeveel is 743 × 28?",
   "Wat is mijn sterrenbeeld?", "Geef me een recept voor pasta carbonara".

C) FALLBACK — onduidelijk, of een vraag die in de docs HAD moeten staan
   maar niet gevonden is (specifiek bedrijfs-detail dat we eerlijk niet
   weten). Voorbeeld: "Hoeveel kost ChatManta per maand?" (specifiek detail,
   geen algemene kennis).

Antwoord ALLEEN met één woord in hoofdletters: GENERAL, OFF_TOPIC, of FALLBACK.
Geen uitleg, geen aanhalingstekens, geen punt.`;

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
