'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Icon } from '../svg-icons';
import { Button as Button1 } from '../ui/button-1';
import type { Length, Tone } from '@/lib/v0/style-types';

const MAX_CHARS = 1000;
const PRESETS: { value: number; label: string }[] = [
  { value: 0.3, label: 'Los' },
  { value: 0.4, label: 'Default' },
  { value: 0.6, label: 'Strikt' },
  { value: 0.8, label: 'Heel strikt' },
];

export function MantaComposer({
  onSend,
  pending,
  threshold,
  onThresholdChange,
  tone,
  onToneChange,
  length,
  onLengthChange,
  botName = 'Manta',
}: {
  onSend: (q: string) => void;
  pending: boolean;
  threshold: number;
  onThresholdChange: (v: number) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
  length: Length;
  onLengthChange: (l: Length) => void;
  botName?: string;
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
    if (pending) return;
    if (!v) {
      // Bij lege input: focus de textarea ipv de Verstuur-knop disabled tonen
      // (verwarrend voor user, cursor leest als 'verboden').
      taRef.current?.focus();
      return;
    }
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
    <div className="manta-composer-wrap">
      <div className="manta-composer-glow" aria-hidden="true" />
      <div className="manta-composer">
        <div className="manta-composer-input-row">
          <textarea
            ref={taRef}
            rows={1}
            className="manta-composer-textarea"
            placeholder={`Stel een vervolgvraag aan ${botName}…`}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={onKey}
            disabled={pending}
            aria-label="Bericht"
          />
          <Button1
            type="manta"
            size="large"
            shape="square"
            svgOnly
            data-manta-send
            disabled={pending}
            loading={pending}
            onClick={submit}
            aria-label="Verstuur"
            title="Verstuur (↵)"
            className="relative overflow-hidden group/send shrink-0"
          >
            <ArrowUp
              className="manta-send-arrow"
              size={20}
              strokeWidth={2.4}
              aria-hidden="true"
            />
          </Button1>
        </div>

        <div className="manta-composer-actions">
          <MantaThresholdPill threshold={threshold} onChange={onThresholdChange} />
          <ToneLengthPill kind="tone" value={tone} onChange={onToneChange} />
          <ToneLengthPill kind="length" value={length} onChange={onLengthChange} />
        </div>
      </div>
      <div className="manta-composer-hint">
        ChatManta antwoordt uitsluitend op basis van geïndexeerde bronnen
      </div>
    </div>
  );
}

function MantaThresholdPill({
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
        className={`manta-glass-btn manta-glass-tinted${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Similarity-drempel — klik om aan te passen"
      >
        <Icon name="sliders" size={12} />
        <span>drempel {threshold.toFixed(2)}</span>
      </button>
      {open ? (
        <div className="manta-threshold-popover" role="dialog" aria-label="Similarity threshold">
          <div className="manta-threshold-popover-head">
            <span className="manta-threshold-popover-label">Similarity threshold</span>
            <span className="manta-threshold-popover-value">{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => onChange(Number(e.target.value))}
            className="manta-threshold-slider"
            aria-label="Similarity threshold"
          />
          <div className="manta-threshold-presets">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`manta-threshold-preset${activePreset?.value === p.value ? ' active' : ''}`}
                onClick={() => onChange(p.value)}
                title={`${p.label} · ${p.value.toFixed(2)}`}
              >
                <span className="manta-threshold-preset-value">{p.value.toFixed(2)}</span>
                <span className="manta-threshold-preset-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'formal', label: 'Formeel' },
  { value: 'neutral', label: 'Neutraal' },
  { value: 'casual', label: 'Casual' },
];

const LENGTH_OPTIONS: { value: Length; label: string }[] = [
  { value: 'short', label: 'Kort' },
  { value: 'medium', label: 'Medium' },
  { value: 'detailed', label: 'Uitgebreid' },
];

function ToneLengthPill<T extends Tone | Length>({
  kind,
  value,
  onChange,
}: {
  kind: 'tone' | 'length';
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = kind === 'tone' ? TONE_OPTIONS : LENGTH_OPTIONS;
  const current = options.find((o) => o.value === value) ?? options[1];

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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`manta-glass-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={kind === 'tone' ? 'Toon van het antwoord' : 'Lengte van het antwoord'}
      >
        <span style={{ opacity: 0.7 }}>{kind === 'tone' ? 'Toon' : 'Lengte'}:</span>
        <span style={{ fontWeight: 600 }}>{current.label}</span>
      </button>
      {open ? (
        <div className="manta-pill-popover" role="listbox">
          {(options as { value: T; label: string }[]).map((o) => (
            <button
              key={o.value as string}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`manta-pill-option${o.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
