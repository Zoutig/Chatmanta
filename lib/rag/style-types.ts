// Tone & length toggles — gedeelde types tussen client en server.
//
// Geen 'server-only' import: dit bestand wordt zowel door de RAG-laag (server)
// als door de chat UI (client) gebruikt. Bevat geen secrets of side-effects.

export const TONES = ['formal', 'neutral', 'casual', 'persoonlijk'] as const;
export const LENGTHS = ['short', 'medium', 'detailed'] as const;

export type Tone = (typeof TONES)[number];
export type Length = (typeof LENGTHS)[number];

export const DEFAULT_TONE: Tone = 'neutral';
export const DEFAULT_LENGTH: Length = 'medium';

export function isTone(v: unknown): v is Tone {
  return typeof v === 'string' && (TONES as readonly string[]).includes(v);
}

export function isLength(v: unknown): v is Length {
  return typeof v === 'string' && (LENGTHS as readonly string[]).includes(v);
}
