'use client';

import { useState, type FormEvent } from 'react';
import { askV1, type AskV1Result } from '../actions';

type AskV1Error = Extract<AskV1Result, { ok: false }>['error'];

/** Code → klant-vriendelijke NL-melding (askV1 retourneert alleen de code). */
function errorMessage(code: AskV1Error): string {
  switch (code) {
    case 'NO_CHATBOT':
      return 'Er is nog geen chatbot ingesteld voor deze organisatie.';
    case 'FORBIDDEN':
      return 'Je hebt geen toegang tot deze chatbot.';
    case 'RATE_LIMITED':
      return 'Het is nu erg druk. Probeer het zo dadelijk opnieuw.';
    case 'MONTHLY_LIMIT':
      return 'De maandelijkse gesprekslimiet is bereikt. Probeer het volgende maand opnieuw.';
    case 'BUDGET_EXHAUSTED':
      return 'Het daglimiet van deze chatbot is bereikt. Probeer het morgen opnieuw.';
    case 'FAILED':
    default:
      return 'Er ging iets mis. Probeer het opnieuw.';
  }
}

export function V1Chat({ chatbotName }: { chatbotName: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskV1Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await askV1(question));
    } catch {
      // askV1 hoort altijd een AskV1Result te returnen; dit vangnet zorgt dat een
      // onverwachte rejection de knop niet permanent op 'Bezig…' laat staan.
      setResult({ ok: false, error: 'FAILED' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="klant-card" style={{ width: 'min(560px, 100%)' }}>
      <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: '0 0 12px' }}>
        Stel een vraag aan <strong style={{ color: 'var(--klant-ink)' }}>{chatbotName}</strong> en
        zie het antwoord dat je bezoekers krijgen.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 10 }}>
        <input
          className="klant-input"
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Stel een vraag…"
        />
        <button
          type="submit"
          className="klant-ui-btn"
          data-variant="primary"
          data-size="md"
          disabled={loading}
          style={{ flexShrink: 0 }}
        >
          {loading ? 'Bezig…' : 'Vraag'}
        </button>
      </form>
      {result && (
        <div
          data-testid="v1-answer"
          style={{
            marginTop: 18,
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            color: 'var(--klant-ink)',
          }}
        >
          {result.ok ? (
            <>
              <p style={{ margin: 0 }}>{result.answer}</p>
              {result.sources.length > 0 && (
                <ul style={{ color: 'var(--klant-muted)', fontSize: 13, marginTop: 10 }}>
                  {result.sources.map((s, i) => (
                    <li key={i}>{s.title}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--klant-danger)', margin: 0 }}>{errorMessage(result.error)}</p>
          )}
        </div>
      )}
    </div>
  );
}
