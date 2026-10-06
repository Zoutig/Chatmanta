'use client';

// Widget-domeinen-editor — Jorion-beheerde chatbots.allowed_domains via
// setAllowedDomainsAction. Eén domein per regel; normalisatie gebeurt server-side
// (schema/pad/`www.` eraf). Leeg opslaan = geen beperking (widget overal toegestaan).

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setAllowedDomainsAction } from './actions';

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
          text: res.domains.length > 0 ? 'Domeinen opgeslagen.' : 'Opgeslagen — geen beperking (widget werkt overal).',
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Toegestane websites (één per regel)
        <textarea
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={'bakkerij.nl\nwinkel.bakkerij.nl'}
          style={{
            padding: '8px 10px',
            fontSize: 14,
            fontFamily: 'var(--klant-font-mono)',
            borderRadius: 'var(--klant-r-md)',
            border: '1px solid var(--klant-border)',
            background: 'var(--klant-surface)',
            color: 'var(--klant-ink)',
            resize: 'vertical',
          }}
        />
      </label>
      <p style={{ fontSize: 12, color: 'var(--klant-muted)', margin: 0 }}>
        www. telt automatisch mee (bakkerij.nl dekt ook www.bakkerij.nl). Leeg = de widget werkt op
        élke website — vul dit vóór livegang in.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={pending} style={{ padding: '8px 14px' }}>
          {pending ? 'Opslaan…' : 'Domeinen opslaan'}
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
    </form>
  );
}
