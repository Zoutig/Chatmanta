'use client';

import { useInView, useReducedMotion } from '../../ui/motion-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../ui/cx';

/**
 * Mobiele tegenhanger van de sticky stage (<900px): speelt de kleine visual van een
 * stap één keer af zodra hij in beeld scrollt (URL intypen, tegels vullen). Zelfde
 * content-first-regel als Reveal: de HTML toont de eindstand; pas ná hydratie wordt
 * een visual die nog onder de vouw staat "gewapend" (beginstand) en bij binnenscrollen
 * afgespeeld. Reduced motion: blijft gewoon de eindstand. Animaties staan in CSS.
 */
export function MiniPlay({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -30% 0px' });
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.7) setArmed(true);
  }, [reduce]);

  return (
    <div ref={ref} className={cx('mini', armed && 'is-armed', armed && inView && 'is-play')} aria-hidden="true">
      {children}
    </div>
  );
}
