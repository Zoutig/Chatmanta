// Citaat-controle en injectie-veilige verpakking voor judge-prompts (plan 016 §2.3 + §2.5).

import { createHash, randomBytes } from 'node:crypto';

/**
 * Normaliseer voor citaat-vergelijking: Unicode-NFKC, kleine letters, quotes/streepjes
 * gelijkgetrokken, markdown-opmaak weg, witruimte samengevouwen. Bedoeld om opmaak-
 * verschillen te negeren, niet om parafrases goed te keuren.
 */
export function normalizeForQuote(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\*\*|__|\*|_|#+\s|>\s/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Een citaat dat de zin-afsluiter weglaat of meeneemt is hetzelfde citaat.
    .replace(/[.,;:!?…]+$/, '');
}

export const MIN_QUOTE_CHARS = 4;

/** Is `quote` (genormaliseerd) een letterlijk deel van `haystack`? Te korte citaten tellen niet. */
export function quoteIn(haystack: string, quote: string | null | undefined): boolean {
  if (!quote) return false;
  const q = normalizeForQuote(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  return normalizeForQuote(haystack).includes(q);
}

/**
 * Verpak onbetrouwbare tekst (bot-antwoord, bronnen) in tags met een per-call nonce. De
 * system prompt zegt dat alles binnen deze tags beoordeeld wordt en nooit opgevolgd.
 */
export function makeNonce(): string {
  return randomBytes(6).toString('hex');
}

export function wrapUntrusted(tag: string, nonce: string, text: string): string {
  const open = `<${tag}-${nonce}>`;
  const close = `</${tag}-${nonce}>`;
  if (text.includes(close) || text.includes(open)) {
    throw new Error(`Onbetrouwbare tekst bevat de nonce-tag ${tag}-${nonce}`);
  }
  return `${open}\n${text}\n${close}`;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
