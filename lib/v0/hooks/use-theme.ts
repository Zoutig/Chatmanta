'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'chatmanta-theme';
// Custom event waarmee useTheme-instances elkaar op de hoogte stellen.
// Nodig omdat de hook géén Context-store deelt: zonder cross-instance sync
// blijft een tweede consumer (HubBackground/HubCard/AccentPicker) op zijn
// eigen lokale state hangen wanneer de AnimatedThemeToggler `set()` aanroept.
const THEME_CHANGE_EVENT = 'chatmanta:theme-change';

type ThemeChangeDetail = { choice: ThemeChoice; resolved: ResolvedTheme };

function readChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage kan ontoegankelijk zijn (private browsing); val terug op light
  }
  return 'light';
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.setAttribute('data-theme', resolved);
}

export function useTheme(): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  set: (c: ThemeChoice) => void;
} {
  // SSR: start met 'light' (matched de FOUC-script default). De inline script
  // in layout.tsx heeft de DOM al voor ons gezet, dus initial render flickert niet.
  const [choice, setChoice] = useState<ThemeChoice>('light');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Eerste mount: lees opgeslagen voorkeur en resolve. Daarna luister
  // naar cross-instance updates via custom event en cross-tab updates
  // via storage event, zodat alle useTheme-consumers in sync blijven
  // zonder Context-provider.
  /* eslint-disable react-hooks/set-state-in-effect -- bewust patroon: SSR-safe defaults via useState, dan op de client localStorage uitlezen. Lazy initializer zou hydration-mismatch geven op aria-checked state in ThemeSwitch. */
  useEffect(() => {
    const stored = readChoice();
    setChoice(stored);
    setResolved(resolveTheme(stored));

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ThemeChangeDetail>).detail;
      if (!detail) return;
      setChoice(detail.choice);
      setResolved(detail.resolved);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readChoice();
      setChoice(next);
      setResolved(resolveTheme(next));
    };
    window.addEventListener(THEME_CHANGE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Listen naar OS-preference change als choice='system'.
  useEffect(() => {
    if (choice !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyToDom(next);
      window.dispatchEvent(
        new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
          detail: { choice: 'system', resolved: next },
        }),
      );
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [choice]);

  const set = useCallback((c: ThemeChoice) => {
    setChoice(c);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, c);
      } catch {
        // Negeer write-fouten in private browsing
      }
    }
    const next = resolveTheme(c);
    setResolved(next);
    applyToDom(next);
    if (typeof window !== 'undefined') {
      // Notify andere useTheme-instances binnen dezelfde tab — anders
      // blijven HubBackground/HubCard/AccentPicker op stale lokale state.
      window.dispatchEvent(
        new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
          detail: { choice: c, resolved: next },
        }),
      );
    }
  }, []);

  return { choice, resolved, set };
}
