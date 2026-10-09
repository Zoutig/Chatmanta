// Signaleringsbol voor de maandrecap (overzicht en detail), in V1-stijl.

import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import type { RecapSignalSeverity } from '@/lib/controlroom/types';

export function SignalDot({
  severity,
  showLabel = true,
}: {
  severity: RecapSignalSeverity | null;
  showLabel?: boolean;
}) {
  const tone: Tone = severity === 'actie_vereist' ? 'danger' : severity === 'waarschuwing' ? 'warn' : 'ok';
  const label =
    severity === 'actie_vereist'
      ? 'Actie nodig'
      : severity === 'waarschuwing'
        ? 'Let op'
        : severity === 'inzicht'
          ? 'Inzicht beschikbaar'
          : 'Geen bijzonderheden';
  if (!showLabel) {
    return <span className="v1-adm-dot" data-tone={tone} role="img" aria-label={label} title={label} />;
  }
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
