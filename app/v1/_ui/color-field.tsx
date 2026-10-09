'use client';

// Kleurkiezer: vaste swatches, een eigen kleur via de systeemkiezer en een
// hexveld. Geeft alleen geldige #rrggbb (kleine letters) door via onChange.

import { useId, useState } from 'react';
import { COLOR_PRESETS } from '@/lib/widget/color-presets';

const SWATCHES = ['#0c1e2e', ...COLOR_PRESETS];

function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // Externe wijziging (bv. annuleren) → hexveld volgt.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
    setError(null);
  }

  const pick = (hex: string) => {
    setText(hex);
    setError(null);
    onChange(hex);
  };
  const commit = () => {
    const hex = normalizeHex(text);
    if (!hex) {
      setError('Gebruik een kleurcode als #0C1E2E.');
      return;
    }
    // Zelfde kleur (bv. alleen hoofdletters anders): geen wijziging melden,
    // anders wordt een formulier "gewijzigd" door alleen het veld te verlaten.
    if (hex === value.toLowerCase()) {
      setText(value);
      return;
    }
    pick(hex);
  };

  return (
    <div className="v1-field">
      <span className="v1-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="v1-color-swatches" role="radiogroup" aria-labelledby={`${id}-label`}>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.toLowerCase()}
            aria-label={c}
            className="v1-color-swatch"
            style={{ background: c }}
            disabled={disabled}
            onClick={() => pick(c)}
          />
        ))}
        <label className="v1-color-swatch v1-color-swatch--custom" title="Eigen kleur kiezen">
          <span className="v1-sr-only">Eigen kleur kiezen</span>
          <input
            type="color"
            disabled={disabled}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#0c1e2e'}
            onChange={(e) => pick(e.target.value.toLowerCase())}
          />
        </label>
      </div>
      <input
        className="v1-input v1-color-hex"
        value={text}
        disabled={disabled}
        aria-label={`${label}: kleurcode`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      {error ? <p className="v1-hint v1-color-error">{error}</p> : null}
    </div>
  );
}
