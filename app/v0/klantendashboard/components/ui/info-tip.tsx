'use client';

// Klein herbruikbaar info-icoon met uitleg-bubbel. Werkt op hover (desktop),
// klik (touch) én toetsenbord (focus) — bewust géén kale title-attr, die faalt
// op mobiel en is niet toegankelijk. Bedoeld naast metric-labels en andere
// overzicht-kaarten waar een korte uitleg helpt.

import { useState } from 'react';
import { Info } from 'lucide-react';

export function InfoTip({ text, label = 'Uitleg' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const show = open || hover;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={show}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onBlur={() => setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          padding: 2,
          margin: 0,
          cursor: 'pointer',
          color: 'var(--klant-dim)',
          lineHeight: 0,
        }}
      >
        <Info size={13} strokeWidth={2} />
      </button>
      {show && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 240,
            maxWidth: '70vw',
            padding: '8px 10px',
            background: 'var(--klant-ink)',
            color: 'var(--klant-surface)',
            borderRadius: 'var(--klant-r-sm)',
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.45,
            letterSpacing: 0,
            textTransform: 'none',
            boxShadow: 'var(--klant-shadow)',
            zIndex: 20,
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
