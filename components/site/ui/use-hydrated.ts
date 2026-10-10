'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * false tijdens SSR en hydratie, true daarna — zonder setState-in-effect.
 * Gebruik voor progressive enhancement: server-HTML toont de no-JS-staat,
 * na hydratie schakelt de client de interactieve staat in.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
