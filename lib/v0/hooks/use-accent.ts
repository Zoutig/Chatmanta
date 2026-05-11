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

// Zelfde shared-store-patroon als useStyleMode — meerdere hook-instances
// moeten synchroon blijven anders re-rendert ChatShell niet bij toggle.
const subscribers = new Set<(a: AccentColor) => void>();
let currentAccent: AccentColor = DEFAULT_ACCENT;

function notify(accent: AccentColor): void {
  currentAccent = accent;
  subscribers.forEach((fn) => fn(accent));
}

export function useAccent(): {
  accent: AccentColor;
  set: (a: AccentColor) => void;
} {
  const [state, setState] = useState<AccentColor>(currentAccent);

  /* eslint-disable react-hooks/set-state-in-effect -- zelfde SSR-safe sync als in use-style-mode; module-state moet eenmaal naar React-state worden gepushed bij mount. */
  useEffect(() => {
    const stored = readStored();
    if (stored && stored !== currentAccent) {
      currentAccent = stored;
    }
    if (state !== currentAccent) {
      setState(currentAccent);
    }
    subscribers.add(setState);
    return () => {
      subscribers.delete(setState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((a: AccentColor) => {
    writeStored(a);
    applyToDom(a);
    notify(a);
  }, []);

  return { accent: state, set };
}
