'use client';

// V1 klant-quiz runner (V1-ontwerplaag). Zelfde action en payload als de V0-port:
// submitQuizAnswerV1Action. Na de laatste vraag een Toast; de server-pagina toont
// daarna de afgeronde staat met een knop terug naar de Kennisbank.

import { useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { submitQuizAnswerV1Action } from './actions';
import type { QuizQuestion } from '@/lib/controlroom/types';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';

const ANSWER_MAX = 2000;
const ANDERS = '__anders__';

export function QuizRunner({ question, index, total }: { question: QuizQuestion; index: number; total: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState('');
  const [choice, setChoice] = useState('');
  const [anders, setAnders] = useState('');

  const pct = total > 0 ? Math.round((index / total) * 100) : 0;
  const titleId = `qz-q-${question.id}`;

  function submit(skip: boolean) {
    setError(null);
    const payload = skip
      ? { skip: true }
      : question.type === 'meerkeuze'
        ? {
            meerkeuzeOptie: choice === ANDERS ? 'Anders' : choice || null,
            andersTekst: choice === ANDERS ? anders : null,
          }
        : { antwoord: open };
    start(async () => {
      const res = await submitQuizAnswerV1Action(question.id, payload);
      if (res.ok) {
        setOpen('');
        setChoice('');
        setAnders('');
        if (res.done) toast.success('Quiz afgerond. Je antwoorden staan in je kennisbank.');
        router.refresh();
      } else {
        setError(res.error ?? 'Er ging iets mis. Probeer het opnieuw.');
      }
    });
  }

  const canSubmit =
    question.type === 'meerkeuze'
      ? choice !== '' && (choice !== ANDERS || anders.trim().length > 0)
      : open.trim().length > 0;

  const options = [
    ...(question.opties ?? []).map((o) => ({ value: o, label: o })),
    { value: ANDERS, label: 'Anders, namelijk' },
  ];

  function onOptionsKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const i = options.findIndex((o) => o.value === choice);
    const n = options.length;
    const next = options[i < 0 ? (forward ? 0 : n - 1) : (i + (forward ? 1 : n - 1)) % n];
    setChoice(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  }

  return (
    <section className="v1-card v1-qz-card" aria-labelledby={titleId}>
      <div className="v1-qz-progress">
        <p className="v1-qz-progress-text">
          Vraag {index + 1} van {total}
        </p>
        <div
          className="v1-bar"
          role="progressbar"
          aria-label="Voortgang"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="v1-qz-q">
        <p className="v1-qz-cat">{question.categorieLabel ?? question.categorie}</p>
        <h2 id={titleId} className="v1-qz-title">
          {question.vraag}
        </h2>
        {question.context ? <p className="v1-qz-context">{question.context}</p> : null}
      </div>

      {question.type === 'open' ? (
        <textarea
          className="v1-input"
          aria-labelledby={titleId}
          rows={4}
          maxLength={ANSWER_MAX}
          placeholder="Typ hier je antwoord"
          value={open}
          disabled={pending}
          onChange={(e) => setOpen(e.target.value)}
        />
      ) : (
        <div className="v1-qz-options" role="radiogroup" aria-labelledby={titleId} onKeyDown={onOptionsKey}>
          {options.map((o, i) => {
            const checked = choice === o.value;
            const focusable = checked || (choice === '' && i === 0);
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={focusable ? 0 : -1}
                data-value={o.value}
                className="v1-qz-option"
                disabled={pending}
                onClick={() => setChoice(o.value)}
              >
                <span className="v1-qz-radio" aria-hidden="true" />
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {question.type !== 'open' && choice === ANDERS ? (
        <input
          className="v1-input"
          aria-label="Jouw antwoord"
          maxLength={ANSWER_MAX}
          placeholder="Vul je antwoord in"
          value={anders}
          disabled={pending}
          autoFocus
          onChange={(e) => setAnders(e.target.value)}
        />
      ) : null}

      <p className="v1-hint">Je antwoord komt in je kennisbank. Je chatbot kan het aan bezoekers laten zien.</p>

      {error ? (
        <p className="v1-alert v1-alert--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="v1-qz-actions">
        <Button variant="ghost" disabled={pending} onClick={() => submit(true)}>
          Sla over
        </Button>
        <Button loading={pending} disabled={!canSubmit} onClick={() => submit(false)}>
          Volgende
        </Button>
      </div>
    </section>
  );
}
