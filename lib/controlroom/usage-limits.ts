// Control Room — maandelijkse gesprekslimieten per commerciële status (MD §16.3).
// Pure helper, gedeeld door de klantdetail-Usage-tab en de cross-org Usage-pagina.

import type { CommercialStatus } from './types';

export const MONTHLY_CONVERSATION_LIMITS: Record<CommercialStatus, number | null> = {
  trial: 100,
  active: 500,
  paused: 500,
  cancellation: 500,
  internal_test: null, // intern = onbeperkt
};

export type UsageLimitTone = 'ink' | 'warn' | 'danger' | 'success';

export type UsageLimitStatus = {
  limit: number | null;
  label: string;
  tone: UsageLimitTone;
};

/** Bepaal limiet + status-label (normal / warning ≥80% / limit_reached). */
export function usageLimitStatus(count: number, status: CommercialStatus): UsageLimitStatus {
  const limit = MONTHLY_CONVERSATION_LIMITS[status];
  if (limit == null) return { limit: null, label: 'Onbeperkt (intern)', tone: 'success' };
  const pct = limit > 0 ? count / limit : 0;
  if (pct >= 1) return { limit, label: `Limiet bereikt (${count}/${limit})`, tone: 'danger' };
  if (pct >= 0.8) return { limit, label: `Bijna vol (${count}/${limit})`, tone: 'warn' };
  return { limit, label: `${count}/${limit}`, tone: 'ink' };
}
