'use client';

// WP5c — pauzeer/hervat-knop voor operator-suspend (organizations.suspended_at via
// setOrgSuspendedAction). Bij pauzeren een bevestiging: bezoekers verliezen de widget.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgSuspendedAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import './org-forms.css';

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
    <div className="v1-form">
      <div className="v1-adm-of-actions">
        <Button variant={suspended ? 'primary' : 'secondary'} onClick={toggle} loading={pending}>
          {suspended ? 'Hervatten' : 'Pauzeren'}
        </Button>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`v1-alert ${msg.ok ? 'v1-alert--ok' : 'v1-alert--error'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
