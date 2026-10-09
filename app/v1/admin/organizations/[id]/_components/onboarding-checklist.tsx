'use client';

// V1 — OnboardingChecklist: port van V0 met V1 overlay-action.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateOnboardingItemAction } from '../overlay-actions';
import {
  ONBOARDING_ITEM_STATUS_LABELS,
  ONBOARDING_ITEM_STATUSES,
  type OnboardingItem,
  type OnboardingItemStatus,
} from '@/lib/controlroom/types';
import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import '../org-forms.css';

const STATUS_TONE: Record<OnboardingItemStatus, Tone> = {
  todo: 'neutral',
  done: 'ok',
  blocked: 'danger',
  not_applicable: 'neutral',
};

export function OnboardingChecklist({ orgId, items }: { orgId: string; items: OnboardingItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = items.filter((i) => i.status === 'done').length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function setStatus(item: OnboardingItem, status: OnboardingItemStatus) {
    setError(null);
    setBusyId(item.id);
    start(async () => {
      const res = await updateOnboardingItemAction(orgId, item.id, { status });
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="v1-form">
      <div className="v1-adm-of-progress">
        <div className="v1-adm-of-progress-head">
          <span>Voortgang</span>
          <strong>
            {done}/{total} ({pct}%)
          </strong>
        </div>
        <div
          className="v1-adm-of-bar"
          role="progressbar"
          aria-label="Voortgang onboarding"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          {error}
        </p>
      ) : null}

      <ul className="v1-list">
        {items.map((item) => {
          const busy = pending && busyId === item.id;
          const isDone = item.status === 'done';
          return (
            <li key={item.id} className="v1-list-row v1-adm-of-check" style={busy ? { opacity: 0.6 } : undefined}>
              <span className="v1-adm-of-check-label" data-done={isDone || undefined}>
                <Badge tone={STATUS_TONE[item.status]} dot>
                  {ONBOARDING_ITEM_STATUS_LABELS[item.status]}
                </Badge>
                <span style={isDone ? { textDecoration: 'line-through' } : undefined}>{item.label}</span>
              </span>
              <select
                className="v1-input"
                aria-label={`Status van ${item.label}`}
                value={item.status}
                disabled={busy}
                onChange={(e) => setStatus(item, e.target.value as OnboardingItemStatus)}
              >
                {ONBOARDING_ITEM_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {ONBOARDING_ITEM_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
