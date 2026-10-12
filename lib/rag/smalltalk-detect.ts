// v0.14f — deterministische smalltalk-herkenning zonder LLM-call. Alleen een bericht
// dat in zijn geheel een Nederlandse begroeting, bedankje of afscheid is, wordt
// afgevangen; al het andere (ook "Hoi, wat kost een dak?") gaat de RAG-loop in.
// Gemiste smalltalk (Engels, varianten) valt niet stil om: die vindt bij het zoeken
// geen relevante bron, en dan routeert de luie voorbewerking (LLM) hem alsnog.
// Puur en zonder 'server-only' zodat node:test het direct kan laden.

import type { Tone } from './style-types';

export type SmalltalkKind = 'greeting' | 'thanks' | 'bye';

const GREETING =
  /^(?:hoi|hallo|hey|hee|hai|hi|dag|goede(?:n)?(?:morgen|middag|avond|dag)|goeiemorgen|goeiemiddag|goeienavond|goedendag|morgen|middag|avond)(?:\s+(?:daar|allemaal|team))?$/;
const THANKS =
  /^(?:(?:top|super|perfect|fijn|mooi|ok(?:é|e|ay)?|oke|helder|duidelijk)[\s,]+)?(?:bedankt|dank(?:je|jewel|u|uwel|\s+je(?:\s+wel)?|\s+u(?:\s+wel)?)|thanks|thx|merci)(?:\s+(?:voor\s+(?:de|je|uw)\s+(?:hulp|info|informatie|antwoord|uitleg)|hoor|nogmaals))?$/;
const BYE = /^(?:doei|dooei|tot\s+ziens|tot\s+later|fijne\s+dag(?:\s+nog)?|prettige\s+dag(?:\s+nog)?|later)$/;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFC')
    // emoji, leestekens en symbolen weg; letters (incl. é), cijfers en spaties blijven
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Type smalltalk als het héle bericht een begroeting/bedankje/afscheid is, anders null. */
export function detectSmalltalk(input: string): SmalltalkKind | null {
  if (!input || input.length > 80) return null;
  const n = normalize(input);
  if (!n) return null;
  if (GREETING.test(n)) return 'greeting';
  if (THANKS.test(n)) return 'thanks';
  if (BYE.test(n)) return 'bye';
  return null;
}

/** Vaste, toon-bewuste reply. `greeting` = persona.smalltalkGreeting (je-vorm) bij
 *  informele toon; bij 'formal' een u-vorm-variant met de bedrijfsnaam. */
export function smalltalkReply(
  kind: SmalltalkKind,
  tone: Tone,
  persona: { company: string; smalltalkGreeting: string },
): string {
  const formal = tone === 'formal';
  if (kind === 'greeting') {
    return formal
      ? `Goedendag! Waarmee kan ik u helpen namens ${persona.company}?`
      : persona.smalltalkGreeting;
  }
  if (kind === 'thanks') {
    return formal
      ? 'Graag gedaan! Laat het gerust weten als ik nog iets voor u kan doen.'
      : 'Graag gedaan! Laat het weten als ik nog iets voor je kan doen.';
  }
  return 'Graag gedaan, en nog een fijne dag!';
}
