// Tab-sleutels van de Kennisbank (?tab=…). Los bestand zodat zowel de server-page
// als de client-view het kan importeren.
export type KbTab = 'documenten' | 'website' | 'qa';

export function parseKbTab(v: string | null | undefined): KbTab | null {
  return v === 'documenten' || v === 'website' || v === 'qa' ? v : null;
}
