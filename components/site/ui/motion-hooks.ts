'use client';

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

// Lichte vervangers voor useReducedMotion/useInView uit `motion/react`, zodat de
// marketing-homepage de motion-bibliotheek (~45 KB gzip) niet hoeft te laden.

const REDUCE_MQ = '(prefers-reduced-motion: reduce)';

function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** true als de bezoeker "minder beweging" heeft aangezet. Server/hydratie: false. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE_MQ).matches,
    () => false,
  );
}

/**
 * true zodra (een deel van) het element in beeld is. `amount` = fractie die zichtbaar
 * moet zijn (0-1), `margin` = rootMargin, `once` = na de eerste keer true blijven.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, amount = 0, margin }: { once?: boolean; amount?: number; margin?: string } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin, threshold: amount },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, amount, margin]);
  return inView;
}
