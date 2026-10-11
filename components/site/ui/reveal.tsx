'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from './cx';
import { useInView, useReducedMotion } from './motion-hooks';

/**
 * Scroll-reveal (fade + kleine lift) — content-first:
 * - SSR/no-JS: inhoud staat gewoon zichtbaar in de HTML (geen opacity:0 in de markup).
 * - Pas ná hydratie wordt een element dat nog ONDER de vouw staat verborgen en bij
 *   binnenscrollen ingefade. Wat al in beeld is bij laden, animeert niet (geen flits,
 *   geen LCP-vertraging).
 * - prefers-reduced-motion: doet niets.
 * Puur CSS-transities (.rv in site.css) — geen animatiebibliotheek nodig.
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

  const hidden = armed && !inView;
  const cls = cx(className, armed && 'rv', hidden && 'rv-hidden');
  const style = armed ? ({ '--rv-y': `${y}px`, '--rv-delay': `${delay}s` } as CSSProperties) : undefined;

  if (as === 'li') {
    return (
      <li ref={ref as React.Ref<HTMLLIElement>} className={cls} style={style}>
        {children}
      </li>
    );
  }
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={cls} style={style}>
      {children}
    </div>
  );
}
