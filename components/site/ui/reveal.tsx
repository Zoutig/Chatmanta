'use client';

import { motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Scroll-reveal (fade + kleine lift) — content-first:
 * - SSR/no-JS: inhoud staat gewoon zichtbaar in de HTML (geen opacity:0 in de markup).
 * - Pas ná hydratie wordt een element dat nog ONDER de vouw staat verborgen en bij
 *   binnenscrollen (whileInView-gedrag via useInView) ingefade. Wat al in beeld is
 *   bij laden, animeert niet (geen flits, geen LCP-vertraging).
 * - prefers-reduced-motion: doet niets.
 * Gebruik NIET voor de hero/LCP-content; die moet direct staan.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 12,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Seconden; handig om items in een grid te laten "stapelen" (0, .06, .12…). */
  delay?: number;
  /** Start-offset in px. */
  y?: number;
  as?: 'div' | 'li';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  const variants = {
    hidden: { opacity: 0, y, transition: { duration: 0 } },
    shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay } },
  };
  const state = !armed || inView ? 'shown' : 'hidden';

  if (as === 'li') {
    return (
      <motion.li
        ref={ref as React.Ref<HTMLLIElement>}
        className={className}
        initial={false}
        animate={state}
        variants={variants}
      >
        {children}
      </motion.li>
    );
  }
  return (
    <motion.div
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      initial={false}
      animate={state}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}
