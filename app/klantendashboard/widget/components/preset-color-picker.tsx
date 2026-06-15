'use client';

import { Check, Pipette } from 'lucide-react';
import { useId, useRef } from 'react';
import { COLOR_PRESETS, isPreset } from '@/lib/widget/color-presets';

// Compacte kleurkiezer: een nette rij kleine ronde swatches (de presets) + een
// hex-veld + een native color-picker-trigger. Vervangt de oude grote
// kleurtegels ("lelijke grote kleurtegels"). De publieke props blijven
// ongewijzigd (label/hint/value/onChange/disabled) zodat de 4 call-sites in
// widget-form.tsx ongewijzigd blijven werken.
//
// Granulaire-fallback-semantiek blijft intact: `value` is altijd de
// geresolveerde kleur (caller resolved logoColor || primaryColor etc.). Is die
// waarde geen preset, dan toont het hex-veld 'm gewoon en krijgt geen enkele
// swatch een ring — de eigen kleur is dus niet "weg".

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
  const norm = value.toLowerCase();
  const isCustom = !isPreset(value);
  // Verborgen native <input type="color"> dat we via de pipet-knop openen, zodat
  // de trigger zelf strak in de swatch-rij past (de native swatch is lelijk).
  const colorInputRef = useRef<HTMLInputElement>(null);
  const hexInputId = useId();

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
      {/* Label + hint op één regel. */}
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

      {/* Swatch-rij — kleine ronde presets + pipet-trigger + hex-veld op één
          flowende regel. */}
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 7,
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
              title={hex}
              onClick={() => onChange(hex)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: hex,
                // Ring rond de geselecteerde swatch — dunne witte gap + accent-ring
                // zodat het ook werkt bij donkere presets.
                border: selected
                  ? '2px solid var(--klant-bg)'
                  : '1px solid var(--klant-border-strong)',
                boxShadow: selected
                  ? '0 0 0 2px var(--klant-accent)'
                  : 'none',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                outline: 'none',
              }}
            >
              {selected && (
                <Check
                  size={12}
                  strokeWidth={3}
                  style={{ color: '#fff', mixBlendMode: 'difference' }}
                />
              )}
            </button>
          );
        })}

        {/* Pipet-trigger — opent de native color-picker. Toont een ring als de
            huidige waarde géén preset is (= een eigen kleur is gekozen). */}
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          aria-label={`Eigen kleur kiezen voor ${label}`}
          title="Eigen kleur"
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            // Eigen kleur → toon die kleur; anders een neutrale "kies"-tegel.
            background: isCustom ? value : 'var(--klant-surface-muted)',
            border: isCustom
              ? '2px solid var(--klant-bg)'
              : '1px dashed var(--klant-border-strong)',
            boxShadow: isCustom ? '0 0 0 2px var(--klant-accent)' : 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            outline: 'none',
          }}
        >
          <Pipette
            size={12}
            strokeWidth={2}
            style={{
              color: isCustom ? '#fff' : 'var(--klant-fg-muted)',
              mixBlendMode: isCustom ? 'difference' : 'normal',
            }}
          />
        </button>

        {/* Verborgen native color-input — gekoppeld aan de pipet-trigger. */}
        <input
          ref={colorInputRef}
          type="color"
          value={normalizeForColorInput(value)}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            // Niet display:none — Safari opent dan de picker niet via .click().
            // Onzichtbaar wegduwen, maar in de DOM houden.
            position: 'absolute',
            width: 0,
            height: 0,
            padding: 0,
            border: 'none',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />

        {/* Hex-veld — vrije invoer naast de swatches; smal en mono. */}
        <input
          id={hexInputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Hex-kleurcode voor ${label}`}
          spellCheck={false}
          className="klant-input"
          style={{
            width: 92,
            fontFamily: 'var(--font-mono), monospace',
            fontSize: 12,
            padding: '5px 8px',
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

/**
 * `<input type="color">` accepteert alleen een geldige 6-cijferige hex. Een
 * half-getypte of ongeldige waarde (bv. tijdens vrije hex-invoer) zou de native
 * picker laten terugvallen op #000000 en dan z'n value clampen. We geven 'm
 * daarom een veilige fallback zodat de trigger-kleur niet wegspringt; de echte
 * waarde blijft in het hex-veld staan.
 */
function normalizeForColorInput(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}
