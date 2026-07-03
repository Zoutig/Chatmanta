'use client';

// V1 Admin — FAQ-cadans-control. Port van app/admindashboard/components/faq-cadence-control.tsx.
// Enige verschil: importeert uit de V1-action en V1-config (niet de V0-paden).

import { useState, useTransition } from 'react';
import { setFaqRefreshCadenceAction } from './set-faq-cadence-action';
import type { FaqRefreshCadence } from '@/lib/v1/admin/config';

const OPTIONS: { value: FaqRefreshCadence; label: string }[] = [
  { value: 'weekly', label: 'Wekelijks' },
  { value: 'monthly', label: 'Maandelijks' },
];

export function FaqCadenceControl({ current }: { current: FaqRefreshCadence }) {
  const [cadence, setCadence] = useState<FaqRefreshCadence>(current);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (next: FaqRefreshCadence) => {
    if (next === cadence || pending) return;
    const prev = cadence;
    setCadence(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await setFaqRefreshCadenceAction(next);
      if (!res.ok) {
        setCadence(prev);
        setError(res.error);
        return;
      }
      setSaved(true);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="klant-btn"
            data-variant={o.value === cadence ? 'primary' : undefined}
            aria-pressed={o.value === cadence}
            disabled={pending}
            onClick={() => choose(o.value)}
          >
            {o.label}
          </button>
        ))}
        {pending && (
          <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>Opslaan…</span>
        )}
        {!pending && saved && (
          <span style={{ fontSize: 12.5, color: 'var(--klant-success)' }} role="status">
            Opgeslagen
          </span>
        )}
      </div>
      {error && (
        <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
