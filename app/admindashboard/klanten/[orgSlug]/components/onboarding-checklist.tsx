'use client';

// Onboarding-checklist per klant. Status per item wijzigen → schrijft via
// updateOnboardingItemAction (completed_at volgt automatisch op 'done').

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateOnboardingItemAction } from '@/app/actions/controlroom';
import {
  ONBOARDING_ITEM_STATUS_LABELS,
  ONBOARDING_ITEM_STATUSES,
  type OnboardingItem,
  type OnboardingItemStatus,
} from '@/lib/controlroom/types';

const STATUS_TONE: Record<OnboardingItemStatus, string> = {
  todo: 'var(--klant-dim)',
  done: 'var(--klant-success)',
  blocked: 'var(--klant-danger)',
  not_applicable: 'var(--klant-faint)',
};

export function OnboardingChecklist({
  orgSlug,
  items,
}: {
  orgSlug: string;
  items: OnboardingItem[];
}) {
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
      const res = await updateOnboardingItemAction(orgSlug, item.id, { status });
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: 'var(--klant-muted)' }}>Voortgang</span>
          <span style={{ fontWeight: 600 }}>{done}/{total} ({pct}%)</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--klant-surface-muted)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--klant-accent)' }} />
        </div>
      </div>

      {error ? <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 10px',
              borderRadius: 'var(--klant-r-md)',
              opacity: busyId === item.id && pending ? 0.6 : 1,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_TONE[item.status], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, textDecoration: item.status === 'done' ? 'line-through' : 'none', color: item.status === 'done' ? 'var(--klant-muted)' : 'var(--klant-ink)' }}>
              {item.label}
            </span>
            <select
              className="klant-select"
              style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}
              value={item.status}
              disabled={pending && busyId === item.id}
              onChange={(e) => setStatus(item, e.target.value as OnboardingItemStatus)}
            >
              {ONBOARDING_ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>{ONBOARDING_ITEM_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
