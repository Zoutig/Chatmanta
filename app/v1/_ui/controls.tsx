'use client';

import { useId, type ReactNode } from 'react';

// Invoer-bouwstenen van de V1-ontwerplaag voor de bewerkmodus van panelen.

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** Krijgt het id dat het label koppelt. */
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="v1-field">
      <label className="v1-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <p className="v1-hint">{hint}</p> : null}
    </div>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="v1-switch-row">
      <span className="v1-switch-text" id={id}>
        {label}
        {description ? <span className="v1-hint">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className="v1-switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="v1-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="v1-seg-opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChoiceTiles<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; help: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="v1-choices">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="v1-choice"
          onClick={() => onChange(o.value)}
        >
          <span className="v1-choice-title">{o.label}</span>
          <span className="v1-choice-help">{o.help}</span>
        </button>
      ))}
    </div>
  );
}
