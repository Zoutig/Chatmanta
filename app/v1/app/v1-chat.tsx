'use client';

import { useState, type FormEvent } from 'react';
import { askV1, type AskV1Result } from './actions';

export function V1Chat({ chatbotName }: { chatbotName: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskV1Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setResult(await askV1(question));
    setLoading(false);
  }

  return (
    <section style={{ marginTop: 16 }}>
      <p style={{ fontSize: 14, color: '#333' }}>
        Stel een vraag aan <strong>{chatbotName}</strong>.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Stel een vraag…"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Bezig…' : 'Vraag'}
        </button>
      </form>
      {result && (
        <div data-testid="v1-answer" style={{ marginTop: 20, whiteSpace: 'pre-wrap', fontSize: 14 }}>
          {result.ok ? (
            <>
              <p>{result.answer}</p>
              {result.sources.length > 0 && (
                <ul style={{ color: '#666', fontSize: 13 }}>
                  {result.sources.map((s, i) => (
                    <li key={i}>{s.title}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p style={{ color: '#b00' }}>Er ging iets mis ({result.error}).</p>
          )}
        </div>
      )}
    </section>
  );
}
