'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/app/v1/_ui/controls';
import { Button } from '@/app/v1/_ui/button';
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
      setResult({ ok: false, error: 'Er ging iets mis. Probeer het opnieuw.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="v1-card" style={{ maxWidth: 520 }}>
      <form onSubmit={onSubmit} className="v1-form">
        <Field label="Bedrijfsnaam">
          {(id) => (
            <input
              id={id}
              name="company_name"
              className="v1-input"
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          )}
        </Field>
        <Field label="E-mailadres eigenaar" hint="De eigenaar krijgt op dit adres een inloglink.">
          {(id) => (
            <input
              id={id}
              name="owner_email"
              type="email"
              className="v1-input"
              required
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button type="submit" loading={busy}>
            Klant aanmaken en uitnodigen
          </Button>
        </div>
        {result?.ok ? (
          <p role="status" className="v1-alert v1-alert--ok">
            Aangemaakt: <strong>{result.slug}</strong>.{' '}
            {result.invited ? 'Uitnodiging verstuurd.' : 'De eigenaar bestond al en is gekoppeld, zonder nieuwe uitnodiging.'}
          </p>
        ) : null}
        {result && !result.ok ? (
          <p role="alert" className="v1-alert v1-alert--error">
            {result.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
