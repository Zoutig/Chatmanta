// 9 meest-gekozen merkkleuren voor de widget-color-picker.
// Volgorde = 3×3 grid in dashboard (rij 1 = neutraal/blauw, rij 2 = groen/oranje,
// rij 3 = rood/paars/magenta). Wijzigen van de array verandert de visuele
// volgorde — zorg dat klant-favorieten boven blijven (kobalt + oranje).

export const COLOR_PRESETS = [
  '#0e1014', // zwart
  '#1e3a8a', // donkerblauw
  '#2563eb', // kobalt
  '#10b981', // mintgroen
  '#047857', // smaragd
  '#f97316', // oranje
  '#ef4444', // rood
  '#7c3aed', // paars
  '#ec4899', // magenta
] as const;

export type ColorPresetHex = (typeof COLOR_PRESETS)[number];

/** True als `hex` exact in de preset-set zit (case-insensitive). */
export function isPreset(hex: string): boolean {
  const norm = hex.toLowerCase();
  return COLOR_PRESETS.some((p) => p.toLowerCase() === norm);
}
