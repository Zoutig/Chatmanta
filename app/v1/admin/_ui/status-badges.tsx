// Statuslabels voor klanten in het admindashboard, als V1-Badge. Eigen
// Nederlandse labels (de gedeelde lib-labels bevatten nog Engelse woorden).

import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import type { CommercialStatus, HealthStatus, TechnicalStatus } from '@/lib/controlroom/types';

const COMMERCIAL: Record<CommercialStatus, { tone: Tone; label: string }> = {
  trial: { tone: 'accent', label: 'Proefperiode' },
  active: { tone: 'ok', label: 'Actief' },
  paused: { tone: 'warn', label: 'Gepauzeerd' },
  cancellation: { tone: 'danger', label: 'Opgezegd' },
  internal_test: { tone: 'neutral', label: 'Interne test' },
};

const TECHNICAL: Record<TechnicalStatus, { tone: Tone; label: string }> = {
  setup: { tone: 'neutral', label: 'Inrichten' },
  ready_for_testing: { tone: 'accent', label: 'Klaar om te testen' },
  live: { tone: 'ok', label: 'Live' },
  degraded: { tone: 'warn', label: 'Werkt deels' },
  error: { tone: 'danger', label: 'Fout' },
  disabled: { tone: 'neutral', label: 'Uitgeschakeld' },
};

const HEALTH: Record<HealthStatus, { tone: Tone; label: string }> = {
  green: { tone: 'ok', label: 'Gezond' },
  orange: { tone: 'warn', label: 'Aandacht nodig' },
  red: { tone: 'danger', label: 'Probleem' },
};

export function CommercialBadge({ status }: { status: CommercialStatus }) {
  const s = COMMERCIAL[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function TechnicalBadge({ status }: { status: TechnicalStatus }) {
  const s = TECHNICAL[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function HealthBadge({ status }: { status: HealthStatus }) {
  const s = HEALTH[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}
