'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Bento-grid met "max 2 tegels tegelijk" (mockup-final §6): alleen de tegel die het
 * meest in beeld is (≥35%) plus de tegel met hover/focus speelt zijn micro-demo af.
 * Buiten beeld, bij een verborgen tabblad en bij reduced motion speelt niets.
 * De tegels zelf zijn server-gerenderd (children, met `data-tile`); wij zetten alleen
 * `data-play` op de grid, de CSS koppelt dat aan de juiste tegel.
 */
export function BentoPlay({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [play, setPlay] = useState('');

  useEffect(() => {
    const grid = ref.current;
    if (!grid || reduce) {
      setPlay('');
      return;
    }
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>('[data-tile]'));
    const ratios = new Map<HTMLElement, number>();
    let hovered: HTMLElement | null = null;

    const update = () => {
      if (document.hidden) {
        setPlay('');
        return;
      }
      let best: HTMLElement | null = null;
      let br = 0.35;
      ratios.forEach((r, el) => {
        if (r > br) {
          br = r;
          best = el;
        }
      });
      const ids = new Set<string>();
      for (const el of [best, hovered] as Array<HTMLElement | null>) {
        if (el?.dataset.tile) ids.add(el.dataset.tile);
      }
      setPlay(Array.from(ids).join(' '));
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(e.target as HTMLElement, e.intersectionRatio));
        update();
      },
      { threshold: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1] },
    );

    const cleanups: Array<() => void> = [];
    tiles.forEach((t) => {
      io.observe(t);
      const on = () => {
        hovered = t;
        update();
      };
      const off = () => {
        if (hovered === t) hovered = null;
        update();
      };
      t.addEventListener('pointerenter', on);
      t.addEventListener('pointerleave', off);
      t.addEventListener('focusin', on);
      t.addEventListener('focusout', off);
      cleanups.push(() => {
        t.removeEventListener('pointerenter', on);
        t.removeEventListener('pointerleave', off);
        t.removeEventListener('focusin', on);
        t.removeEventListener('focusout', off);
      });
    });
    document.addEventListener('visibilitychange', update);

    return () => {
      io.disconnect();
      cleanups.forEach((f) => f());
      document.removeEventListener('visibilitychange', update);
    };
  }, [reduce]);

  return (
    <div className="bento" ref={ref} data-play={play || undefined}>
      {children}
    </div>
  );
}
