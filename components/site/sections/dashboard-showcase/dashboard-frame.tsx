'use client';

import { useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Licht geanimeerd in beeld (mockup: overlays eenmalig bij in beeld).
 * Content-first: SSR/no-JS toont het frame in eindtoestand. Pas ná hydratie, en alleen
 * als het frame nog ONDER de vouw staat, gaat het in "pre"-stand; bij binnenscrollen
 * (eenmalig) schuift het in en ploft de contactverzoek-badge erbij. Reduced motion: niets.
 */
export function DashboardFrame({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.8) setArmed(true);
  }, [reduce]);

  const state = !armed ? 'is-static' : inView ? 'is-on' : 'is-pre';

  return (
    <div ref={ref} className={`dash-frame ${state}`} role="figure" aria-label={label}>
      {children}
    </div>
  );
}
