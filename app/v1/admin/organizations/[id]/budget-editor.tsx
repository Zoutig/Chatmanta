'use client';

// Budget-editor — klein number-form dat organizations.daily_budget_eur aanpast via
// setOrgDailyBudgetAction. 0 = budget effectief uit.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgDailyBudgetAction } from './actions';

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
    <form onSubmit={onSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Dagbudget (€)
        <input
          type="number"
          required
          min={0}
          max={1000}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            padding: '8px 10px',
            fontSize: 14,
            width: 120,
            borderRadius: 'var(--klant-r-md)',
            border: '1px solid var(--klant-border)',
            background: 'var(--klant-surface)',
            color: 'var(--klant-ink)',
          }}
        />
      </label>
      <button type="submit" className="klant-btn" data-variant="primary" disabled={pending} style={{ padding: '8px 14px' }}>
        {pending ? 'Opslaan…' : 'Opslaan'}
      </button>
      {msg && (
        <span
          role={msg.ok ? 'status' : 'alert'}
          style={{ fontSize: 13, color: msg.ok ? 'var(--klant-success)' : 'var(--klant-danger)' }}
        >
          {msg.text}
        </span>
      )}
    </form>
  );
}
