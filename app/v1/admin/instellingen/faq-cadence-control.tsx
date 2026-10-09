'use client';

// V1 Admin — FAQ-cadans: optimistisch omzetten, terug bij een fout, bevestiging als toast.

import { useState, useTransition } from 'react';
import { Segmented } from '@/app/v1/_ui/controls';
import { useToast } from '@/app/v1/_ui/toast';
import { setFaqRefreshCadenceAction } from './set-faq-cadence-action';
import type { FaqRefreshCadence } from '@/lib/v1/admin/config';

const OPTIONS: ReadonlyArray<{ value: FaqRefreshCadence; label: string }> = [
  { value: 'weekly', label: 'Wekelijks' },
  { value: 'monthly', label: 'Maandelijks' },
];

export function FaqCadenceControl({ current }: { current: FaqRefreshCadence }) {
  const toast = useToast();
  const [cadence, setCadence] = useState<FaqRefreshCadence>(current);
  const [pending, startTransition] = useTransition();

  const choose = (next: FaqRefreshCadence) => {
    if (next === cadence || pending) return;
    const prev = cadence;
    setCadence(next);
    startTransition(async () => {
      const res = await setFaqRefreshCadenceAction(next);
      if (!res.ok) {
        setCadence(prev);
        toast.error(res.error || 'Opslaan lukte niet. Probeer het opnieuw.');
        return;
      }
      toast.success(next === 'weekly' ? 'FAQ wordt voortaan wekelijks ververst' : 'FAQ wordt voortaan maandelijks ververst');
    });
  };

  return <Segmented label="FAQ-verversing" value={cadence} options={OPTIONS} onChange={choose} />;
}
