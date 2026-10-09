'use client';

// Reactie per e-mail naar de indiener van een feedbackmelding (V1-ontwerplaag).
// Flow ongewijzigd: tekst schrijven, bevestigen, versturen.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendFeedbackReplyV1Action } from '@/app/v1/admin/feedback/actions';
import { Field } from '@/app/v1/_ui/controls';
import { Button } from '@/app/v1/_ui/button';

const MAX = 4000;

export function FeedbackReplyFormV1({
  id,
  submitterEmail,
  disabledReason,
}: {
  id: string;
  submitterEmail: string | null;
  disabledReason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: boolean; detail: string } | null>(null);
  const router = useRouter();

  if (disabledReason) {
    return <p className="v1-adm-muted">{disabledReason}</p>;
  }

  const send = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('De reactie mag niet leeg zijn.');
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await sendFeedbackReplyV1Action(id, trimmed);
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      setResult({ sent: res.sent, detail: res.detail });
      setBody('');
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="v1-form">
      <Field
        label="Reactie"
        hint={
          <>
            Gaat per e-mail naar <strong>{submitterEmail}</strong>. De klant ontvangt alleen deze tekst.{' '}
            {body.length}/{MAX} tekens
          </>
        }
      >
        {(fieldId) => (
          <textarea
            id={fieldId}
            className="v1-input"
            rows={4}
            maxLength={MAX}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setResult(null);
            }}
            placeholder="Schrijf je reactie naar de klant…"
            disabled={pending}
          />
        )}
      </Field>
      {!confirming ? (
        <div className="v1-adm-inline">
          <Button
            variant="primary"
            size="sm"
            disabled={pending || !body.trim()}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Reactie versturen&hellip;
          </Button>
        </div>
      ) : (
        <div className="v1-adm-fbd-confirm">
          <span>
            Verstuur deze reactie per e-mail naar <strong>{submitterEmail}</strong>?
          </span>
          <div className="v1-adm-inline">
            <Button variant="primary" size="sm" loading={pending} onClick={send}>
              {pending ? 'Versturen…' : 'Ja, versturen'}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      )}
      {error && <p className="v1-alert v1-alert--error" role="alert">{error}</p>}
      {result && (
        <p className={`v1-alert ${result.sent ? 'v1-alert--ok' : 'v1-alert--error'}`} role="status">
          {result.detail}
        </p>
      )}
    </div>
  );
}
