// Tone & length helpers — pure prompt-bouw, geen I/O.
//
// buildSystemPrompt is de single source of truth voor hoe tone/length op de
// base system prompt worden aangezogen. Wordt gebruikt door:
//   - lib/v0/server/rag.ts  (server-side, voor de echte LLM-call)
//   - app/components/prompt-view.tsx  (client-side, voor de live preview)
// Beide paden delen één implementatie zodat de preview niet kan driften.

import {
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  isLength,
  isTone,
  type Length,
  type Tone,
} from './style-types';

const TONE_INSTRUCTION: Record<Tone, string> = {
  formal:
    'Antwoord in een formele, zakelijke toon. Gebruik u-vorm waar passend.',
  neutral:
    'Antwoord in een neutrale, professioneel-vriendelijke toon (de standaard).',
  casual:
    'Antwoord in een losse, informele toon. Mag jij/je. Mag een knipoog.',
};

const LENGTH_INSTRUCTION: Record<Length, string> = {
  short: 'Houd het kort: maximaal 2 zinnen.',
  medium: 'Houd het op één korte alinea (3–5 zinnen).',
  detailed:
    'Geef een uitgebreid antwoord van meerdere alineas waar de stof dat toelaat.',
};

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
): string {
  const suffix =
    `\n\nSTIJL:\n` +
    `- ${TONE_INSTRUCTION[style.tone]}\n` +
    `- ${LENGTH_INSTRUCTION[style.length]}`;
  return baseSystem + suffix;
}

export function describeStyle(style: { tone: Tone; length: Length }): {
  tone: string;
  length: string;
} {
  return {
    tone: TONE_INSTRUCTION[style.tone],
    length: LENGTH_INSTRUCTION[style.length],
  };
}

/** Alleen de suffix — handig voor de Prompt-tab UI. */
export function buildStyleSuffix(style: { tone: Tone; length: Length }): string {
  return (
    `STIJL:\n` +
    `- ${TONE_INSTRUCTION[style.tone]}\n` +
    `- ${LENGTH_INSTRUCTION[style.length]}`
  );
}
