'use client';

// Status-knoppen voor een feedbackmelding (V1-ontwerplaag).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackStatusV1Action } from '@/app/v1/admin/feedback/actions';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from '@/lib/controlroom/types';
import { Button } from '@/app/v1/_ui/button';

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
    <div className="v1-adm-inline">
      {FEEDBACK_STATUSES.filter((s) => s !== status).map((s) => (
        <Button
          key={s}
          variant={s === 'opgelost' ? 'primary' : 'secondary'}
          size="sm"
          disabled={pending}
          onClick={() => setStatus(s)}
        >
          {FEEDBACK_STATUS_LABELS[s]}
        </Button>
      ))}
      {error && <span className="v1-adm-danger" role="alert">{error}</span>}
    </div>
  );
}
