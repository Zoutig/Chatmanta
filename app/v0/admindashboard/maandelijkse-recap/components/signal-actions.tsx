'use client';

// Triage-acties per signaal: [Negeren] / [Markeer als behandeld], en [Herstel]
// terug naar 'nieuw'. Schrijft via setRecapSignalStatusAction; de status blijft
// bewaard over (her)generaties heen.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRecapSignalStatusAction } from '@/app/actions/recap';
import type { RecapSignalStatus } from '@/lib/controlroom/types';

export function SignalActions({
  orgSlug,
  year,
  month,
  signalType,
  status,
}: {
  orgSlug: string;
  year: number;
  month: number;
  signalType: string;
  status: RecapSignalStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set(next: RecapSignalStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setRecapSignalStatusAction(orgSlug, year, month, signalType, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {status === 'nieuw' ? (
        <>
          <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => set('genegeerd')}>
            Negeren
          </button>
          <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => set('behandeld')}>
            Markeer als behandeld
          </button>
        </>
      ) : (
        <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => set('nieuw')}>
          Herstel
        </button>
      )}
      {error ? <span style={{ fontSize: 12, color: 'var(--klant-danger)' }}>{error}</span> : null}
    </span>
  );
}
