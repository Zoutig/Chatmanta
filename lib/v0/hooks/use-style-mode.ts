'use client';

import { useCallback, useEffect, useState } from 'react';

export type StyleMode = 'classic' | 'glass' | 'manta';

export const DEFAULT_STYLE_MODE: StyleMode = 'manta';
const STORAGE_KEY = 'chatmanta-style';
const VALID: readonly StyleMode[] = ['classic', 'glass', 'manta'];

function isStyleMode(v: unknown): v is StyleMode {
  return typeof v === 'string' && (VALID as readonly string[]).includes(v);
}

function readStored(): StyleMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // Migratie: 'refined' was de v1-naam vóór de rename naar 'glass'.
    if (raw === 'refined') {
      window.localStorage.setItem(STORAGE_KEY, 'glass');
      return 'glass';
    }
    return isStyleMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: StyleMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // negeer write-fouten in private browsing
  }
}

function applyToDom(mode: StyleMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-style', mode);
}

// ─── Gedeelde module-store ───────────────────────────────────────────────
// Belangrijk: zonder shared store hebben twee component-instances (bv.
// ChatShell + OpmaakView) ELK een eigen useState. Als OpmaakView dan set()
// aanroept, krijgt ChatShell geen update en re-rendert niet. Gevolg: Manta-
// DOM blijft gemount terwijl `data-style="classic"` Manta-CSS strip — totale
// layout-collaps. Door alle subscribers in een module-Set te bewaren en bij
// set() alle setters tegelijk te triggeren, blijven alle hook-instances
// synchroon.
const subscribers = new Set<(m: StyleMode) => void>();
let currentMode: StyleMode = DEFAULT_STYLE_MODE;

function notify(mode: StyleMode): void {
  currentMode = mode;
  subscribers.forEach((fn) => fn(mode));
}

export function useStyleMode(): {
  mode: StyleMode;
  set: (m: StyleMode) => void;
} {
  // SSR: start met currentMode (default of laatst-gezet via een andere instance).
  // Boot-script in app/layout.tsx heeft data-style al op de DOM gezet voor de
  // eerste paint, dus geen FOUC.
  const [state, setState] = useState<StyleMode>(currentMode);

  /* eslint-disable react-hooks/set-state-in-effect -- SSR-safe sync: lazy initializer zou hydration-mismatch geven; module-state moet bij mount eenmaal naar React-state worden gepushed. */
  useEffect(() => {
    // Lees localStorage + synchroniseer module-state op eerste mount.
    const stored = readStored();
    if (stored && stored !== currentMode) {
      currentMode = stored;
    }
    if (state !== currentMode) {
      setState(currentMode);
    }
    subscribers.add(setState);
    return () => {
      subscribers.delete(setState);
    };
    // We willen alleen op mount subscriben, niet bij elke state-change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((m: StyleMode) => {
    writeStored(m);
    applyToDom(m);
    notify(m); // → triggert alle subscribers (alle useStyleMode-instances)
  }, []);

  return { mode: state, set };
}
