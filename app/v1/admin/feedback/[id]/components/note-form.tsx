'use client';

// Interne notitie of reactie toevoegen aan een feedbackmelding (V1-ontwerplaag).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addFeedbackNoteV1Action } from '@/app/v1/admin/feedback/actions';
import { Field } from '@/app/v1/_ui/controls';
import { Button } from '@/app/v1/_ui/button';

const MAX = 4000;

export function FeedbackNoteFormV1({ id }: { id: string }) {
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
      const res = await addFeedbackNoteV1Action(id, kind, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  return (
    <div className="v1-form">
      <Field label="Soort">
        {(fieldId) => (
          <select
            id={fieldId}
            className="v1-input v1-adm-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'internal_note' | 'comment')}
          >
            <option value="internal_note">Interne notitie</option>
            <option value="comment">Reactie</option>
          </select>
        )}
      </Field>
      <Field label="Tekst" hint={`${body.length}/${MAX} tekens`}>
        {(fieldId) => (
          <textarea
            id={fieldId}
            className="v1-input"
            rows={3}
            maxLength={MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Schrijf een notitie of reactie…"
          />
        )}
      </Field>
      <div className="v1-adm-inline">
        <Button variant="primary" size="sm" loading={pending} disabled={!body.trim()} onClick={submit}>
          {pending ? 'Bezig…' : 'Toevoegen'}
        </Button>
        {error && <span className="v1-adm-danger" role="alert">{error}</span>}
      </div>
    </div>
  );
}
