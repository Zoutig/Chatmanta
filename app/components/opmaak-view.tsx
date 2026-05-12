'use client';

import { useTheme, type ThemeChoice } from '@/lib/v0/hooks/use-theme';
import { useStyleMode, type StyleMode } from '@/lib/v0/hooks/use-style-mode';
import { useAccent, ACCENT_OPTIONS } from '@/lib/v0/hooks/use-accent';
import { SegmentedRadio } from './ui/segmented-radio';

const STYLE_OPTIONS: ReadonlyArray<{ value: StyleMode; label: string }> = [
  { value: 'classic', label: 'Klassiek' },
  { value: 'manta', label: 'Manta' },
];

const STYLE_HINT =
  'Manta = nieuwe opmaak met aurora-achtergrond en animaties. Klassiek = oude variant.';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
  { value: 'system', label: 'Systeem' },
];

export function OpmaakView() {
  const { mode: styleMode, set: setStyleMode } = useStyleMode();
  const { accent, set: setAccent } = useAccent();
  const { choice: themeChoice, set: setTheme } = useTheme();

  return (
    <div>
      <div className="settings-section">
        <div className="settings-label">Opmaak</div>
        <SegmentedRadio
          label="Opmaak"
          value={styleMode}
          options={STYLE_OPTIONS}
          onChange={setStyleMode}
        />
        <div className="slider-hint" style={{ marginTop: 8 }}>
          {STYLE_HINT}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Modus</div>
        <SegmentedRadio
          label="Modus"
          value={themeChoice}
          options={THEME_OPTIONS}
          onChange={setTheme}
        />
        <div className="slider-hint" style={{ marginTop: 8 }}>
          Light is default. Donker zet de hele interface in dark mode. Systeem volgt je OS-voorkeur.
        </div>
      </div>

      {styleMode === 'manta' ? (
        <div className="settings-section">
          <div className="settings-label">Accent-kleur</div>
          <div className="manta-accent-picker" role="radiogroup" aria-label="Accent-kleur">
            {ACCENT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={accent === o.value}
                aria-label={o.label}
                title={o.label}
                className={`manta-accent-swatch${accent === o.value ? ' active' : ''}`}
                style={{ background: o.value }}
                onClick={() => setAccent(o.value)}
              />
            ))}
          </div>
          <div className="slider-hint" style={{ marginTop: 8 }}>
            Vier teal-varianten. Common Teal is de default. Past mee in chat-bubbels, knoppen en log-tijden.
          </div>
        </div>
      ) : null}
    </div>
  );
}
