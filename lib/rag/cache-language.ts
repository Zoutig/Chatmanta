// Taalcheck op een answer-cache-hit (2026-10-14). De cache matcht op betekenis
// (embedding ≥ 0.93), niet op taal: "Where is the FRENIC Mega manual?" en
// "Waar is de handleiding van de FRENIC Mega?" kunnen elkaars antwoord raken.
// Bij taalspiegeling (autoDetectLanguage) zou de bezoeker dan een antwoord in de
// verkeerde taal krijgen. Regel: alleen als BEIDE talen met zekerheid nl/en zijn
// én verschillen, telt de hit als miss. Onzeker (korte vraag, 'mixed', 'unknown')
// → de hit blijft geldig; liever een snelle hit dan een onnodige LLM-call.

import { detectLanguage } from '@/lib/rag/hard-eval-checks';

export function cachedAnswerLanguageMismatch(question: string, cachedAnswer: string): boolean {
  const q = detectLanguage(question);
  if (q !== 'nl' && q !== 'en') return false;
  const a = detectLanguage(cachedAnswer);
  if (a !== 'nl' && a !== 'en') return false;
  return q !== a;
}
