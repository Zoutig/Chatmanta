'use client';

// Prioriteit-knoppen voor een feedbackmelding (V1-ontwerplaag).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackPriorityV1Action } from '@/app/v1/admin/feedback/actions';
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  type FeedbackPriority,
} from '@/lib/controlroom/types';
import { Button } from '@/app/v1/_ui/button';

export function FeedbackPriorityActionsV1({ id, priority }: { id: string; priority: FeedbackPriority | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const setPriority = (next: FeedbackPriority | '') =>
    startTransition(async () => {
      setError(null);
      const res = await setFeedbackPriorityV1Action(id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <div className="v1-adm-inline">
      {FEEDBACK_PRIORITIES.map((p) => (
        <Button
          key={p}
          variant={p === priority ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={p === priority}
          disabled={pending}
          onClick={() => setPriority(p)}
        >
          {FEEDBACK_PRIORITY_LABELS[p]}
        </Button>
      ))}
      {priority && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setPriority('')}>
          Wissen
        </Button>
      )}
      {error && <span className="v1-adm-danger" role="alert">{error}</span>}
    </div>
  );
}
