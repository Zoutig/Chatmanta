// Tone & length helpers — pure prompt-bouw, geen I/O.
//
// buildSystemPrompt is de single source of truth voor hoe tone/length op de
// base system prompt worden aangezogen. Wordt gebruikt door:
//   - lib/v0/server/rag.ts  (server-side, voor de echte LLM-call)
//   - app/components/prompt-view.tsx  (client-side, voor de live preview)
// Beide paden delen één implementatie zodat de preview niet kan driften.
//
// V2 (v0.7+): scherpere length-strings; BLUF + anti-preamble zit in de bot-
// systemPrompt zelf, niet in de stijl-suffix.

import {
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  isLength,
  isTone,
  type Length,
  type Tone,
} from './style-types';

export type OutputStyleVersion = 'v1' | 'v2' | 'v3';

const TONE_INSTRUCTION: Record<Tone, string> = {
  formal:
    'Antwoord in een formele, zakelijke toon. Gebruik u-vorm waar passend.',
  neutral:
    'Antwoord in een warme, vriendelijke toon (klantcontact-stijl). Gebruik je/jij — geen u-vorm. Toon dat je graag helpt: woorden als "graag", "natuurlijk", "leuk dat je het vraagt" mogen, maar gedoseerd. Geen overdreven enthousiasme, geen emoji.',
  casual:
    'Antwoord in een losse, informele toon. Gebruik je/jij. Mag een knipoog en passende emoji (max 1-2 per antwoord, gedoseerd — bv. 👋 bij begroeting, 🙂 bij vriendelijke opmerking, ✨ bij iets leuks, 👍 bij bevestiging). Geen emoji-spam, geen overdreven enthousiasme.',
  persoonlijk:
    'Antwoord persoonlijk en warm, alsof je met de klant aan het appen bent. Gebruik je/jij, korte natuurlijke zinnen en spreektaal — geen formeel of afstandelijk register. Toon oprechte betrokkenheid ("fijn dat je het vraagt", "ik snap je", "ik help je graag even op weg") zonder overdreven of geforceerd enthousiast te worden. Emoji mag, maar spaarzaam: 0 tot 2 per antwoord, vaak nul, alleen waar het natuurlijk voelt (bv. 👋 bij een begroeting, 🙂 bij iets vriendelijks, 👍 bij een bevestiging) — nooit emoji-spam, nooit een emoji in elke zin, en LAAT EMOJI WEG bij gevoelige onderwerpen zoals prijzen/geld, klachten of medische kwesties. Blijf altijd feitelijk accuraat: persoonlijkheid en warmte mogen de inhoud of de eerlijkheid nooit vervangen.',
};

const LENGTH_INSTRUCTION_V1: Record<Length, string> = {
  short: 'Houd het kort: maximaal 2 zinnen.',
  medium: 'Houd het op één korte alinea (3–5 zinnen).',
  detailed:
    'Geef een uitgebreid antwoord van meerdere alineas waar de stof dat toelaat.',
};

const LENGTH_INSTRUCTION_V2: Record<Length, string> = {
  short:
    'Houd het ULTRA-kort: 1 zin als het kan, maximaal 2. Geen volzinnen waar komma\'s genoeg zijn. Geen aanloop of slot.',
  medium:
    'Geef het minimum dat compleet is — zo kort als de vraag toelaat, zo lang als nodig om volledig te zijn. Bij een simpel feit: 1-2 zinnen. Bij meerdere onderdelen of een vergelijking: paragraafje. Geen verplichte minimum-lengte, geen vulling.',
  detailed:
    'Geef het volledige antwoord met structuur: paragrafen met witregels (lege regel tussen blokken), opsommingen waar er 3+ parallelle items zijn (regels die beginnen met "- "), en gebruik **vetgedrukte koppen** voor sub-onderwerpen (bv. "**Openingstijden**" gevolgd door details). Meer structuur, niet meer woorden — voeg geen vulling toe voor de schijn van diepgang.',
};

// V3 (v0.7.2): tune van V2. De eval draait altijd op length='medium'
// (DEFAULT_LENGTH) — daar zat de too_curt-regressie van v0.7.1: "het minimum dat
// compleet is" + BLUF deden de bot nodige context, wedervragen en contact-CTA's
// droppen. V3 behoudt de beknoptheid maar geeft die assen expliciet terug.
const LENGTH_INSTRUCTION_V3: Record<Length, string> = {
  short:
    'Houd het kort en direct: meestal 1-3 zinnen. Geen aanloop of herhaling. Maar laat geen cruciale nuance, correctie of vervolgstap weg om kort te zijn.',
  medium:
    'Geef het minimum dat compleet én bruikbaar is — zo kort als de vraag toelaat, zo lang als nodig. Bij een simpel feit: 1-2 zinnen. Bij meerdere onderdelen of een vergelijking: een paragraafje. Laat nooit context weg die de klant nodig heeft om het antwoord te kunnen gebruiken. Bij een vage of onderspecificeerde vraag: stel eerst één gerichte wedervraag in plaats van te gokken. Geen vulling, maar beknoptheid gaat nooit ten koste van een nodige nuance, correctie of vervolgstap.',
  detailed:
    'Geef het volledige antwoord met structuur: paragrafen met witregels (lege regel tussen blokken), opsommingen waar er 3+ parallelle items zijn (regels die beginnen met "- "), en gebruik **vetgedrukte koppen** voor sub-onderwerpen (bv. "**Openingstijden**" gevolgd door details). Meer structuur, niet meer woorden — voeg geen vulling toe voor de schijn van diepgang.',
};

function pickLengthMap(version: OutputStyleVersion): Record<Length, string> {
  if (version === 'v3') return LENGTH_INSTRUCTION_V3;
  if (version === 'v2') return LENGTH_INSTRUCTION_V2;
  return LENGTH_INSTRUCTION_V1;
}

export function normalizeStyle(input: {
  tone?: unknown;
  length?: unknown;
}): { tone: Tone; length: Length } {
  return {
    tone: isTone(input.tone) ? input.tone : DEFAULT_TONE,
    length: isLength(input.length) ? input.length : DEFAULT_LENGTH,
  };
}

export function buildSystemPrompt(
  baseSystem: string,
  style: { tone: Tone; length: Length },
  outputStyleVersion: OutputStyleVersion = 'v1',
): string {
  const lengthMap = pickLengthMap(outputStyleVersion);
  const suffix =
    `\n\nSTIJL:\n` +
    `- ${TONE_INSTRUCTION[style.tone]}\n` +
    `- ${lengthMap[style.length]}`;
  return baseSystem + suffix;
}

export function describeStyle(
  style: { tone: Tone; length: Length },
  outputStyleVersion: OutputStyleVersion = 'v1',
): {
  tone: string;
  length: string;
} {
  const lengthMap = pickLengthMap(outputStyleVersion);
  return {
    tone: TONE_INSTRUCTION[style.tone],
    length: lengthMap[style.length],
  };
}

/** Alleen de suffix — handig voor de Prompt-tab UI. */
export function buildStyleSuffix(
  style: { tone: Tone; length: Length },
  outputStyleVersion: OutputStyleVersion = 'v1',
): string {
  const lengthMap = pickLengthMap(outputStyleVersion);
  return (
    `STIJL:\n` +
    `- ${TONE_INSTRUCTION[style.tone]}\n` +
    `- ${lengthMap[style.length]}`
  );
}
