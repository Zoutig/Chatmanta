'use client';

// Notities van Niels per recap. Opslaan via saveRecapNotesAction; behouden bij
// (her)genereren. useTransition-disabled tegen dubbel-submits.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecapNotesAction } from '@/app/actions/recap';

const NOTES_MAX = 8000;

export function NotesEditor({
  orgSlug,
  year,
  month,
  initialNotes,
}: {
  orgSlug: string;
  year: number;
  month: number;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveRecapNotesAction(orgSlug, year, month, notes);
      if (!res.ok) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <textarea
        className="klant-textarea"
        value={notes}
        maxLength={NOTES_MAX}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder="Schrijf hier je observaties voor deze maand…"
        style={{ width: '100%', resize: 'vertical', minHeight: 96 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button type="button" className="klant-btn" data-variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Bezig…' : 'Opslaan'}
        </button>
        {saved ? <span style={{ fontSize: 12.5, color: 'var(--klant-success)' }}>Opgeslagen</span> : null}
        {error ? <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }}>{error}</span> : null}
      </div>
    </div>
  );
}
