'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, type Transition } from 'motion/react';
import { useTheme } from '@/lib/v0/hooks/use-theme';

/**
 * Animated Theme Toggler — sun↔moon morph met spring physics + soft click.
 *
 * Aangepast voor ChatManta: gebruikt onze bestaande `useTheme()`-hook in
 * plaats van direct `document.documentElement.classList.toggle('dark')`, zodat
 * de keuze in `localStorage['chatmanta-theme']` belandt en bij refresh wordt
 * onthouden.
 *
 * Component source: 21st.dev — animated-theme-toggler (geïntegreerd door
 * Sebastiaan, mei 2026).
 */

export interface AnimatedThemeTogglerProps {
  sound?: boolean;
}

// ── Audio (subtle switch-click) ──────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _buf: AudioBuffer | null = null;

function audioCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') void _ctx.resume();
  return _ctx;
}

function ensureBuf(ac: AudioContext): AudioBuffer {
  if (_buf && _buf.sampleRate === ac.sampleRate) return _buf;
  const rate = ac.sampleRate;
  const len = Math.floor(rate * 0.006);
  const buf = ac.createBuffer(1, len, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const sine = Math.sin(2 * Math.PI * 3400 * t);
    const noise = Math.random() * 2 - 1;
    ch[i] = (sine * 0.6 + noise * 0.4) * (1 - t) ** 3;
  }
  _buf = buf;
  return buf;
}

function tick(last: React.MutableRefObject<number>) {
  const now = performance.now();
  if (now - last.current < 80) return;
  last.current = now;
  try {
    const ac = audioCtx();
    const buf = ensureBuf(ac);
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    gain.gain.value = 0.08;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
  } catch {
    /* silent */
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function AnimatedThemeToggler({ sound = true }: AnimatedThemeTogglerProps = {}) {
  const rawId = useId();
  const maskId = `att${rawId.replace(/:/g, '')}`;
  const lastSnd = useRef(0);
  // `isFirst` via state ipv ref: React 19 strict-mode mag refs niet tijdens
  // render lezen, en we hebben de waarde nodig voor de inline spring-transition.
  // Eerste render → duration:0 (geen animatie bij mount). Daarna spring.
  const [hasMounted, setHasMounted] = useState(false);

  const { resolved, set } = useTheme();
  const isDark = resolved === 'dark';

  /* eslint-disable react-hooks/set-state-in-effect -- bewust: na mount één state-flip om de eerste animatie te skippen, zoals het originele 21st.dev-component. */
  useEffect(() => {
    requestAnimationFrame(() => {
      setHasMounted(true);
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggle = () => {
    set(isDark ? 'light' : 'dark');
    if (sound) tick(lastSnd);
  };

  const spring: Transition = hasMounted
    ? { type: 'spring', stiffness: 380, damping: 30 }
    : { duration: 0 };

  return (
    <>
      <style>{`
        .att-btn{--at-ink:rgba(0,0,0,0.82)}
        .dark .att-btn,[data-theme="dark"] .att-btn{--at-ink:rgba(255,255,255,0.82)}
      `}</style>
      <motion.button
        type="button"
        className="att-btn"
        onClick={toggle}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.86 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--at-ink)',
          borderRadius: 8,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label={isDark ? 'Switch naar light mode' : 'Switch naar dark mode'}
        title={isDark ? 'Switch naar light mode' : 'Switch naar dark mode'}
      >
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={false}
          animate={{ rotate: isDark ? 270 : 0 }}
          transition={spring}
          style={{ overflow: 'visible' }}
        >
          {/* Mask carves the crescent from the center circle */}
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.circle
              initial={false}
              animate={{ cx: isDark ? 17 : 33, cy: isDark ? 8 : 0 }}
              transition={spring}
              r="9"
              fill="black"
            />
          </mask>

          {/* Center body — small sun circle or large crescent moon */}
          <motion.circle
            cx="12"
            cy="12"
            fill="currentColor"
            stroke="none"
            mask={`url(#${maskId})`}
            initial={false}
            animate={{ r: isDark ? 9 : 5 }}
            transition={spring}
          />

          {/* Rays — shrink and rotate when dark */}
          <motion.g
            initial={false}
            animate={{
              opacity: isDark ? 0 : 1,
              scale: isDark ? 0 : 1,
              rotate: isDark ? -30 : 0,
            }}
            transition={spring}
            style={{ transformOrigin: '12px 12px' }}
          >
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="5.64" y1="5.64" x2="4.22" y2="4.22" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            <line x1="5.64" y1="18.36" x2="4.22" y2="19.78" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          </motion.g>
        </motion.svg>
      </motion.button>
    </>
  );
}

export default AnimatedThemeToggler;
