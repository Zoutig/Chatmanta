'use client';

// Pill+popover voor tone of length, gebruikt in de composer.
// Volgt het visuele pattern van ThresholdPill in composer.tsx.

import { useEffect, useRef, useState } from 'react';
import { Icon } from './svg-icons';
import {
  LENGTHS,
  TONES,
  type Length,
  type Tone,
} from '@/lib/rag/style-types';
import { STYLE_HINTS, STYLE_LABELS } from './style-labels';

type Props =
  | {
      kind: 'tone';
      value: Tone;
      onChange: (v: Tone) => void;
    }
  | {
      kind: 'length';
      value: Length;
      onChange: (v: Length) => void;
    };

export function StylePill(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Splits in twee branches zodat TypeScript de waarde correct narrowt.
  if (props.kind === 'tone') {
    const labels = STYLE_LABELS.tone;
    return (
      <PillShell
        title="Toon"
        triggerLabel={`toon: ${labels[props.value]}`}
        currentLabel={labels[props.value]}
        iconName="sparkle"
        hint={STYLE_HINTS.tone}
        open={open}
        setOpen={setOpen}
        innerRef={ref}
      >
        {TONES.map((t) => (
          <button
            key={t}
            type="button"
            className={`threshold-preset${props.value === t ? ' active' : ''}`}
            onClick={() => {
              props.onChange(t);
              setOpen(false);
            }}
            title={labels[t]}
          >
            <span className="threshold-preset-label">{labels[t]}</span>
          </button>
        ))}
      </PillShell>
    );
  }

  const labels = STYLE_LABELS.length;
  return (
    <PillShell
      title="Lengte"
      triggerLabel={`lengte: ${labels[props.value]}`}
      currentLabel={labels[props.value]}
      iconName="sliders"
      hint={STYLE_HINTS.length}
      open={open}
      setOpen={setOpen}
      innerRef={ref}
    >
      {LENGTHS.map((l) => (
        <button
          key={l}
          type="button"
          className={`threshold-preset${props.value === l ? ' active' : ''}`}
          onClick={() => {
            props.onChange(l);
            setOpen(false);
          }}
          title={labels[l]}
        >
          <span className="threshold-preset-label">{labels[l]}</span>
        </button>
      ))}
    </PillShell>
  );
}

function PillShell({
  title,
  triggerLabel,
  currentLabel,
  iconName,
  hint,
  open,
  setOpen,
  innerRef,
  children,
}: {
  title: string;
  triggerLabel: string;
  currentLabel: string;
  iconName: 'sparkle' | 'sliders';
  hint: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div ref={innerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`composer-tool${open ? ' on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title} — ${currentLabel}`}
        title={`${title} — klik om aan te passen`}
      >
        <Icon name={iconName} size={12} /> {triggerLabel}
      </button>
      {open ? (
        <div className="threshold-popover slide-in" role="dialog" aria-label={title}>
          <div className="threshold-popover-head">
            <span className="threshold-popover-label">{title}</span>
            <span className="threshold-popover-value">{currentLabel}</span>
          </div>
          <div className="threshold-presets" style={{ marginTop: 8 }}>
            {children}
          </div>
          <p className="threshold-popover-hint">{hint}</p>
        </div>
      ) : null}
    </div>
  );
}
