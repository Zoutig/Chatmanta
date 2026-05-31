'use client';

// Klant-quiz, één vraag per keer (M4). Toont voortgang, contextzin, het
// vraagformaat (open textarea of meerkeuze + "Anders, namelijk"), en een
// consent-notice dat het antwoord zichtbaar wordt voor bezoekers. "Sla over"
// of "Volgende" → submitQuizAnswerAction; daarna router.refresh() → de server
// toont de volgende vraag of de bedankmelding.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitQuizAnswerAction } from '@/app/klantendashboard/actions';
import type { QuizQuestion } from '@/lib/controlroom/types';

const ANSWER_MAX = 2000;
const ANDERS = '__anders__';

export function QuizRunner({
  question,
  index,
  total,
}: {
  question: QuizQuestion;
  index: number; // aantal reeds beantwoord (0-based positie van deze vraag)
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState('');
  const [choice, setChoice] = useState('');
  const [anders, setAnders] = useState('');

  const pct = total > 0 ? Math.round((index / total) * 100) : 0;

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
      const res = await submitQuizAnswerAction(question.id, payload);
      if (res.ok) {
        setOpen('');
        setChoice('');
        setAnders('');
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

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      {/* Voortgang */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6, color: 'var(--klant-muted)' }}>
          <span>Vraag {index + 1} van {total}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--klant-surface-muted)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--klant-accent)' }} />
        </div>
      </div>

      {/* Categorie-header */}
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {question.categorieLabel ?? question.categorie}
      </div>

      {/* Contextzin (lichtgrijs) */}
      {question.context && (
        <div style={{ fontSize: 13, color: 'var(--klant-dim)' }}>{question.context}</div>
      )}

      {/* Vraag */}
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--klant-ink)' }}>{question.vraag}</div>

      {/* Antwoordveld */}
      {question.type === 'open' ? (
        <textarea
          className="klant-textarea"
          rows={4}
          maxLength={ANSWER_MAX}
          placeholder="Typ hier je antwoord…"
          value={open}
          disabled={pending}
          onChange={(e) => setOpen(e.target.value)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(question.opties ?? []).map((opt) => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="radio" name="optie" value={opt} checked={choice === opt} disabled={pending} onChange={() => setChoice(opt)} />
              {opt}
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="radio" name="optie" value={ANDERS} checked={choice === ANDERS} disabled={pending} onChange={() => setChoice(ANDERS)} />
            Anders, namelijk:
          </label>
          {choice === ANDERS && (
            <input
              className="klant-input"
              maxLength={ANSWER_MAX}
              placeholder="Vul je antwoord in…"
              value={anders}
              disabled={pending}
              onChange={(e) => setAnders(e.target.value)}
            />
          )}
        </div>
      )}

      {/* Consent-notice */}
      <div style={{ fontSize: 11.5, color: 'var(--klant-faint)' }}>
        Je antwoord wordt aan je kennisbank toegevoegd en kan door je chatbot aan bezoekers worden getoond.
      </div>

      {error && <div style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</div>}

      {/* Acties */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <button className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => submit(true)}>
          Sla over
        </button>
        <button className="klant-btn" data-variant="primary" disabled={pending || !canSubmit} onClick={() => submit(false)}>
          {pending ? 'Bezig…' : 'Volgende →'}
        </button>
      </div>
    </div>
  );
}
