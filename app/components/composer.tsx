'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './svg-icons';

const MAX_CHARS = 1000;
const PRESETS: { value: number; label: string }[] = [
  { value: 0.3, label: 'Los' },
  { value: 0.4, label: 'Default' },
  { value: 0.6, label: 'Strikt' },
  { value: 0.8, label: 'Heel strikt' },
];

export function Composer({
  onSend,
  pending,
  threshold,
  onThresholdChange,
  rewriteOn,
  onToggleRewrite,
}: {
  onSend: (q: string) => void;
  pending: boolean;
  threshold: number;
  onThresholdChange: (v: number) => void;
  rewriteOn: boolean;
  onToggleRewrite: () => void;
}) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
  }, [value]);

  function submit() {
    const v = value.trim();
    if (!v || pending) return;
    onSend(v);
    setValue('');
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={taRef}
          rows={1}
          placeholder="Stel een vraag over de geïndexeerde documenten…"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKey}
          disabled={pending}
        />
        <div className="composer-actions">
          <button
            type="button"
            className={`composer-tool${rewriteOn ? ' on' : ''}`}
            onClick={onToggleRewrite}
            title="Smalltalk-detect, typo-correctie, synoniem-expansie (+1 LLM-call ≈ $0.0001)"
          >
            <Icon name="sparkle" size={12} /> Rewrite
          </button>
          <ThresholdPill threshold={threshold} onChange={onThresholdChange} />
          <span className="spacer" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-faint)' }}>
            {value.length}/{MAX_CHARS}
          </span>
          <button
            type="button"
            className="composer-send"
            disabled={!value.trim() || pending}
            onClick={submit}
            aria-label="Verstuur"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </div>
      <div className="composer-hint">
        <span className="kbd" style={{ marginRight: 4 }}>↵</span> verstuur
        <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
        <span className="kbd" style={{ marginRight: 4 }}>⇧↵</span> nieuwe regel
        <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
        antwoorden bevatten inline citaties{' '}
        <span className="cite" style={{ pointerEvents: 'none' }}>
          1
        </span>
      </div>
    </div>
  );
}

function ThresholdPill({
  threshold,
  onChange,
}: {
  threshold: number;
  onChange: (v: number) => void;
}) {
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

  const activePreset = PRESETS.find((p) => Math.abs(p.value - threshold) < 0.005);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`composer-tool${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Similarity-drempel — klik om aan te passen"
      >
        <Icon name="sliders" size={12} /> drempel {threshold.toFixed(2)}
      </button>
      {open ? (
        <div className="threshold-popover slide-in" role="dialog" aria-label="Similarity threshold">
          <div className="threshold-popover-head">
            <span className="threshold-popover-label">Similarity threshold</span>
            <span className="threshold-popover-value">{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => onChange(Number(e.target.value))}
            className="slider-input"
            aria-label="Similarity threshold"
          />
          <div className="threshold-presets">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`threshold-preset${activePreset?.value === p.value ? ' active' : ''}`}
                onClick={() => onChange(p.value)}
                title={`${p.label} · ${p.value.toFixed(2)}`}
              >
                <span className="threshold-preset-value">{p.value.toFixed(2)}</span>
                <span className="threshold-preset-label">{p.label}</span>
              </button>
            ))}
          </div>
          <p className="threshold-popover-hint">
            lager = lossere match · hoger = strikter
          </p>
        </div>
      ) : null}
    </div>
  );
}
