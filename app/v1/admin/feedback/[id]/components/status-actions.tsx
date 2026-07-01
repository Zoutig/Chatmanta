'use client';

// V1 port van app/admindashboard/feedback/[id]/components/status-actions.tsx.
// Enige wijziging: importeert setFeedbackStatusV1Action i.p.v. V0-action.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackStatusV1Action } from '@/app/v1/admin/feedback/actions';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from '@/lib/controlroom/types';

export function FeedbackStatusActionsV1({ id, status }: { id: string; status: FeedbackStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const setStatus = (next: FeedbackStatus) =>
    startTransition(async () => {
      setError(null);
      const res = await setFeedbackStatusV1Action(id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
      {error && <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">{error}</span>}
    </div>
  );
}
