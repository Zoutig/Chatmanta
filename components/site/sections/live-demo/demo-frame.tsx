'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Browser-preview van /voorbeeld (decoratief, aria-hidden). Signatuurmoment: het
 * widgetvenster springt één keer open zodra het frame half in beeld is (mockup:
 * "Demo-blok: widget opent één keer").
 *
 * Content-first: de SSR-HTML toont het venster gewoon open. Pas ná hydratie, en alleen
 * als het frame nog niet in beeld is, wordt het venster ingeklapt (`demo-pre`) zodat
 * het bij binnenscrollen kan openspringen. Reduced motion: blijft gewoon open.
 */
export function DemoFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [pre, setPre] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    // Al (grotendeels) in beeld bij laden: niet animeren, geen flits.
    if (r.top < window.innerHeight * 0.75 && r.bottom > 0) return;

    setPre(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        timer = setTimeout(() => setPre(false), 300);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [reduce]);

  return (
    <div ref={ref} className={pre ? 'browser demo-pre' : 'browser'} aria-hidden="true">
      {children}
    </div>
  );
}
