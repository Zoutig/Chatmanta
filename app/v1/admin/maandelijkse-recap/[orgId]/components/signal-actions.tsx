'use client';

// Triage-acties per signaal — V1 variant.
// Enige verschil t.o.v. V0: prop heet `orgId` i.p.v. `orgSlug`,
// en de action-import komt uit de V1 actions.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import { setRecapSignalStatusAction } from '@/app/v1/admin/maandelijkse-recap/actions';
import type { RecapSignalStatus } from '@/lib/controlroom/types';

export function SignalActions({
  orgId,
  year,
  month,
  signalType,
  status,
}: {
  orgId: string;
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
      const res = await setRecapSignalStatusAction(orgId, year, month, signalType, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span className="v1-adm-inline">
      {status === 'nieuw' ? (
        <>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => set('genegeerd')}>
            Negeren
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => set('behandeld')}>
            Markeer als behandeld
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => set('nieuw')}>
          Herstel
        </Button>
      )}
      {error ? (
        <span role="alert" className="v1-adm-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
