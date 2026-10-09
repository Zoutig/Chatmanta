'use client';

// V1 — NotesEditor: port van V0 met V1 overlay-action.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNotesAction } from '../overlay-actions';
import { Check } from 'lucide-react';
import { Button } from '@/app/v1/_ui/button';
import '../org-forms.css';

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
    <div className="v1-form">
      <textarea
        className="v1-input"
        aria-label="Interne notities"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder="Interne notities: afspraken, bekende risico's, laatste feedback..."
        style={{ minHeight: 160 }}
      />
      <div className="v1-adm-of-actions">
        <Button variant="primary" onClick={save} loading={pending}>
          Notitie opslaan
        </Button>
        {saved ? (
          <span className="v1-saved" role="status">
            <Check size={14} /> Opgeslagen
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
