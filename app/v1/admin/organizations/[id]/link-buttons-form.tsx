'use client';

// Linkknoppen per klant (organizations.link_buttons_enabled via setOrgLinkButtonsAction).
// Aan = links naar documenten/downloads alleen op verzoek, als knop; uit = geen links.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgLinkButtonsAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import './org-forms.css';

export function LinkButtonsForm({ orgId, enabled }: { orgId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    if (pending) return;
    const next = !enabled;
    setMsg(null);
    start(async () => {
      const res = await setOrgLinkButtonsAction(orgId, next);
      if (res.ok) {
        setMsg({ ok: true, text: next ? 'Linkknoppen staan aan.' : 'Linkknoppen staan uit.' });
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
          {enabled ? 'Linkknoppen uitzetten' : 'Linkknoppen aanzetten'}
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
