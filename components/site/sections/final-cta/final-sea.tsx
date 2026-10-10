'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Mark } from '../../ui/logo';

/** Breekpunt waarop de golf naast de tekst staat (anders: strook onder de tekst). Gelijk aan final-cta.css. */
const SIDE_MQ = '(min-width: 960px)';
const VB_W = 1000;
const VB_H = 420;
const DURATION = 3200;

/**
 * Signatuurmoment slot-CTA (mockup "Slot-CTA: manta trekt één golflijn (eenmalig)"):
 * het echte merkteken (mono-mark.png als mask, via <Mark>) zwemt één keer langs een
 * golflijn en trekt die daarbij. Rustig: één keer, 3,2s ease-out, daarna stil.
 *
 * Afwijking t.o.v. mockup (bewust): de golf + manta leven in een eigen vlak
 * (`.final-sea`) dat nooit over de tekst valt: op desktop een kolom rechts naast de
 * tekst, op mobiel/tablet een strook onder de tekst. Zo loopt de lijn nooit door kop,
 * knoppen of mailregel.
 *
 * Decoratief (aria-hidden). Zonder JS: golf volledig getekend, geen manta.
 * Reduced motion: direct de eindtoestand (lijn getekend, manta op het eindpunt).
 */
export function FinalSea() {
  const seaRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const mantaRef = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const sea = seaRef.current;
    const path = pathRef.current;
    const manta = mantaRef.current;
    if (!sea || !path || !manta) return;

    const end = () => (window.matchMedia(SIDE_MQ).matches ? 0.78 : 0.9);
    const place = (t: number) => {
      const L = path.getTotalLength();
      const pt = path.getPointAtLength(L * t);
      const pt2 = path.getPointAtLength(Math.min(L, L * t + 2));
      const sx = sea.offsetWidth / VB_W;
      const sy = sea.offsetHeight / VB_H;
      const half = manta.offsetWidth / 2;
      const ang = (Math.atan2((pt2.y - pt.y) * sy, (pt2.x - pt.x) * sx) * 180) / Math.PI;
      manta.style.transform = `translate(${pt.x * sx - half}px, ${pt.y * sy - half * 0.62}px) rotate(${(ang * 0.35).toFixed(1)}deg)`;
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = String(1 - t);
    };

    let done = false;
    let raf = 0;
    const onResize = () => {
      if (done) place(end());
    };
    window.addEventListener('resize', onResize);

    if (reduce || typeof IntersectionObserver === 'undefined') {
      done = true;
      place(end());
      manta.style.opacity = '0.95';
      return () => window.removeEventListener('resize', onResize);
    }

    place(0);
    manta.style.opacity = '0';
    const card = sea.parentElement ?? sea;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting || done) return;
        done = true;
        io.disconnect();
        manta.style.transition = 'opacity 400ms';
        manta.style.opacity = '0.95';
        const start = performance.now();
        const from = 0.04;
        const to = end();
        const ease = (x: number) => 1 - Math.pow(1 - x, 3);
        const tick = (now: number) => {
          const k = Math.min(1, Math.max(0, (now - start) / DURATION));
          place(from + ease(k) * (to - from));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.45 },
    );
    io.observe(card);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [reduce]);

  return (
    <div className="final-sea" ref={seaRef} aria-hidden="true">
      <svg className="wave-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" focusable="false">
        <path className="wv wv2" d="M-20 380 C 160 360 220 300 360 290 S 600 220 720 160 S 900 70 1040 40" />
        <path
          ref={pathRef}
          className="wv"
          pathLength={1}
          d="M-20 400 C 150 390 230 330 370 318 S 610 250 730 186 S 910 96 1040 64"
        />
      </svg>
      <span ref={mantaRef} className="manta-fly">
        <Mark />
      </span>
    </div>
  );
}
