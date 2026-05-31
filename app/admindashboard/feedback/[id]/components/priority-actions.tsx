'use client';

// Prioriteit-control voor een melding (admin_feedback). Operator zet of wist de
// prioriteit; setFeedbackPriorityAction revalideert + logt een internal_note,
// router.refresh() trekt de detailpagina (pill + historie) meteen bij.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackPriorityAction } from '@/app/actions/controlroom';
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  type FeedbackPriority,
} from '@/lib/controlroom/types';

export function FeedbackPriorityActions({ id, priority }: { id: string; priority: FeedbackPriority | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const setPriority = (next: FeedbackPriority | '') =>
    startTransition(async () => {
      setError(null);
      const res = await setFeedbackPriorityAction(id, next);
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
