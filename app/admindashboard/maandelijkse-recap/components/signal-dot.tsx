// Overzicht-bol voor de recap-signalering. Server-component (puur).
// 🟢 geen bijzonderheden / 🟡 let op / 🔴 actie vereist. Een 'inzicht' is volgens
// de spec géén probleem → groen, met een afwijkend label.

import type { RecapSignalSeverity } from '@/lib/controlroom/types';

export function SignalDot({ severity, showLabel = true }: {
  severity: RecapSignalSeverity | null;
  showLabel?: boolean;
}) {
  const color =
    severity === 'actie_vereist'
      ? 'var(--klant-danger)'
      : severity === 'waarschuwing'
        ? 'var(--klant-warn)'
        : 'var(--klant-success)';
  const label =
    severity === 'actie_vereist'
      ? 'Actie vereist'
      : severity === 'waarschuwing'
        ? 'Let op'
        : severity === 'inzicht'
          ? 'Inzicht beschikbaar'
          : 'Geen bijzonderheden';
  return (
    <span
      title={label}
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--klant-muted)' }}
    >
      <span
        aria-hidden
        style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}
      />
      {showLabel ? label : null}
    </span>
  );
}
