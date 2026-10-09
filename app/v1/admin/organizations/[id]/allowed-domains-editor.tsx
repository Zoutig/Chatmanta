'use client';

// Widget-domeinen-editor — Jorion-beheerde chatbots.allowed_domains via
// setAllowedDomainsAction. Eén domein per regel; normalisatie gebeurt server-side
// (schema/pad/`www.` eraf). Leeg opslaan = geen beperking (widget overal toegestaan).

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setAllowedDomainsAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import './org-forms.css';

export function AllowedDomainsEditor({ orgId, current }: { orgId: string; current: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(current.join('\n'));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);
    start(async () => {
      const res = await setAllowedDomainsAction(orgId, value);
      if (res.ok) {
        setValue(res.domains.join('\n'));
        setMsg({
          ok: true,
          text: res.domains.length > 0 ? 'Domeinen opgeslagen.' : 'Opgeslagen. Geen beperking: de widget werkt overal.',
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="v1-form">
      <Field
        label="Toegestane websites (één per regel)"
        hint="www. telt automatisch mee (bakkerij.nl dekt ook www.bakkerij.nl). Leeg betekent dat de widget op elke website werkt, dus vul dit in vóór livegang."
      >
        {(id) => (
          <textarea
            id={id}
            rows={3}
            className="v1-input v1-adm-of-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'bakkerij.nl\nwinkel.bakkerij.nl'}
          />
        )}
      </Field>
      <div className="v1-adm-of-actions">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Domeinen opslaan
        </Button>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`v1-alert ${msg.ok ? 'v1-alert--ok' : 'v1-alert--error'}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
