'use client';

// Status-knoppen voor een gelogde fout-groep (opgelost / negeer / heropen).
// Port van app/admindashboard/issues/[groupId]/components/status-actions.tsx.
// Enige wijziging: importeert V1-actions i.p.v. de V0 controlroom-actions.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  resolveErrorGroupV1Action,
  ignoreErrorGroupV1Action,
  reopenErrorGroupV1Action,
} from '../actions';
import type { ErrorStatus } from '@/lib/observability/sink';

export function ErrorStatusActionsV1({ id, status }: { id: string; status: ErrorStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (action: (id: string) => Promise<unknown>) =>
    startTransition(async () => {
      await action(id);
      router.refresh();
    });

  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      {status !== 'resolved' && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(resolveErrorGroupV1Action)}>
          Markeer opgelost
        </button>
      )}
      {status !== 'ignored' && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(ignoreErrorGroupV1Action)}>
          Negeer
        </button>
      )}
      {status !== 'open' && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(reopenErrorGroupV1Action)}>
          Heropen
        </button>
      )}
    </div>
  );
}
