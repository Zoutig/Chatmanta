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
//
// Altijd een introductie: "ik heet", "mijn naam (is/:)", "my name (is)".
const ALWAYS_INTRO = /(^|[^\p{L}])(ik heet|mijn naam|my name)(?=$|[^\p{L}])/iu;
// "ik ben" / "I am" / "I'm" zijn vaak géén introductie ("ik ben mijn wachtwoord
// vergeten", "I am looking for..."). Die tellen alleen als het volgende woord met een
// hoofdletter begint ("ik ben Jan") of als los woord eindigt op een komma of het einde
// van de vraag ("ik ben jan, ..."). Zo blijven veelgestelde FAQ-vragen met "ik ben"
// cachebaar (de answer-cache is ook de FAQ-pre-cache-opslag).
const MAYBE_INTRO = /(?:^|[^\p{L}])(?:ik ben|i am|i['’]m)\s+(\p{L}+)/giu;

function hasSelfIntro(question: string): boolean {
  if (ALWAYS_INTRO.test(question)) return true;
  for (const m of question.matchAll(MAYBE_INTRO)) {
    const rest = question.slice((m.index ?? 0) + m[0].length);
    if (/^\p{Lu}/u.test(m[1]) || /^\s*(?:,|$)/.test(rest)) return true;
  }
  return false;
}

/** true = deze vraag niet in de answer-cache opzoeken of opslaan. */
export function shouldBypassAnswerCache(question: string): boolean {
  if (!question) return false;
  if (redactPii(question) !== question) return true;
  return hasSelfIntro(question);
}
