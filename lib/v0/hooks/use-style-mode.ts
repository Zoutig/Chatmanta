'use client';

import { useCallback, useEffect, useState } from 'react';

export type StyleMode = 'classic' | 'glass';

export const DEFAULT_STYLE_MODE: StyleMode = 'classic';
const STORAGE_KEY = 'chatmanta-style';
const VALID: readonly StyleMode[] = ['classic', 'glass'];

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

export function useStyleMode(): {
  mode: StyleMode;
  set: (m: StyleMode) => void;
} {
  // SSR: start met default. Boot-script in app/layout.tsx heeft data-style al
  // op de DOM gezet voor de eerste paint, dus geen FOUC.
  const [state, setState] = useState<StyleMode>(DEFAULT_STYLE_MODE);

  /* eslint-disable react-hooks/set-state-in-effect -- zelfde SSR-safe patroon als use-theme.ts / use-hyde-mode.ts: lazy initializer zou hydration-mismatch geven op aria-checked state in de SettingsView segmented control. */
  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((m: StyleMode) => {
    setState(m);
    writeStored(m);
    applyToDom(m);
  }, []);

  return { mode: state, set };
}
