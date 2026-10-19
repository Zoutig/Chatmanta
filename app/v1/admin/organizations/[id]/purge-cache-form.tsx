'use client';

// 'Antwoord-cache legen' per klant (adminPurgeAnswerCacheAction). Met bevestiging:
// het kost niets, maar de eerstvolgende vragen zijn even trager en duurder omdat
// ze weer door de volledige pipeline gaan.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminPurgeAnswerCacheAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import './org-forms.css';

export function PurgeCacheForm({ orgId, compact = false }: { orgId: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function purge() {
    if (pending) return;
    if (
      !confirm(
        'De antwoord-cache van deze klant legen? Opgeslagen antwoorden worden gewist; de volgende vragen worden opnieuw beantwoord met de huidige kennisbank en instellingen.',
      )
    ) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await adminPurgeAnswerCacheAction(orgId);
      if (res.ok) {
        const n = res.removed;
        setMsg({
          ok: true,
          text:
            n == null
              ? 'Antwoord-cache geleegd.'
              : n === 1
                ? 'Antwoord-cache geleegd (1 opgeslagen antwoord gewist).'
                : `Antwoord-cache geleegd (${n} opgeslagen antwoorden gewist).`,
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className={compact ? undefined : 'v1-form'}>
      <div className="v1-adm-of-actions">
        <Button variant="secondary" size={compact ? 'sm' : undefined} onClick={purge} loading={pending}>
          Antwoord-cache legen
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
