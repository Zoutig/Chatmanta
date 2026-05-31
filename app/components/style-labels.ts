// Gedeelde Nederlandse labels + hints voor de tone/length UI.
// Apart bestand zodat StylePill, StyleSegmented en PromptView dezelfde
// strings tonen.

import type { Length, Tone } from '@/lib/v0/style-types';

export const STYLE_LABELS: {
  tone: Record<Tone, string>;
  length: Record<Length, string>;
} = {
  tone: {
    formal: 'Formeel',
    neutral: 'Neutraal',
    casual: 'Casual',
    persoonlijk: 'Persoonlijk',
  },
  length: {
    short: 'Kort',
    medium: 'Medium',
    detailed: 'Uitgebreid',
  },
};

export const STYLE_HINTS = {
  tone: 'professioneel ↔ losser',
  length: '1–2 zinnen ↔ meerdere alineas',
} as const;
