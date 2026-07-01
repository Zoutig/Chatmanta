'use client';

// V1-fork van @/app/klantendashboard/gesprekken/[id]/components/conversation-actions.
// UI verbatim van V0; wired aan echte server actions in ../../actions.ts.

import { useState, useTransition } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import {
  addQAFromConversationAction,
  markConversationResolvedAction,
} from '../../actions';

export function ConversationActions({
  threadId,
  suggestedQuestion,
  suggestedAnswer,
  isUnanswered,
}: {
  threadId: string;
  suggestedQuestion: string;
  suggestedAnswer: string;
  isUnanswered: boolean;
}) {
  const [savedAsQA, setSavedAsQA] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [qaPending, startQa] = useTransition();
  const [resolvePending, startResolve] = useTransition();

  function handleAddQA() {
    setQaError(null);
    startQa(async () => {
      const res = await addQAFromConversationAction(threadId, suggestedQuestion, suggestedAnswer);
      if (res.ok) {
        setSavedAsQA(true);
        setTimeout(() => setSavedAsQA(false), 2500);
      } else {
        setQaError(res.error ?? 'Er ging iets mis.');
      }
    });
  }

  function handleResolve() {
    setResolveError(null);
    startResolve(async () => {
      const res = await markConversationResolvedAction(threadId);
      if (res.ok) {
        setResolved(true);
      } else {
        setResolveError(res.error ?? 'Er ging iets mis.');
      }
    });
  }

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="klant-section-title">Acties</h3>

      <button
        type="button"
        onClick={handleAddQA}
        className="klant-btn"
        data-variant="primary"
        disabled={qaPending || savedAsQA}
        style={{ justifyContent: 'flex-start' }}
      >
        <Plus size={14} strokeWidth={1.8} />
        {qaPending ? 'Bezig…' : savedAsQA ? 'Toegevoegd!' : 'Maak Q&A van deze vraag'}
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
      {qaError && (
        <p style={{ fontSize: 11, color: 'var(--klant-danger, #c0392b)', margin: 0 }}>{qaError}</p>
      )}

      {isUnanswered && !resolved && (
        <button
          type="button"
          onClick={handleResolve}
          className="klant-btn"
          disabled={resolvePending}
          style={{ justifyContent: 'flex-start' }}
        >
          <CheckCircle2 size={14} strokeWidth={1.8} />
          {resolvePending ? 'Bezig…' : 'Markeer als opgelost'}
        </button>
      )}
      {resolved && (
        <button
          type="button"
          className="klant-btn"
          disabled
          style={{ justifyContent: 'flex-start' }}
        >
          <CheckCircle2 size={14} strokeWidth={1.8} />
          Gemarkeerd als opgelost
        </button>
      )}
      {resolveError && (
        <p style={{ fontSize: 11, color: 'var(--klant-danger, #c0392b)', margin: 0 }}>
          {resolveError}
        </p>
      )}
    </div>
  );
}
