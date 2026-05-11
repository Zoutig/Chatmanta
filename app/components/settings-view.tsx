'use client';

import { useRouter } from 'next/navigation';
import { Icon } from './svg-icons';
import type { BotMeta } from './bot-dropdown';
import { StyleSegmented } from './style-segmented';
import type { Length, Tone } from '@/lib/v0/style-types';
import type { HydeMode } from './use-hyde-mode';
import { useStyleMode, type StyleMode } from '@/lib/v0/hooks/use-style-mode';

const HYDE_MODES: readonly HydeMode[] = ['auto', 'off', 'upfront', 'selective'];
const HYDE_LABELS: Record<HydeMode, string> = {
  auto: 'Auto',
  off: 'Geen',
  upfront: 'Upfront',
  selective: 'Selective',
};
const HYDE_HINT =
  'Auto = volg bot-versie. Override wint altijd, ook over bots waar HyDE uit staat. Wordt per query gelogd voor evaluatie.';

const STYLE_MODES: readonly StyleMode[] = ['classic', 'refined'];
const STYLE_LABELS: Record<StyleMode, string> = {
  classic: 'Klassiek',
  refined: 'Refined',
};
const STYLE_HINT =
  'Klassiek = huidige opmaak. Refined = de nieuwe rustigere stijl. Wissel om beide te ervaren tijdens de A/B-test.';

export function SettingsView({
  threshold,
  onThreshold,
  tone,
  onToneChange,
  length,
  onLengthChange,
  hydeMode,
  onHydeModeChange,
  rewriteOn,
  onToggleRewrite,
  botVersion,
  bots,
  botFlags,
}: {
  threshold: number;
  onThreshold: (v: number) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
  length: Length;
  onLengthChange: (l: Length) => void;
  hydeMode: HydeMode;
  onHydeModeChange: (m: HydeMode) => void;
  rewriteOn: boolean;
  onToggleRewrite: () => void;
  botVersion: string;
  bots: BotMeta[];
  botFlags: {
    cacheEnabled: boolean;
    selfReflect: boolean;
    cascadeOnLowConfidence: boolean;
    cascadeModel: string;
  };
}) {
  const router = useRouter();
  const current = bots.find((b) => b.version === botVersion);
  const { mode: styleMode, set: setStyleMode } = useStyleMode();

  return (
    <div>
      <div className="settings-section">
        <div className="settings-label">Opmaak (A/B-test)</div>
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
        <div className="slider-hint" style={{ marginTop: 8 }}>{STYLE_HINT}</div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Bot-versie</div>
        <div className="select-wrap">
          <select
            className="select-input"
            value={botVersion}
            onChange={(e) => router.push(`/?v=${encodeURIComponent(e.target.value)}`)}
          >
            {bots.map((b) => (
              <option key={b.version} value={b.version}>
                {b.label} — {b.chatModel}
              </option>
            ))}
          </select>
          <span className="select-caret">
            <Icon name="caret" size={12} />
          </span>
        </div>
        {current ? (
          <div className="slider-hint" style={{ marginTop: 8 }}>
            {current.description}
          </div>
        ) : null}
      </div>

      <div className="settings-section">
        <div className="settings-label">Similarity threshold</div>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => onThreshold(Number(e.target.value))}
            className="slider-input"
            aria-label="Similarity threshold"
          />
          <div className="slider-value">{threshold.toFixed(2)}</div>
        </div>
        <div className="slider-hint">lager = lossere match · hoger = strikter</div>
      </div>

      <StyleSegmented kind="tone" value={tone} onChange={onToneChange} />
      <StyleSegmented kind="length" value={length} onChange={onLengthChange} />

      <div className="settings-section">
        <div className="settings-label">HyDE-modus</div>
        <div className="threshold-presets" role="radiogroup" aria-label="HyDE-modus">
          {HYDE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={hydeMode === m}
              className={`threshold-preset${hydeMode === m ? ' active' : ''}`}
              onClick={() => onHydeModeChange(m)}
            >
              <span className="threshold-preset-label">{HYDE_LABELS[m]}</span>
            </button>
          ))}
        </div>
        <div className="slider-hint">{HYDE_HINT}</div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Pipeline-opties</div>
        <ToggleRow
          label="Smart pre-processing"
          desc="Smalltalk-detect, typfout-correctie, synoniem-expansie. +1 LLM-call ≈ $0.0001."
          on={rewriteOn}
          onChange={onToggleRewrite}
        />
        <ToggleRow
          label="Cache layer"
          desc="Hergebruik antwoorden voor herhaalde vragen. Per bot-versie vastgelegd."
          on={botFlags.cacheEnabled}
          disabled
        />
        <ToggleRow
          label="Self-reflect"
          desc="Tweede LLM-pas valideert antwoord-kwaliteit. Per bot-versie vastgelegd."
          on={botFlags.selfReflect}
          disabled
        />
        <ToggleRow
          label={`Cascade naar ${botFlags.cascadeModel}`}
          desc="Escalleer bij lage confidence (~10-15× cost per cascade-call). Per bot-versie vastgelegd."
          on={botFlags.cascadeOnLowConfidence}
          disabled
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1 }}>
        <div className="toggle-label">{label}</div>
        <div className="toggle-desc">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`switch${on ? ' on' : ''}`}
        onClick={onChange}
        disabled={disabled || !onChange}
      />
    </div>
  );
}
