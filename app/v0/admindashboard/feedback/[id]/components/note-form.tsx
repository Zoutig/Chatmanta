'use client';

// Notitie/reactie-invoer voor een melding (admin_feedback). Schrijft een append-only
// event (internal_note of comment) via addFeedbackNoteAction; router.refresh()
// ververst de historie-lijst meteen.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addFeedbackNoteAction } from '@/app/actions/controlroom';

const MAX = 4000;

export function FeedbackNoteForm({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'internal_note' | 'comment'>('internal_note');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('Notitie mag niet leeg zijn.');
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await addFeedbackNoteAction(id, kind, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="fb-note-kind" className="klant-label" style={{ margin: 0 }}>Soort</label>
        <select
          id="fb-note-kind"
          className="klant-select"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'internal_note' | 'comment')}
          style={{ width: 'auto' }}
        >
          <option value="internal_note">Interne notitie</option>
          <option value="comment">Reactie</option>
        </select>
      </div>
      <textarea
        className="klant-textarea"
        rows={3}
        maxLength={MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Schrijf een notitie of reactie…"
        style={{ resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          className="klant-btn"
          data-variant="primary"
          disabled={pending || !body.trim()}
          onClick={submit}
        >
          {pending ? 'Bezig…' : 'Toevoegen'}
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--klant-dim)' }}>{body.length}/{MAX}</span>
        {error && <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">{error}</span>}
      </div>
    </div>
  );
}
