'use client';

// V1 — OnboardingChecklist: port van V0 met V1 overlay-action. Toont ook stappen die
// uit de data blijken als 'Klaar (automatisch)' (lib/v1/admin/onboarding-derive.ts) en
// de virtuele stap 'Toegestane domeinen ingesteld' (niet opgeslagen, niet te wijzigen).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateOnboardingItemAction } from '../overlay-actions';
import {
  ONBOARDING_ITEM_STATUS_LABELS,
  ONBOARDING_ITEM_STATUSES,
  type OnboardingItemStatus,
} from '@/lib/controlroom/types';
import { onboardingProgress, type OnboardingDisplayItem } from '@/lib/v1/admin/onboarding-derive';
import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import '../org-forms.css';

const STATUS_TONE: Record<OnboardingItemStatus, Tone> = {
  todo: 'neutral',
  done: 'ok',
  blocked: 'danger',
  not_applicable: 'neutral',
};

export function OnboardingChecklist({ orgId, items }: { orgId: string; items: OnboardingDisplayItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { done, total } = onboardingProgress(items);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function setStatus(item: OnboardingDisplayItem, status: OnboardingItemStatus) {
    const id = item.id;
    if (!id) return; // virtuele stap: niet opgeslagen
    setError(null);
    setBusyId(id);
    start(async () => {
      const res = await updateOnboardingItemAction(orgId, id, { status });
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
          const busy = pending && item.id != null && busyId === item.id;
          const isDone = item.status === 'done';
          return (
            <li key={item.key} className="v1-list-row v1-adm-of-check" style={busy ? { opacity: 0.6 } : undefined}>
              <span className="v1-adm-of-check-label" data-done={isDone || undefined}>
                <Badge tone={STATUS_TONE[item.status]} dot>
                  {item.autoReason ? 'Klaar (automatisch)' : ONBOARDING_ITEM_STATUS_LABELS[item.status]}
                </Badge>
                <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={isDone ? { textDecoration: 'line-through' } : undefined}>{item.label}</span>
                  {item.autoReason ? <span className="v1-adm-muted" style={{ fontSize: 12.5 }}>{item.autoReason}</span> : null}
                </span>
              </span>
              {item.id ? (
                <select
                  className="v1-input"
                  aria-label={`Opgeslagen status van ${item.label}`}
                  value={item.storedStatus ?? 'todo'}
                  disabled={busy}
                  onChange={(e) => setStatus(item, e.target.value as OnboardingItemStatus)}
                >
                  {ONBOARDING_ITEM_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {ONBOARDING_ITEM_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              ) : (
                <Link href={`/v1/admin/organizations/${orgId}?tab=widget`} className="v1-section-link">
                  {isDone ? 'Bekijk domeinen' : 'Domeinen instellen'}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
