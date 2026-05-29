'use client';

// Status-knoppen voor een gelogde fout-groep (opgelost / negeer / heropen).
// De server-action revalideert /admindashboard; router.refresh() trekt de
// detailpagina ook meteen bij zodat de status-pill direct verandert.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ignoreErrorGroupAction,
  reopenErrorGroupAction,
  resolveErrorGroupAction,
} from '@/app/actions/controlroom';
import type { ErrorStatus } from '@/lib/observability/sink';

export function ErrorStatusActions({ id, status }: { id: string; status: ErrorStatus }) {
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
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(resolveErrorGroupAction)}>
          Markeer opgelost
        </button>
      )}
      {status !== 'ignored' && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(ignoreErrorGroupAction)}>
          Negeer
        </button>
      )}
      {status !== 'open' && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => run(reopenErrorGroupAction)}>
          Heropen
        </button>
      )}
    </div>
  );
}
