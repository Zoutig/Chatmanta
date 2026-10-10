'use client';

// Fast mode per klant (organizations.fast_mode_enabled via setOrgFastModeAction).
// Aan = sneller antwoord tegen ~2× LLM-kosten; uit = standaard verwerking.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgFastModeAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import './org-forms.css';

export function FastModeForm({ orgId, enabled }: { orgId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    if (pending) return;
    const next = !enabled;
    setMsg(null);
    start(async () => {
      const res = await setOrgFastModeAction(orgId, next);
      if (res.ok) {
        setMsg({ ok: true, text: next ? 'Fast mode staat aan.' : 'Fast mode staat uit.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="v1-form">
      <div className="v1-adm-of-actions">
        <Button variant="secondary" onClick={toggle} loading={pending}>
          {enabled ? 'Fast mode uitzetten' : 'Fast mode aanzetten'}
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
