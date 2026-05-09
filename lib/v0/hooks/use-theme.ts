'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'chatmanta-theme';

function readChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage kan ontoegankelijk zijn (private browsing); val terug op system
  }
  return 'system';
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
  // SSR: start met 'system'. Inline FOUC-script in layout.tsx heeft de DOM
  // al voor ons gezet, dus initial render flickert niet.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Eerste mount: lees opgeslagen voorkeur en resolve.
  useEffect(() => {
    const stored = readChoice();
    setChoice(stored);
    setResolved(resolveTheme(stored));
  }, []);

  // Listen naar OS-preference change als choice='system'.
  useEffect(() => {
    if (choice !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyToDom(next);
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
  }, []);

  return { choice, resolved, set };
}
