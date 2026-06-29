'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClientOrganization, type CreateOrgResult } from '../actions';

export function NewOrgForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateOrgResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await createClientOrganization(companyName, ownerEmail);
      setResult(r);
      if (r.ok) {
        setCompanyName('');
        setOwnerEmail('');
        router.refresh(); // ververst de lijst-pagina als de admin terugnavigeert
      }
    } catch {
      setResult({ ok: false, error: 'Er ging iets mis.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Bedrijfsnaam
        <input
          name="company_name"
          required
          minLength={2}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          style={{ padding: 10, fontSize: 14 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        E-mail owner
        <input
          name="owner_email"
          type="email"
          required
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          style={{ padding: 10, fontSize: 14 }}
        />
      </label>
      <button type="submit" disabled={busy} style={{ padding: 10, fontSize: 14, cursor: 'pointer' }}>
        {busy ? 'Bezig…' : 'Klant aanmaken + uitnodigen'}
      </button>
      {result?.ok && (
        <p role="status" style={{ color: '#0a6', fontSize: 13, margin: 0 }}>
          Aangemaakt: org <strong>{result.slug}</strong>.{' '}
          {result.invited ? 'Uitnodiging verstuurd.' : 'Owner bestond al — gekoppeld zonder nieuwe uitnodiging.'}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" style={{ color: '#b00020', fontSize: 13, margin: 0 }}>
          {result.error}
        </p>
      )}
    </form>
  );
}
