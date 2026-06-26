'use client';

// Persisteert tone + length in localStorage onder een blob, hydrate-safe:
// eerste render gebruikt defaults zodat SSR en CSR matchen, een useEffect
// na mount leest de stored waarden in.

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  isLength,
  isTone,
  type Length,
  type Tone,
} from '@/lib/rag/style-types';

const STORAGE_KEY = 'chatmanta:v0:style';

type Stored = { tone: Tone; length: Length };

function readStored(): Stored | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const t = (parsed as { tone?: unknown }).tone;
    const l = (parsed as { length?: unknown }).length;
    if (isTone(t) && isLength(l)) return { tone: t, length: l };
    return null;
  } catch {
    // JSON parse error → wis corrupte key zodat we niet bij elke load opnieuw vallen.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // negeer
    }
    return null;
  }
}

function writeStored(value: Stored): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage vol of geblokkeerd → silent. Volgende session valt terug op defaults.
  }
}

export function useStyle(): {
  tone: Tone;
  length: Length;
  setTone: (t: Tone) => void;
  setLength: (l: Length) => void;
} {
  const [state, setState] = useState<Stored>({
    tone: DEFAULT_TONE,
    length: DEFAULT_LENGTH,
  });

  // Hydrate van localStorage na mount; voorkomt SSR/CSR-mismatch.
  /* eslint-disable react-hooks/set-state-in-effect -- bewust patroon: SSR-safe defaults via useState, dan op de client localStorage uitlezen. Lazy initializer zou hydration-mismatch geven omdat composer-pill labels op tone/length-waarde staan. */
  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setTone = useCallback((tone: Tone) => {
    setState((prev) => {
      const next = { ...prev, tone };
      writeStored(next);
      return next;
    });
  }, []);

  const setLength = useCallback((length: Length) => {
    setState((prev) => {
      const next = { ...prev, length };
      writeStored(next);
      return next;
    });
  }, []);

  return { tone: state.tone, length: state.length, setTone, setLength };
}
