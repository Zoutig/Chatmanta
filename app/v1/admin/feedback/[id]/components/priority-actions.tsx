'use client';

// V1 port van app/admindashboard/feedback/[id]/components/priority-actions.tsx.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackPriorityV1Action } from '@/app/v1/admin/feedback/actions';
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  type FeedbackPriority,
} from '@/lib/controlroom/types';

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
    <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {FEEDBACK_PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          className="klant-btn"
          data-variant={p === priority ? 'primary' : undefined}
          disabled={pending}
          onClick={() => setPriority(p)}
        >
          {FEEDBACK_PRIORITY_LABELS[p]}
        </button>
      ))}
      {priority && (
        <button type="button" className="klant-btn" disabled={pending} onClick={() => setPriority('')}>
          Wissen
        </button>
      )}
      {error && <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">{error}</span>}
    </div>
  );
}
