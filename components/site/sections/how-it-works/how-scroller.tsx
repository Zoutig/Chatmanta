'use client';

import { useInView, useReducedMotion } from 'motion/react';
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Mark } from '../../ui/logo';
import { cx } from '../../ui/cx';
import { Snippet } from './snippet';

/* Crawl-raster (mockup-final §5): 24 pagina-tegels in 4 kolommen, rechts de kennisbank. */
const N = 24;
const COLS = 4;
const TILES = Array.from({ length: N }, (_, i) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return { x: 3 + c * 14, y: 4 + r * 15.5 };
});
const URL_TXT = 'vandam-fietsen.nl';
/** Desktop-breekpunt waarop de sticky stage zichtbaar is (gelijk aan how-it-works.css). */
const STAGE_MIN_W = 900;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.5h5.5l3 3v10h-8.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function KbIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * "Hoe het werkt": stappenkolom (server-gerenderd, via children) + sticky stage.
 * - Actieve stap = de stap die het dichtst bij het midden van het scherm staat (≥900px).
 * - Stap 2 scrubt de crawl: scanlijn, gelezen tegels, teller, balk en kennisbank-vulling
 *   volgen de scrollpositie (ook terug).
 * - Reduced motion: geen typen/vliegende blokjes; scènes wisselen direct.
 * De stage is decoratief (aria-hidden); alle tekst staat in de stappenkolom.
 */
export function HowScroller({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const crawlRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState(-1);
  const [read, setRead] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [typed, setTyped] = useState<number | null>(null); // null = volledige URL
  const typedOnce = useRef(false);
  const stageInView = useInView(stageRef, { amount: 0.4 });

  const shown = Math.max(active, 0);

  const measure = useCallback(() => {
    const el = scanRef.current?.parentElement;
    if (!el) return;
    setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
  }, []);

  const onScroll = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || window.innerWidth < STAGE_MIN_W) return;
    const steps = Array.from(grid.querySelectorAll<HTMLElement>('[data-step]'));
    if (!steps.length) return;
    const mid = window.innerHeight / 2;
    let best = 0;
    let bd = Infinity;
    steps.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setActive(best);

    // scrub stap 2 (ook terug)
    const step2 = steps[1];
    const crawl = crawlRef.current;
    if (!step2 || !crawl) return;
    const r2 = step2.getBoundingClientRect();
    const p = clamp((window.innerHeight * 0.75 - r2.top) / (r2.height * 0.85), 0, 1);
    if (scanRef.current) scanRef.current.style.transform = `translateY(${p * crawl.offsetHeight * 0.95}px)`;
    const scanY = p * 95;
    setRead(TILES.reduce((n, t) => (scanY > t.y + 6 ? n + 1 : n), 0));
  }, []);

  // scroll/resize (rAF-gethrottled)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        onScroll();
      });
    };
    const resize = () => {
      measure();
      tick();
    };
    measure();
    onScroll();
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('scroll', tick);
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onScroll, measure]);

  // Scène 1: URL intypen, één keer, zodra de stage in beeld is op stap 1.
  useEffect(() => {
    if (reduce || typedOnce.current || !stageInView || shown !== 0) return;
    typedOnce.current = true;
    let cancelled = false;
    (async () => {
      for (let i = 0; i <= URL_TXT.length; i++) {
        if (cancelled) return;
        setTyped(i);
        await sleep(55);
      }
      await sleep(600);
      if (!cancelled) setTyped(null);
    })();
    return () => {
      cancelled = true;
      setTyped(null);
    };
  }, [reduce, stageInView, shown]);

  const ratio = read / N;

  return (
    <div className="how-grid" ref={gridRef} data-active={active >= 0 ? active : undefined}>
      {children}

      <div className="stage-col" aria-hidden="true">
        <div className="stage" ref={stageRef}>
          <div className="stage-bar">
            <i />
            <i />
            <i />
            <div className="steps">
              {[0, 1, 2].map((k) => (
                <span key={k} className={cx(k <= shown && 'on')} />
              ))}
            </div>
          </div>

          {/* scène 1 */}
          <div className={cx('scene', shown === 0 && 'on')}>
            <div className="scene-cap label">Jouw website</div>
            <div className="urlbox">
              <span className="pre">https://</span>
              <span className="val">
                {typed === null ? (
                  URL_TXT
                ) : (
                  <>
                    {URL_TXT.slice(0, typed)}
                    <span className="caret" />
                  </>
                )}
              </span>
              <span className="go">Lezen</span>
            </div>
            <div className="s1-docs">
              <div className="doc">
                <DocIcon />
                Prijslijst.pdf
              </div>
              <div className="doc">
                <DocIcon />
                Voorwaarden.pdf
              </div>
              <div className="doc">
                <DocIcon />
                Handleiding.docx
              </div>
            </div>
            <p className="s1-note">Documenten zijn optioneel. Je website is genoeg om te beginnen.</p>
          </div>

          {/* scène 2 */}
          <div className={cx('scene', shown === 1 && 'on')}>
            <div className="scene-cap label">Pagina&apos;s lezen en ordenen</div>
            <div className="crawl" ref={crawlRef}>
              <div className="scan" ref={scanRef} />
              <div className="kb">
                <div className="fill" style={{ transform: `scaleY(${ratio})` }} />
                <KbIcon />
                <b>Kennisbank</b>
              </div>
              {TILES.map((t, i) => {
                const isRead = i < read;
                const bx = t.x + 3.5;
                const by = t.y + 4;
                const tx = 81;
                const ty = 30 + (i % 6) * 8;
                const blkStyle = {
                  left: `${bx}%`,
                  top: `${by}%`,
                  '--dx': `${((tx - bx) * size.w) / 100}px`,
                  '--dy': `${((ty - by) * size.h) / 100}px`,
                } as CSSProperties;
                return (
                  <Fragment key={i}>
                    <span className={cx('tile', isRead && 'read')} style={{ left: `${t.x}%`, top: `${t.y}%` }} />
                    <span className={cx('blk', isRead && !reduce && 'sent')} style={blkStyle} />
                  </Fragment>
                );
              })}
            </div>
            <div className="crawl-count">
              <span>
                <span className="num">{read}</span> pagina&apos;s gelezen
              </span>
              <span className="bar">
                <i style={{ transform: `scaleX(${ratio})` }} />
              </span>
            </div>
          </div>

          {/* scène 3 */}
          <div className={cx('scene', shown === 2 && 'on')}>
            <div className="scene-cap label">Plakken en live</div>
            <Snippet broken lit={shown === 2} />
            <div className="minisite">
              <div className="hdr">
                <i />
                Fietsenmaker Van Dam
              </div>
              <div className="ln w55" />
              <div className="ln w72" />
              <div className="ln w40" />
              <div className="wmsg">Vraag het mij!</div>
              <div className="wbub">
                <Mark />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
