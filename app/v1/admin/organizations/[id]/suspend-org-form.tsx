'use client';

// WP5c — pauzeer/hervat-knop voor operator-suspend (organizations.suspended_at via
// setOrgSuspendedAction). Bij pauzeren een bevestiging: bezoekers verliezen de widget.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgSuspendedAction } from './actions';

export function SuspendOrgForm({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    if (pending) return;
    const next = !suspended;
    if (
      next &&
      !confirm(
        'Deze organisatie opschorten? Bezoekers zien de widget niet meer en de chatbot toont een "tijdelijk niet beschikbaar"-melding.',
      )
    ) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await setOrgSuspendedAction(orgId, next);
      if (res.ok) {
        setMsg({ ok: true, text: next ? 'Organisatie opgeschort.' : 'Organisatie hervat.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={toggle}
        className="klant-btn"
        data-variant={suspended ? 'primary' : 'secondary'}
        disabled={pending}
        style={{ padding: '8px 14px' }}
      >
        {pending ? 'Bezig…' : suspended ? 'Hervatten' : 'Pauzeren'}
      </button>
      {msg && (
        <span
          role={msg.ok ? 'status' : 'alert'}
          style={{ fontSize: 13, color: msg.ok ? 'var(--klant-success)' : 'var(--klant-danger)' }}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
