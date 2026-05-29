'use client';

// Interne klantnotitie (profile.notes) — vrije tekst, schrijft via
// updateProfileAction. Bewust simpel in V0 (één veld i.p.v. de losse
// algemene/technische/support-notities uit het MD).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction } from '@/app/actions/controlroom';

export function NotesEditor({ orgSlug, notes }: { orgSlug: string; notes: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(notes ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateProfileAction(orgSlug, { notes: value.trim() || null });
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
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
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
