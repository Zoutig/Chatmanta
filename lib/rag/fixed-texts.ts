// Vaste (niet-LLM) antwoordteksten van de engine, toon-bewust.
//
// Holdout-jury 2026-10-08: bij orgs met tone 'formal' (u-vorm) gaven alle
// fallback-/off-topic-templates "je", in 8 van 8 gevallen en bij elke bot-versie.
// Deze teksten passeren geen LLM, dus de STIJL-suffix in de prompt bereikt ze
// nooit. Puur en zonder 'server-only' zodat node:test het direct kan laden.

import type { Tone } from './style-types';

/** Engine-default bij geen relevante bronnen (je-vorm). Ook de V1-settings-default. */
export const FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

const FALLBACK_MESSAGE_FORMAL =
  'Daar heb ik geen informatie over. Stelt u uw vraag anders, of neemt u contact op met de organisatie.';

const isFormal = (tone: Tone) => tone === 'formal';

/**
 * Fallback-tekst: een échte klant-tekst wint altijd. Een lege override of een
 * override die letterlijk de engine-default is (V1 slaat die als settings-default
 * op) telt als "niet aangepast" → toon-bewuste default.
 */
export function resolveFallbackMessage(override: string | undefined, tone: Tone): string {
  if (override && override.length > 0 && override !== FALLBACK_MESSAGE) return override;
  return isFormal(tone) ? FALLBACK_MESSAGE_FORMAL : FALLBACK_MESSAGE;
}

export function offTopicRefusal(scope: string, tone: Tone): string {
  return isFormal(tone)
    ? `Ik help met vragen rondom ${scope}. Wat wilt u weten?`
    : `Ik help met vragen rondom ${scope}. Wat wil je weten?`;
}

export function offDomainCodeRefusal(scope: string, tone: Tone): string {
  return isFormal(tone)
    ? `Daar kan ik u helaas niet mee helpen — ik help met vragen rondom ${scope}. Waarmee kan ik u van dienst zijn?`
    : `Daar kan ik je helaas niet mee helpen — ik help met vragen rondom ${scope}. Waar kan ik je mee van dienst zijn?`;
}

// Anonimiserings-placeholders die het model soms i.p.v. een naam schrijft
// (<PRIVATE_PERSON> in v0.13x3/x4). Hoofdletters + underscore, ≥4 tekens, zodat
// gewone HTML-tags (<strong>) en wiskunde (a < b) niet matchen.
const PLACEHOLDER_RE = /<[A-Z][A-Z0-9_]{3,}>/;

export function containsPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}
