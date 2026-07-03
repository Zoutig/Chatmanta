'use client';

// V1 — NotesEditor: port van V0 met V1 overlay-action.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNotesAction } from '../overlay-actions';

export function NotesEditor({ orgId, notes }: { orgId: string; notes: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(notes ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateNotesAction(orgId, value.trim() || null);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <textarea
        className="klant-textarea"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder="Interne notities: afspraken, bekende risico's, laatste feedback…"
        style={{ minHeight: 160 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="klant-btn" data-variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Opslaan…' : 'Notitie opslaan'}
        </button>
        {saved ? <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>Opgeslagen ✓</span> : null}
        {error ? <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span> : null}
      </div>
    </div>
  );
}
