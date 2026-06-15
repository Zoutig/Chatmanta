'use client';

// FAQ-verversing — operator-control voor de snapshot-refresh-cadans (M5 deel C).
// Twee opties (Wekelijks / Maandelijks); een wijziging schrijft direct via de
// server-action. useTransition voor de pending-staat, een "Opgeslagen"-indicator
// als bevestiging. Stijl matcht de admin-conventie: klant-btn + --klant-* tokens,
// inline styles, geen Tailwind, geen inline :hover.

import { useState, useTransition } from 'react';
import { setFaqRefreshCadenceAction } from '@/app/actions/admin-config';
import type { FaqRefreshCadence } from '@/lib/v0/server/admin-config';

const OPTIONS: { value: FaqRefreshCadence; label: string }[] = [
  { value: 'weekly', label: 'Wekelijks' },
  { value: 'monthly', label: 'Maandelijks' },
];

export function FaqCadenceControl({ current }: { current: FaqRefreshCadence }) {
  // Optimistische lokale staat — direct visueel actief, terugdraaien bij een fout.
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
