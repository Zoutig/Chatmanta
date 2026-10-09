'use client';

// Notities per recap — V1 variant.
// Enige verschil t.o.v. V0: prop heet `orgId` i.p.v. `orgSlug`,
// en de action-import komt uit de V1 actions.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
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
    <div className="v1-form">
      <textarea
        className="v1-input"
        aria-label="Notities voor deze maand"
        value={notes}
        maxLength={NOTES_MAX}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder="Schrijf hier je observaties voor deze maand…"
      />
      <div className="v1-adm-inline">
        <Button variant="primary" size="sm" onClick={save} loading={pending}>
          {pending ? 'Bezig…' : 'Opslaan'}
        </Button>
        {saved ? (
          <span role="status" className="v1-adm-muted">
            Opgeslagen
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="v1-adm-danger">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
