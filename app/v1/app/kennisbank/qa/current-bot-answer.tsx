'use client';

// "Wat antwoordt de bot nu?"-venster (Kennisbank › Q&A, ook op Gesprekken).
//
// Bewust ON-DEMAND (knop), niet automatisch: dit is een volwaardige, billable
// RAG-call (~8-15s). askV1 leidt de org af uit de sessie. Meldingen (dagbudget,
// maandlimiet, te veel verzoeken, geen antwoord) blijven inline (bijlage A, B).

import { useState, useTransition } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { askV1 } from '@/app/v1/app/actions';
import { Button } from '@/app/v1/_ui/button';
import '../kennisbank.css';

const ERROR_MESSAGES: Record<string, string> = {
  NO_CHATBOT: 'Er is nog geen chatbot ingesteld.',
  FORBIDDEN: 'Geen toegang.',
  RATE_LIMITED: 'Te veel verzoeken. Probeer het zo opnieuw.',
  BUDGET_EXHAUSTED: 'Dagbudget bereikt. Probeer het morgen opnieuw.',
  MONTHLY_LIMIT: 'Maandlimiet bereikt.',
  FAILED: 'De bot kon geen antwoord geven.',
};

export function CurrentBotAnswer({ question }: { question: string }) {
  // null = nog niet opgehaald; string = opgehaald antwoord.
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
        const res = await askV1(trimmed);
        if (res.ok) {
          setAnswer(res.answer);
        } else {
          setAnswer(null);
          setError(ERROR_MESSAGES[res.error] ?? 'De bot kon geen antwoord geven.');
        }
      } catch {
        setAnswer(null);
        setError('Het antwoord kon niet worden opgehaald.');
      }
    });
  }

  const hasResult = answer !== null;

  return (
    <div className="v1-kb-bot">
      <div className="v1-kb-bot-bar">
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchAnswer}
          disabled={disabled}
          title={trimmed ? 'Stel deze vraag aan je chatbot' : 'Vul eerst een vraag in'}
        >
          {hasResult ? (
            <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
          )}
          {hasResult ? 'Opnieuw ophalen' : 'Toon wat de bot nu antwoordt'}
        </Button>
        {pending && (
          <span className="v1-kb-thinking" role="status">
            <span className="v1-spinner" aria-hidden="true" />
            De bot denkt na
          </span>
        )}
      </div>

      {error && !pending && (
        <p className="v1-alert v1-alert--error" role="alert">
          {error}
        </p>
      )}

      {hasResult && !pending && (
        <div className="v1-kb-bot-answer">
          <p className="v1-kb-bot-label">Wat je chatbot nu antwoordt</p>
          <p className="v1-kb-bot-text">
            {answer && answer.trim() ? answer : 'De bot gaf geen tekstantwoord.'}
          </p>
        </div>
      )}
    </div>
  );
}
