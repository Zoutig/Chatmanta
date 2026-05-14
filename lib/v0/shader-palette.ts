import type { AccentColor } from './hooks/use-accent';

/**
 * Vier hand-getunde 5-stop palettes voor mesh-gradient / petals /
 * etheral-shadow shaders. Elke palette gaat van donker (bg-base) →
 * midtone → accent → highlight, allemaal in de teal-familie van de
 * gekozen accent.
 *
 * Waarom geen runtime-derivation? Met 4 vaste accents geeft hand-tuning
 * meer designerly controle en voorkomt het "modder-tinten" die uit
 * naïeve color-mix berekeningen rollen.
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

export function getShaderPalette(
  accent: AccentColor,
): readonly [string, string, string, string, string] {
  return PALETTES[accent] ?? PALETTES['#00CC9B'];
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
