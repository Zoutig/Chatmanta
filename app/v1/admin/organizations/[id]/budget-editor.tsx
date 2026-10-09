'use client';

// Budget-editor — klein number-form dat organizations.daily_budget_eur aanpast via
// setOrgDailyBudgetAction. 0 = budget effectief uit.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgDailyBudgetAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import './org-forms.css';

export function BudgetEditor({ orgId, currentEur }: { orgId: string; currentEur: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(currentEur));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);
    if (value.trim() === '') {
      setMsg({ ok: false, text: 'Vul een bedrag in (0 = uit).' });
      return;
    }
    const eur = Number(value);
    start(async () => {
      const res = await setOrgDailyBudgetAction(orgId, eur);
      if (res.ok) {
        setMsg({ ok: true, text: 'Budget opgeslagen.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="v1-form">
      <div className="v1-adm-of-row">
        <Field label="Dagbudget in euro">
          {(id) => (
            <input
              id={id}
              type="number"
              required
              min={0}
              max={1000}
              step={0.5}
              className="v1-input v1-adm-of-num"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending}>
          Opslaan
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
