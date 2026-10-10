'use client';

// Limieten-editor — drie getallen in één form via setOrgLimitsAction:
// vragen per dag, vragen per maand (de klant ziet die) en het kostenplafond in euro
// (alleen intern vangnet). 0 = dicht.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgLimitsAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import './org-forms.css';

type Props = {
  orgId: string;
  dailyQuestions: number;
  monthlyQuestions: number;
  dailyBudgetEur: number;
};

export function LimitsEditor({ orgId, dailyQuestions, monthlyQuestions, dailyBudgetEur }: Props) {
  const router = useRouter();
  const [daily, setDaily] = useState(String(dailyQuestions));
  const [monthly, setMonthly] = useState(String(monthlyQuestions));
  const [eur, setEur] = useState(String(dailyBudgetEur));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);
    if ([daily, monthly, eur].some((v) => v.trim() === '')) {
      setMsg({ ok: false, text: 'Vul alle drie de velden in (0 = dicht).' });
      return;
    }
    const input = { dailyQuestions: Number(daily), monthlyQuestions: Number(monthly), dailyBudgetEur: Number(eur) };
    start(async () => {
      const res = await setOrgLimitsAction(orgId, input);
      if (res.ok) {
        setMsg({ ok: true, text: 'Limieten opgeslagen.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="v1-form">
      <div className="v1-adm-of-row">
        <Field label="Vragen per dag">
          {(id) => (
            <input
              id={id}
              type="number"
              required
              min={0}
              max={100000}
              step={1}
              className="v1-input v1-adm-of-num"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          )}
        </Field>
        <Field label="Vragen per maand">
          {(id) => (
            <input
              id={id}
              type="number"
              required
              min={0}
              max={1000000}
              step={1}
              className="v1-input v1-adm-of-num"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
          )}
        </Field>
        <Field label="Kostenplafond per dag (€, intern)">
          {(id) => (
            <input
              id={id}
              type="number"
              required
              min={0}
              max={1000}
              step={0.5}
              className="v1-input v1-adm-of-num"
              value={eur}
              onChange={(e) => setEur(e.target.value)}
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
