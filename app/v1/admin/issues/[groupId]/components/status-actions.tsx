'use client';

// Status-knoppen voor een gelogde fout-groep (opgelost / negeer / heropen).
// V1-ontwerplaag; roept de V1-actions aan.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  resolveErrorGroupV1Action,
  ignoreErrorGroupV1Action,
  reopenErrorGroupV1Action,
} from '../actions';
import type { ErrorStatus } from '@/lib/observability/sink';
import { Button } from '@/app/v1/_ui/button';

export function ErrorStatusActionsV1({ id, status }: { id: string; status: ErrorStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (action: (id: string) => Promise<unknown>) =>
    startTransition(async () => {
      await action(id);
      router.refresh();
    });

  return (
    <div className="v1-adm-inline">
      {status !== 'resolved' && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(resolveErrorGroupV1Action)}>
          Markeer opgelost
        </Button>
      )}
      {status !== 'ignored' && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(ignoreErrorGroupV1Action)}>
          Negeer
        </Button>
      )}
      {status !== 'open' && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(reopenErrorGroupV1Action)}>
          Heropen
        </Button>
      )}
    </div>
  );
}
