'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/app/klantendashboard/components/ui/card';
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
    <Card>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="klant-label" htmlFor="company_name">Bedrijfsnaam</label>
          <input
            id="company_name"
            name="company_name"
            className="klant-input"
            required
            minLength={2}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div>
          <label className="klant-label" htmlFor="owner_email">E-mail owner</label>
          <input
            id="owner_email"
            name="owner_email"
            type="email"
            className="klant-input"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <p className="klant-hint">De owner krijgt een magic-link-uitnodiging op dit adres.</p>
        </div>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? 'Bezig…' : 'Klant aanmaken + uitnodigen'}
        </button>
        {result?.ok && (
          <p role="status" style={{ color: 'var(--klant-success)', fontSize: 13, margin: 0 }}>
            Aangemaakt: org <strong>{result.slug}</strong>.{' '}
            {result.invited ? 'Uitnodiging verstuurd.' : 'Owner bestond al — gekoppeld zonder nieuwe uitnodiging.'}
          </p>
        )}
        {result && !result.ok && (
          <p role="alert" style={{ color: 'var(--klant-danger)', fontSize: 13, margin: 0 }}>
            {result.error}
          </p>
        )}
      </form>
    </Card>
  );
}
