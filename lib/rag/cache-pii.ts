// Answer-cache overslaan bij persoonlijke vragen (security-audit 2026-10, bevinding 13).
//
// De cache keyt op de embedding van de losse vraag en bewaart vraag + antwoord zonder
// redactie. Zegt bezoeker A "Ik ben Jan, mijn nummer is 06..." en antwoordt de bot
// "Hoi Jan", dan kan een bijna gelijke vraag van bezoeker B dat antwoord terugkrijgen.
// Daarom: bevat de vraag PII (redactPii verandert iets) of een zelfintroductie, dan
// geen lookup én geen write. Dit verandert geen antwoord, alleen of de cache meedoet
// (zo'n vraag loopt gewoon de volledige pipeline). Gedeeld door V0 en V1.

import { redactPii } from '@/lib/observability/redact';

// Zelfintroducties (NL + EN). Woordgrenzen, zodat "ikbenieuwd" of "ham" niet matchen.
const SELF_INTRO = /(^|[^\p{L}])(ik ben|mijn naam is|i am|my name is)(?=$|[^\p{L}])/iu;

/** true = deze vraag niet in de answer-cache opzoeken of opslaan. */
export function shouldBypassAnswerCache(question: string): boolean {
  if (!question) return false;
  if (redactPii(question) !== question) return true;
  return SELF_INTRO.test(question);
}
