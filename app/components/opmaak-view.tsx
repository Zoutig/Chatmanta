'use client';

import { useTheme, type ThemeChoice } from '@/lib/v0/hooks/use-theme';
import { useStyleMode, type StyleMode } from '@/lib/v0/hooks/use-style-mode';
import { useAccent, ACCENT_OPTIONS } from '@/lib/v0/hooks/use-accent';

const STYLE_MODES: readonly StyleMode[] = ['classic', 'glass', 'manta'];
const STYLE_LABELS: Record<StyleMode, string> = {
  classic: 'Klassiek',
  glass: 'Glass',
  manta: 'Manta',
};
const STYLE_HINT =
  'Manta = nieuwe opmaak met aurora-achtergrond en animaties. Klassiek + Glass = oude varianten.';

const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'Licht',
  dark: 'Donker',
  system: 'Systeem',
};

export function OpmaakView() {
  const { mode: styleMode, set: setStyleMode } = useStyleMode();
  const { accent, set: setAccent } = useAccent();
  const { choice: themeChoice, set: setTheme } = useTheme();

  return (
    <div>
      <div className="settings-section">
        <div className="settings-label">Opmaak</div>
        <div className="threshold-presets" role="radiogroup" aria-label="Opmaak">
          {STYLE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={styleMode === m}
              className={`threshold-preset${styleMode === m ? ' active' : ''}`}
              onClick={() => setStyleMode(m)}
            >
              <span className="threshold-preset-label">{STYLE_LABELS[m]}</span>
            </button>
          ))}
        </div>
        <div className="slider-hint" style={{ marginTop: 8 }}>
          {STYLE_HINT}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Modus</div>
        <div className="threshold-presets" role="radiogroup" aria-label="Modus">
          {THEME_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={themeChoice === c}
              className={`threshold-preset${themeChoice === c ? ' active' : ''}`}
              onClick={() => setTheme(c)}
            >
              <span className="threshold-preset-label">{THEME_LABELS[c]}</span>
            </button>
          ))}
        </div>
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
