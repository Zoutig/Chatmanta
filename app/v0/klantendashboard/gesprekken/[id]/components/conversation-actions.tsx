'use client';

import { useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';

export function ConversationActions({
  suggestedQuestion,
  isUnanswered,
}: {
  suggestedQuestion: string;
  isUnanswered: boolean;
}) {
  const [resolved, setResolved] = useState(false);
  const [savedAsQA, setSavedAsQA] = useState(false);

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="klant-section-title">Acties</h3>

      <button
        type="button"
        onClick={() => {
          // Mock: in V1 wordt dit een server action die de Q&A persisteert.
          setSavedAsQA(true);
          setTimeout(() => setSavedAsQA(false), 2500);
        }}
        className="klant-btn"
        data-variant="primary"
        disabled={savedAsQA}
        style={{ justifyContent: 'flex-start' }}
      >
        <Plus size={14} strokeWidth={1.8} />
        {savedAsQA ? 'Toegevoegd!' : 'Maak Q&A van deze vraag'}
      </button>
      {suggestedQuestion && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--klant-fg-dim)',
            background: 'var(--klant-surface)',
            padding: '8px 10px',
            borderRadius: 'var(--klant-r-sm)',
            lineHeight: 1.5,
          }}
        >
          <em>&ldquo;{suggestedQuestion}&rdquo;</em>
        </div>
      )}

      {isUnanswered && (
        <button
          type="button"
          onClick={() => setResolved((v) => !v)}
          className="klant-btn"
          style={{ justifyContent: 'flex-start' }}
        >
          <CheckCircle2 size={14} strokeWidth={1.8} />
          {resolved ? 'Gemarkeerd als opgelost' : 'Markeer als opgelost'}
        </button>
      )}

      <p style={{ fontSize: 11, color: 'var(--klant-fg-dim)', margin: '4px 0 0', lineHeight: 1.5 }}>
        In v0 zijn deze acties mock — bij v1 worden ze persistent opgeslagen in je kennisbank.
      </p>
    </div>
  );
}
