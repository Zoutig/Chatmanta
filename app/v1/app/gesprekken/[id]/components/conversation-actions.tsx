'use client';

// V1-fork van @/app/klantendashboard/gesprekken/[id]/components/conversation-actions.
// UI verbatim van V0; wired aan echte server actions in ../../actions.ts.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Plus } from 'lucide-react';
import { markConversationResolvedAction } from '../../actions';

// "Maak Q&A" slaat niets direct op: het opent het Q&A-venster in de Kennisbank met
// de vraag al ingevuld. Pas na "Opslaan" (met een ingevuld antwoord) komt het erin.
const QA_HREF = '/v1/app/kennisbank?tab=qa&prefillQuestion=';

export function ConversationActions({
  threadId,
  suggestedQuestion,
  isUnanswered,
}: {
  threadId: string;
  suggestedQuestion: string;
  isUnanswered: boolean;
}) {
  const [resolved, setResolved] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvePending, startResolve] = useTransition();

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

      {suggestedQuestion && (
        <Link
          href={`${QA_HREF}${encodeURIComponent(suggestedQuestion)}`}
          className="klant-btn"
          data-variant="primary"
          style={{ justifyContent: 'flex-start' }}
        >
          <Plus size={14} strokeWidth={1.8} />
          Maak Q&A van deze vraag
        </Link>
      )}
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
