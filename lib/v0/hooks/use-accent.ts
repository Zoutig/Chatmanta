'use client';

import { useCallback, useEffect, useState } from 'react';

export type AccentColor = '#00CC9B' | '#009292' | '#01637E' | '#024D50';

export const ACCENT_OPTIONS: readonly { value: AccentColor; label: string }[] = [
  { value: '#00CC9B', label: 'Caribbean Green' },
  { value: '#009292', label: 'Common Teal' },
  { value: '#01637E', label: 'Crystal Teal' },
  { value: '#024D50', label: 'Dark Teal' },
];

export const DEFAULT_ACCENT: AccentColor = '#009292';
const STORAGE_KEY = 'chatmanta-accent';
const VALID: readonly AccentColor[] = ACCENT_OPTIONS.map((o) => o.value);

function isAccent(v: unknown): v is AccentColor {
  return typeof v === 'string' && (VALID as readonly string[]).includes(v);
}

function readStored(): AccentColor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isAccent(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: AccentColor): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // negeer write-fouten in private browsing
  }
}

function applyToDom(accent: AccentColor): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', accent);
  document.documentElement.style.setProperty('--manta-accent', accent);
}

export function useAccent(): {
  accent: AccentColor;
  set: (a: AccentColor) => void;
} {
  const [state, setState] = useState<AccentColor>(DEFAULT_ACCENT);

  /* eslint-disable react-hooks/set-state-in-effect -- zelfde SSR-safe patroon als use-style-mode.ts: lazy initializer zou hydration-mismatch geven op aria-checked state in de AccentPicker. */
  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((a: AccentColor) => {
    setState(a);
    writeStored(a);
    applyToDom(a);
  }, []);

  return { accent: state, set };
}
