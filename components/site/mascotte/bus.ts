// Klein signaalkanaal naar de mascotte, zodat bv. de hero-chat hem kan laten praten
// of ergens naar laten kijken zonder dat de componenten elkaar kennen.

import type { MantaMode } from './manta-engine';

export type MascotteSignal = {
  /** Praten aan/uit (bv. tijdens het streamen van een antwoord). */
  talk?: boolean;
  /** Stemming; `null` = terug naar rust. */
  mode?: MantaMode | null;
  /** Even naar dit element kijken. */
  lookAt?: Element | null;
  /** Hoe lang (ms) hij naar `lookAt` kijkt. */
  lookMs?: number;
};

export const MASCOTTE_EVENT = 'chatmanta:mascotte';

export function signalMascotte(detail: MascotteSignal) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MascotteSignal>(MASCOTTE_EVENT, { detail }));
}
