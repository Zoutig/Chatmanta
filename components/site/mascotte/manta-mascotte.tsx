'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../ui/motion-hooks';
import { MASCOTTE_EVENT, type MascotteSignal } from './bus';
import { MantaEngine, type MantaMode } from './manta-engine';
import './manta-mascotte.css';

const BODY_SRC = '/site/mascotte/manta-body.png';
const FACE_SRC = '/site/mascotte/manta-face.png';
// Kop-positie als fractie van het canvas (bronvlak 830,400 binnen 1536×1024, met FIT 0.92).
const HEAD_X = 0.5 + (830 / 1536 - 0.5) * 0.92;
const HEAD_Y = 0.5 + (400 / 1024 - 0.5) * 0.92;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * De geanimeerde ChatManta-mascotte (decoratief, `aria-hidden`). Laadt pas na hydratie,
 * pauzeert buiten beeld en bij een verborgen tabblad, en staat stil bij reduced motion.
 * Volgt de muis, knippert, en reageert op signalen via `signalMascotte()` (./bus).
 */
export function MantaMascotte({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let engine: MantaEngine | null = null;
    let raf = 0;
    let visible = false;
    let alive = true;
    let restoreTimer = 0;
    const now = () => performance.now() / 1000;
    const cleanups: Array<() => void> = [];

    const loop = () => {
      raf = 0;
      if (!engine || !alive) return;
      engine.frame(now(), reduce);
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf && alive) raf = requestAnimationFrame(loop);
    };

    (async () => {
      let body: HTMLImageElement, face: HTMLImageElement;
      try {
        [body, face] = await Promise.all([loadImage(BODY_SRC), loadImage(FACE_SRC)]);
      } catch {
        return; // geen mascotte is beter dan een kapotte
      }
      if (!alive) return;
      engine = new MantaEngine(canvas, body, face);
      const resize = () => {
        engine?.resize(wrap.clientWidth, window.devicePixelRatio || 1);
        kick();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      cleanups.push(() => ro.disconnect());

      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        kick();
      });
      io.observe(wrap);
      cleanups.push(() => io.disconnect());
      const onVis = () => kick();
      document.addEventListener('visibilitychange', onVis);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

      // Kijkrichting t.o.v. de kop, genormaliseerd op ~60% van de mascottebreedte.
      const toLocal = (cx: number, cy: number) => {
        const r = canvas.getBoundingClientRect();
        const s = Math.max(180, r.width * 0.6);
        return [(cx - (r.left + r.width * HEAD_X)) / s, (cy - (r.top + r.height * HEAD_Y)) / s] as const;
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const [x, y] = toLocal(e.clientX, e.clientY);
        engine?.setPointer(x, y, now());
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      cleanups.push(() => window.removeEventListener('pointermove', onMove));

      const onSignal = (ev: Event) => {
        const d = (ev as CustomEvent<MascotteSignal>).detail;
        if (!engine) return;
        if (d.talk !== undefined) engine.setTalking(d.talk);
        if (d.mode !== undefined) engine.setMode(d.mode ?? 'idle');
        if (d.lookAt) {
          const r = d.lookAt.getBoundingClientRect();
          const [x, y] = toLocal(r.left + r.width / 2, r.top + r.height / 2);
          engine.lookAt(x, y, now(), d.lookMs);
        }
        kick();
      };
      window.addEventListener(MASCOTTE_EVENT, onSignal);
      cleanups.push(() => window.removeEventListener(MASCOTTE_EVENT, onSignal));

      const onClick = () => {
        if (!engine || reduce) return;
        engine.setMode('happy');
        engine.wink(now());
        window.clearTimeout(restoreTimer);
        restoreTimer = window.setTimeout(() => engine?.setMode('idle'), 1800);
      };
      canvas.addEventListener('click', onClick);
      cleanups.push(() => canvas.removeEventListener('click', onClick));

      engine.frame(now(), reduce);
      setReady(true);
      kick();
    })();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(restoreTimer);
      cleanups.forEach((fn) => fn());
      engine?.destroy();
      engine = null;
    };
  }, [reduce]);

  return (
    <div ref={wrapRef} className={`manta-mascotte${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

export type { MantaMode };
