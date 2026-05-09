// V0.4 prompt-injection detector — wrapper rond INJECTION_PATTERNS uit
// ./injection-patterns.ts. Logica voor detectie, mode-bepaling, en de
// user-facing block-message.

import 'server-only';

import {
  DEFAULT_INJECTION_MODE,
  INJECTION_BLOCKED_MESSAGE,
  INJECTION_PATTERNS,
  type InjectionMode,
  type InjectionPattern,
} from './injection-patterns';

export type InjectionDetection = {
  detected: boolean;
  /** Eerste matchende patroon (we stoppen bij de eerste hit). null als niets matcht. */
  pattern: InjectionPattern | null;
  /** Alle matchende patronen — voor telemetrie. */
  allMatches: InjectionPattern[];
};

/**
 * Detecteer prompt-injection patterns in user-input. Returnt detected=true
 * zodra het EERSTE patroon matcht — alle patterns worden alsnog geprobeerd
 * voor uitgebreide telemetrie (`allMatches`).
 *
 * NIET case-sensitive (alle regexes hebben /i flag).
 */
export function detectInjection(text: string): InjectionDetection {
  const allMatches: InjectionPattern[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.regex.test(text)) allMatches.push(p);
  }
  return {
    detected: allMatches.length > 0,
    pattern: allMatches[0] ?? null,
    allMatches,
  };
}

/**
 * Bepaal welke modus actief is voor deze deployment.
 * Env var `INJECTION_MODE` overrulet — accepteert 'log-only' of 'block'.
 * Default = 'log-only' zodat we eerst false-positives kunnen tunen.
 */
export function getInjectionMode(): InjectionMode {
  const raw = process.env.INJECTION_MODE?.toLowerCase().trim();
  if (raw === 'block') return 'block';
  if (raw === 'log-only') return 'log-only';
  return DEFAULT_INJECTION_MODE;
}

export { INJECTION_BLOCKED_MESSAGE };
