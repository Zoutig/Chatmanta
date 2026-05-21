'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { COLOR_PRESETS, isPreset } from '@/lib/widget/color-presets';

export function PresetColorPicker({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // Open "Meer kleuren" direct als de huidige waarde geen preset is, zodat
  // de bezoeker niet denkt "mijn kleur is weg".
  const [expanded, setExpanded] = useState(() => !isPreset(value));
  const norm = value.toLowerCase();

  return (
    <div
      style={{
        padding: 10,
        background: 'var(--klant-surface)',
        borderRadius: 'var(--klant-r-md)',
        border: '1px solid var(--klant-border)',
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--klant-fg)' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>{hint}</span>
      </div>

      {/* 3×3 swatch-grid */}
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 6,
        }}
      >
        {COLOR_PRESETS.map((hex) => {
          const selected = hex.toLowerCase() === norm;
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={hex}
              onClick={() => onChange(hex)}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 8,
                background: hex,
                border: selected
                  ? '2px solid var(--klant-accent)'
                  : '1px solid var(--klant-border)',
                cursor: 'pointer',
                padding: 0,
                position: 'relative',
                outline: 'none',
                boxShadow: selected ? '0 0 0 2px var(--klant-bg)' : 'none',
              }}
            >
              {selected && (
                <Check
                  size={12}
                  strokeWidth={3}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: 'auto',
                    color: '#fff',
                    mixBlendMode: 'difference',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 10,
          background: 'transparent',
          border: 'none',
          color: 'var(--klant-fg-muted)',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'inherit',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Meer kleuren
      </button>

      {expanded && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 34,
              height: 30,
              border: '1px solid var(--klant-border)',
              borderRadius: 'var(--klant-r-sm)',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="klant-input"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 12,
              padding: '6px 8px',
            }}
          />
        </div>
      )}
    </div>
  );
}
