'use client';

// Notities per recap — V1 variant.
// Enige verschil t.o.v. V0: prop heet `orgId` i.p.v. `orgSlug`,
// en de action-import komt uit de V1 actions.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecapNotesAction } from '@/app/v1/admin/maandelijkse-recap/actions';

const NOTES_MAX = 8000;

export function NotesEditor({
  orgId,
  year,
  month,
  initialNotes,
}: {
  orgId: string;
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
      const res = await saveRecapNotesAction(orgId, year, month, notes);
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
        <button
          type="button"
          className="klant-btn"
          data-variant="primary"
          onClick={save}
          disabled={pending}
        >
          {pending ? 'Bezig…' : 'Opslaan'}
        </button>
        {saved ? (
          <span style={{ fontSize: 12.5, color: 'var(--klant-success)' }}>Opgeslagen</span>
        ) : null}
        {error ? (
          <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}
