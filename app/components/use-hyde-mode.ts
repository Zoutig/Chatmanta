'use client';

// Persisteert HyDE-modus override in localStorage. Hydrate-safe net als
// use-style.ts: defaults op SSR, useEffect leest stored op de client.
//
// 'auto' = volg bot-versie config (default). De andere drie zijn override-
// modi voor evaluatie. Override wint altijd in de pipeline, ook over bots
// waar useHyDE=false in config staat.

import { useCallback, useEffect, useState } from 'react';

export type HydeMode = 'auto' | 'off' | 'upfront' | 'selective';

export const DEFAULT_HYDE_MODE: HydeMode = 'auto';
const STORAGE_KEY = 'chatmanta:v0:hydeMode';
const VALID: readonly HydeMode[] = ['auto', 'off', 'upfront', 'selective'];

function isHydeMode(v: unknown): v is HydeMode {
  return typeof v === 'string' && (VALID as readonly string[]).includes(v);
}

function readStored(): HydeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return isHydeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: HydeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // negeer
  }
}

export function useHydeMode(): {
  hydeMode: HydeMode;
  setHydeMode: (m: HydeMode) => void;
} {
  const [state, setState] = useState<HydeMode>(DEFAULT_HYDE_MODE);

  /* eslint-disable react-hooks/set-state-in-effect -- zelfde SSR-safe patroon als use-style.ts */
  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setHydeMode = useCallback((mode: HydeMode) => {
    setState(mode);
    writeStored(mode);
  }, []);

  return { hydeMode: state, setHydeMode };
}
