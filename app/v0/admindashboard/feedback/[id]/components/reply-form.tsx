'use client';

// Reactie-naar-klant per e-mail (Niels item 3). Stuurt de zelf-getypte tekst via
// sendFeedbackReplyAction naar het indiener-adres. Bewuste drempel: een
// confirm-stap die het ontvangende adres toont (voorkomt per-ongeluk versturen
// naar een onbekende derde), en het verzendresultaat wordt getoond i.p.v.
// stil-geslikt. Bij ontbrekend adres/toestemming is het formulier uitgeschakeld
// met uitleg.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendFeedbackReplyAction } from '@/app/actions/controlroom';

const MAX = 4000;

export function FeedbackReplyForm({
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
    return (
      <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: 0 }}>{disabledReason}</p>
    );
  }

  const send = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('De reactie mag niet leeg zijn.');
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await sendFeedbackReplyAction(id, trimmed);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12.5, color: 'var(--klant-muted)', margin: 0 }}>
        Stuur een reactie per e-mail naar <strong>{submitterEmail}</strong>. De klant ontvangt
        alleen jouw tekst hieronder.
      </p>
      <textarea
        className="klant-textarea"
        rows={4}
        maxLength={MAX}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setResult(null);
        }}
        placeholder="Schrijf je reactie naar de klant…"
        style={{ resize: 'vertical' }}
        disabled={pending}
      />
      {!confirming ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="klant-btn"
            data-variant="primary"
            disabled={pending || !body.trim()}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Reactie versturen…
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--klant-dim)' }}>{body.length}/{MAX}</span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 12px',
            background: 'var(--klant-warn-soft)',
            border: '1px solid var(--klant-warn-border)',
            borderRadius: 'var(--klant-r-md)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--klant-ink)' }}>
            Verstuur deze reactie per e-mail naar <strong>{submitterEmail}</strong>?
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="klant-btn" data-variant="primary" disabled={pending} onClick={send}>
              {pending ? 'Versturen…' : 'Ja, versturen'}
            </button>
            <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
      {error && <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">{error}</span>}
      {result && (
        <span
          style={{ fontSize: 12.5, color: result.sent ? 'var(--klant-success)' : 'var(--klant-danger)' }}
          role="status"
        >
          {result.detail}
        </span>
      )}
    </div>
  );
}
