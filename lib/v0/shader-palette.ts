import type { AccentColor } from './hooks/use-accent';

/**
 * Vier hand-getunde 5-stop palettes voor mesh-gradient / petals /
 * etheral-shadow shaders. Dark-set gaat van donker (bg-base) →
 * midtone → accent → highlight; light-set gaat van wit → soft-accent →
 * lichte highlight. Allemaal in de teal-familie van de gekozen accent.
 *
 * Waarom geen runtime-derivation? Met 4 vaste accents geeft hand-tuning
 * meer designerly controle en voorkomt het "modder-tinten" die uit
 * naïeve color-mix berekeningen rollen.
 *
 * Callers zonder `mode`-arg krijgen de dark-default (back-compat).
 */
const PALETTES: Record<
  AccentColor,
  readonly [string, string, string, string, string]
> = {
  '#00CC9B': ['#02151a', '#024D50', '#009292', '#00CC9B', '#80fff0'],
  '#009292': ['#020f12', '#01373b', '#005d5d', '#009292', '#5feaea'],
  '#01637E': ['#01080c', '#01202a', '#013e50', '#01637E', '#65d4ed'],
  '#024D50': ['#000a0b', '#011a1c', '#013638', '#024D50', '#7fd4d8'],
};

const LIGHT_PALETTES: Record<
  AccentColor,
  readonly [string, string, string, string, string]
> = {
  '#00CC9B': ['#f6fbf8', '#dff3eb', '#a8e3d0', '#5dc6a8', '#26a586'],
  '#009292': ['#f5fafb', '#dcf0f1', '#a5dde0', '#5cc0c4', '#1f9a9e'],
  '#01637E': ['#f4f9fb', '#daecf2', '#a0c8d6', '#5896ab', '#1d6883'],
  '#024D50': ['#f3f8f8', '#d8e8e8', '#a0c4c4', '#599898', '#1e5d5d'],
};

export type PaletteMode = 'dark' | 'light';

export function getShaderPalette(
  accent: AccentColor,
  mode: PaletteMode = 'dark',
): readonly [string, string, string, string, string] {
  const source = mode === 'light' ? LIGHT_PALETTES : PALETTES;
  return source[accent] ?? source['#00CC9B'];
}

/**
 * RGB-normalisatie (0..1) van een hex-kleur — handig voor GLSL vec3
 * uniforms in de digital-petals-shader.
 */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}
