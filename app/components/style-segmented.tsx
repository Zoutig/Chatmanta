'use client';

// Inline segmented buttons voor tone/length, gebruikt in de Settings-tab.
// Geen popover — altijd uitgeklapt voor overzicht in een settings-context.

import {
  LENGTHS,
  TONES,
  type Length,
  type Tone,
} from '@/lib/v0/style-types';
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

export function StyleSegmented(props: Props) {
  if (props.kind === 'tone') {
    const labels = STYLE_LABELS.tone;
    return (
      <div className="settings-section">
        <div className="settings-label">Toon</div>
        <div className="threshold-presets" role="radiogroup" aria-label="Toon">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={props.value === t}
              className={`threshold-preset${props.value === t ? ' active' : ''}`}
              onClick={() => props.onChange(t)}
            >
              <span className="threshold-preset-label">{labels[t]}</span>
            </button>
          ))}
        </div>
        <div className="slider-hint">{STYLE_HINTS.tone}</div>
      </div>
    );
  }

  const labels = STYLE_LABELS.length;
  return (
    <div className="settings-section">
      <div className="settings-label">Lengte</div>
      <div className="threshold-presets" role="radiogroup" aria-label="Lengte">
        {LENGTHS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={props.value === l}
            className={`threshold-preset${props.value === l ? ' active' : ''}`}
            onClick={() => props.onChange(l)}
          >
            <span className="threshold-preset-label">{labels[l]}</span>
          </button>
        ))}
      </div>
      <div className="slider-hint">{STYLE_HINTS.length}</div>
    </div>
  );
}
