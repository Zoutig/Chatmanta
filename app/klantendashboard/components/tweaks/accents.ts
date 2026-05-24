// Klantendashboard tweak-opties: accent-families + dichtheid.
// Bewust gescheiden van de globale ChatManta-accent (--manta-accent voor
// marketingsite/admintool) — het dashboard-accent is onafhankelijk.
// De hex-waarden hier sturen alleen de swatch-preview in het tweaks-panel;
// de echte token-waarden leven in klant.css per data-klant-accent-blok.

export type KlantAccent = 'manta' | 'indigo' | 'terra' | 'slate';
export type KlantDensity = 'compact' | 'regular' | 'comfy';

export const KLANT_ACCENTS: ReadonlyArray<{
  id: KlantAccent;
  name: string;
  /** swatch-kleur in light-mode */
  light: string;
  /** swatch-kleur in dark-mode */
  dark: string;
}> = [
  { id: 'manta', name: 'Manta', light: '#0E8E78', dark: '#6FE3C2' },
  { id: 'indigo', name: 'Indigo', light: '#4F46E5', dark: '#8B92FF' },
  { id: 'terra', name: 'Terra', light: '#B94B26', dark: '#F2867A' },
  { id: 'slate', name: 'Slate', light: '#3A4656', dark: '#A6B2C2' },
];

export const KLANT_DENSITIES: ReadonlyArray<{ id: KlantDensity; label: string }> = [
  { id: 'compact', label: 'Compact' },
  { id: 'regular', label: 'Normaal' },
  { id: 'comfy', label: 'Ruim' },
];

export const KLANT_ACCENT_IDS: KlantAccent[] = KLANT_ACCENTS.map((a) => a.id);
export const KLANT_DENSITY_IDS: KlantDensity[] = KLANT_DENSITIES.map((d) => d.id);

export const ACCENT_STORAGE_KEY = 'chatmanta-klant-accent';
export const DENSITY_STORAGE_KEY = 'chatmanta-klant-density';

export function isAccent(v: unknown): v is KlantAccent {
  return typeof v === 'string' && (KLANT_ACCENT_IDS as string[]).includes(v);
}
export function isDensity(v: unknown): v is KlantDensity {
  return typeof v === 'string' && (KLANT_DENSITY_IDS as string[]).includes(v);
}
