'use client';

// V0 Klantendashboard — "Wat antwoordt de bot nu?"-paneel (M8, item 11).
//
// Een herbruikbaar blokje dat naast het Q&A-antwoordveld staat. De klant
// herschrijft met Q&A het antwoord dat de AI geeft; om te kunnen beoordelen
// of een herschrijving nodig is, kan hij hier op aanvraag zien wat de chatbot
// op dit moment zélf antwoordt.
//
// Bewust ON-DEMAND (knop), niet automatisch: dit is een volwaardige, billable
// RAG-call (~8-15s). We hergebruiken de dashboard-veilige askTestQuestion
// server action (org wordt server-side uit de cookie afgeleid) i.p.v. /api/v0/chat.

import { useState, useTransition } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { askTestQuestion } from '../../test/actions';

export function CurrentBotAnswer({ question }: { question: string }) {
  // null = nog niet opgehaald; string = opgehaald antwoord; '' wordt nooit getoond.
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = question.trim();
  const disabled = pending || trimmed.length === 0;

  function fetchAnswer() {
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await askTestQuestion(trimmed);
        if (res.ok) {
          setAnswer(res.response.answer);
        } else {
          setAnswer(null);
          setError(res.error || 'De bot kon geen antwoord geven.');
        }
      } catch {
        setAnswer(null);
        setError('Er ging iets mis bij het ophalen van het antwoord.');
      }
    });
  }

  const hasResult = answer !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={fetchAnswer}
          className="klant-btn"
          data-variant="ghost"
          disabled={disabled}
          style={{ fontSize: 12 }}
          title={
            trimmed
              ? 'Voer een echte test-vraag uit op je chatbot'
              : 'Vul eerst een vraag in'
          }
        >
          {hasResult ? (
            <RefreshCw size={13} strokeWidth={2} />
          ) : (
            <Sparkles size={13} strokeWidth={2} />
          )}
          {hasResult ? 'Opnieuw ophalen' : 'Toon wat de bot nu antwoordt'}
        </button>
        {pending && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--klant-fg-muted)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                border: '2px solid var(--klant-border)',
                borderTopColor: 'var(--klant-accent)',
                display: 'inline-block',
                animation: 'klant-cba-spin 0.7s linear infinite',
              }}
            />
            De bot denkt na…
          </span>
        )}
      </div>

      <style>{`@keyframes klant-cba-spin { to { transform: rotate(360deg); } }`}</style>

      {error && !pending && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--klant-r-sm)',
            background: 'var(--klant-danger-soft)',
            color: 'var(--klant-danger)',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {hasResult && !pending && (
        <div
          style={{
            border: '1px solid var(--klant-border)',
            borderRadius: 'var(--klant-r-sm)',
            background: 'var(--klant-surface-muted)',
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: 'var(--klant-fg-dim)',
              marginBottom: 6,
            }}
          >
            Wat je chatbot nu antwoordt
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--klant-fg-muted)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {answer && answer.trim() ? answer : 'De bot gaf geen tekstantwoord.'}
          </p>
        </div>
      )}
    </div>
  );
}
