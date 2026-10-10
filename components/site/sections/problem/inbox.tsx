'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../ui/cx';

/** Nieuwste eerst (zoals een inbox); de animatie loopt in tijdsvolgorde (onderaan begint). */
const ROWS: ReadonlyArray<readonly [string, string]> = [
  ['Zijn jullie zaterdag open?', '23:04'],
  ['Kunnen jullie een offerte sturen?', '22:00'],
  ['Leveren jullie in Groningen?', '19:37'],
  ['Wat is het retourbeleid?', '18:02'],
  ['Hebben jullie parkeerplek?', '16:20'],
  ['Kan ik een afspraak maken?', '14:48'],
  ['Wat kost een APK?', '13:15'],
  ['Hoe lang is de levertijd?', '12:30'],
  ['Leveren jullie in Groningen?', '11:03'],
  ['Wat kost een APK?', '09:40'],
  ['Zijn jullie zaterdag open?', '08:12'],
];
const START_SHOWN = 2;
const START_COUNT = 3;
const END_COUNT = 17;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Inbox-illustratie met teller 3 → 17 en stapelende bubbels (mockup-final §4).
 * Content-first: SSR = eindstand (alle 11 rijen, "17 ongelezen"). Na hydratie — zonder
 * reduced motion — terug naar 2 rijen / 3, en bij ≥50% in beeld één keer afspelen.
 */
export function Inbox() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  /** Aantal zichtbare rijen in tijdsvolgorde; null = alles (eindstand). */
  const [shown, setShown] = useState<number | null>(null);
  const [count, setCount] = useState(END_COUNT);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    setShown(START_SHOWN);
    setCount(START_COUNT);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        void (async () => {
          let n = START_COUNT;
          const total = ROWS.length;
          for (let i = START_SHOWN; i < total; i++) {
            await sleep(260);
            if (cancelled) return;
            setShown(i + 1);
            const target = Math.round(START_COUNT + ((END_COUNT - START_COUNT) * (i - 1)) / (total - 2));
            while (n < target) {
              n++;
              setCount(n);
              await sleep(30);
              if (cancelled) return;
            }
          }
          setCount(END_COUNT);
          setShown(null);
        })();
      },
      { threshold: 0.5 },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
      setShown(null);
      setCount(END_COUNT);
    };
  }, [reduce]);

  const total = ROWS.length;
  return (
    <figure className="inbox" ref={ref} aria-label="Voorbeeld van een volle inbox">
      <div className="inbox-head">
        <b>Inbox · info@</b>
        <span className="count">
          <span className="num tnum">{count}</span> ongelezen
        </span>
      </div>
      <ul className="inbox-list">
        {ROWS.map(([q, t], i) => {
          const order = total - 1 - i; // 0 = oudste
          const hidden = shown !== null && order >= shown;
          return (
            <li
              key={`${t}-${q}`}
              className={cx(order >= START_SHOWN && shown !== null && 'pop')}
              style={hidden ? { display: 'none' } : undefined}
            >
              <span>{q}</span>
              <time dateTime={t}>{t}</time>
            </li>
          );
        })}
      </ul>
      <div className="inbox-foot">Illustratie — elke vraag hier had direct beantwoord kunnen worden.</div>
    </figure>
  );
}
