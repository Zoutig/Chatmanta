'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ACCENT_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  isAccent,
  isDensity,
  type KlantAccent,
  type KlantDensity,
} from './accents';

// Spiegelt lib/v0/hooks/use-theme.ts: SSR-safe defaults via useState, op de
// client localStorage uitlezen in useEffect, en cross-instance syncen via een
// CustomEvent (geen Context-store). Zo blijven het tweaks-panel en eventuele
// andere consumers in sync wanneer er ergens een set() wordt aangeroepen.
const TWEAK_CHANGE_EVENT = 'chatmanta:klant-tweak-change';

type TweakChangeDetail = { accent: KlantAccent; density: KlantDensity };

function readAccent(): KlantAccent {
  if (typeof window === 'undefined') return 'manta';
  try {
    const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccent(v)) return v;
  } catch {
    /* private browsing → default */
  }
  return 'manta';
}

function readDensity(): KlantDensity {
  if (typeof window === 'undefined') return 'regular';
  try {
    const v = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (isDensity(v)) return v;
  } catch {
    /* private browsing → default */
  }
  return 'regular';
}

function applyToDom(accent: KlantAccent, density: KlantDensity) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-klant-accent', accent);
  root.setAttribute('data-klant-density', density);
}

export function useTweaks(): {
  accent: KlantAccent;
  density: KlantDensity;
  setAccent: (a: KlantAccent) => void;
  setDensity: (d: KlantDensity) => void;
} {
  // SSR-defaults matchen het FOUC-script (manta/regular) zodat de eerste render
  // niet flikkert — de DOM-attributen zijn al gezet vóór hydration.
  const [accent, setAccentState] = useState<KlantAccent>('manta');
  const [density, setDensityState] = useState<KlantDensity>('regular');

  /* eslint-disable react-hooks/set-state-in-effect -- bewust patroon: SSR-safe defaults, dan op de client localStorage uitlezen. */
  useEffect(() => {
    setAccentState(readAccent());
    setDensityState(readDensity());

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<TweakChangeDetail>).detail;
      if (!detail) return;
      setAccentState(detail.accent);
      setDensityState(detail.density);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCENT_STORAGE_KEY) setAccentState(readAccent());
      if (e.key === DENSITY_STORAGE_KEY) setDensityState(readDensity());
    };
    window.addEventListener(TWEAK_CHANGE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TWEAK_CHANGE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const broadcast = useCallback((next: TweakChangeDetail) => {
    applyToDom(next.accent, next.density);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<TweakChangeDetail>(TWEAK_CHANGE_EVENT, { detail: next }));
    }
  }, []);

  const setAccent = useCallback(
    (a: KlantAccent) => {
      setAccentState(a);
      try {
        window.localStorage.setItem(ACCENT_STORAGE_KEY, a);
      } catch {
        /* negeer write-fouten (private browsing) */
      }
      broadcast({ accent: a, density: readDensity() });
    },
    [broadcast],
  );

  const setDensity = useCallback(
    (d: KlantDensity) => {
      setDensityState(d);
      try {
        window.localStorage.setItem(DENSITY_STORAGE_KEY, d);
      } catch {
        /* negeer write-fouten (private browsing) */
      }
      broadcast({ accent: readAccent(), density: d });
    },
    [broadcast],
  );

  return { accent, density, setAccent, setDensity };
}
