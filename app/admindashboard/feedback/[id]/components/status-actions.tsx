'use client';

// Status-knoppen voor een klant-melding (admin_feedback). De server-action
// revalideert /admindashboard; router.refresh() trekt de detailpagina meteen bij
// zodat de status-pill + historie direct verversen.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackStatusAction } from '@/app/actions/controlroom';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from '@/lib/controlroom/types';

export function FeedbackStatusActions({ id, status }: { id: string; status: FeedbackStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const setStatus = (next: FeedbackStatus) =>
    startTransition(async () => {
      await setFeedbackStatusAction(id, next);
      router.refresh();
    });

  return (
    <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {FEEDBACK_STATUSES.filter((s) => s !== status).map((s) => (
        <button
          key={s}
          type="button"
          className="klant-btn"
          data-variant={s === 'opgelost' ? 'primary' : undefined}
          disabled={pending}
          onClick={() => setStatus(s)}
        >
          {FEEDBACK_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
