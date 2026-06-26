'use client';

// Inline segmented buttons voor tone/length, gebruikt in de Settings-tab.
// Geen popover — altijd uitgeklapt voor overzicht in een settings-context.

import {
  LENGTHS,
  TONES,
  type Length,
  type Tone,
} from '@/lib/rag/style-types';
import { STYLE_HINTS, STYLE_LABELS } from './style-labels';
import { SegmentedRadio } from './ui/segmented-radio';

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
    const options = TONES.map((t) => ({ value: t, label: labels[t] }));
    return (
      <div className="settings-section">
        <div className="settings-label">Toon</div>
        <SegmentedRadio
          label="Toon"
          value={props.value}
          options={options}
          onChange={props.onChange}
        />
        <div className="slider-hint">{STYLE_HINTS.tone}</div>
      </div>
    );
  }

  const labels = STYLE_LABELS.length;
  const options = LENGTHS.map((l) => ({ value: l, label: labels[l] }));
  return (
    <div className="settings-section">
      <div className="settings-label">Lengte</div>
      <SegmentedRadio
        label="Lengte"
        value={props.value}
        options={options}
        onChange={props.onChange}
      />
      <div className="slider-hint">{STYLE_HINTS.length}</div>
    </div>
  );
}
