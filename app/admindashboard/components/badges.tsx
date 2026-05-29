// Admin Dashboard — status-badges (commercieel / technisch / health).
// Dunne wrappers rond de bestaande Pill-primitive (klantendashboard design).

import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import {
  COMMERCIAL_STATUS_LABELS,
  HEALTH_STATUS_LABELS,
  TECHNICAL_STATUS_LABELS,
  type CommercialStatus,
  type HealthStatus,
  type TechnicalStatus,
} from '@/lib/controlroom/types';

const COMMERCIAL_TONE: Record<CommercialStatus, PillTone> = {
  trial: 'info',
  active: 'success',
  paused: 'warn',
  cancellation: 'danger',
  internal_test: 'neutral',
};

const TECHNICAL_TONE: Record<TechnicalStatus, PillTone> = {
  setup: 'neutral',
  ready_for_testing: 'info',
  live: 'success',
  degraded: 'warn',
  error: 'danger',
  disabled: 'neutral',
};

const HEALTH_TONE: Record<HealthStatus, PillTone> = {
  green: 'success',
  orange: 'warn',
  red: 'danger',
};

export function CommercialBadge({ status }: { status: CommercialStatus }) {
  return <Pill tone={COMMERCIAL_TONE[status]}>{COMMERCIAL_STATUS_LABELS[status]}</Pill>;
}

export function TechnicalBadge({ status }: { status: TechnicalStatus }) {
  return (
    <Pill tone={TECHNICAL_TONE[status]} dot>
      {TECHNICAL_STATUS_LABELS[status]}
    </Pill>
  );
}

export function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <Pill tone={HEALTH_TONE[status]} dot>
      {HEALTH_STATUS_LABELS[status]}
    </Pill>
  );
}
