'use client';

// Bewerkbare account-display-velden (Niels item 8): bedrijfsnaam, contactpersoon
// en e-mail. Slaat op via saveAccountInfoAction → v0_org_settings.account. Bewust
// demo-data: dit is GEEN login/identiteit (V1) en de e-mail wordt nergens als
// verzend-adres gebruikt. Leeg laten = terug naar de standaardwaarde.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, User, Mail } from 'lucide-react';
import { saveAccountInfoAction } from '@/app/klantendashboard/actions';

export function AccountEditForm({
  initial,
}: {
  initial: { companyName: string; contactPerson: string; email: string };
}) {
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [contactPerson, setContactPerson] = useState(initial.contactPerson);
  const [email, setEmail] = useState(initial.email);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const dirty =
    companyName !== initial.companyName ||
    contactPerson !== initial.contactPerson ||
    email !== initial.email;

  const save = () => {
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const res = await saveAccountInfoAction({
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field icon={Building2} label="Bedrijfsnaam" value={companyName} onChange={setCompanyName} placeholder="Naam van je bedrijf" disabled={pending} />
      <Field icon={User} label="Contactpersoon" value={contactPerson} onChange={setContactPerson} placeholder="Voor- en achternaam" disabled={pending} />
      <Field icon={Mail} label="E-mailadres" value={email} onChange={setEmail} placeholder="naam@bedrijf.nl" type="email" disabled={pending} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
        <button
          type="button"
          className="klant-btn"
          data-variant="primary"
          disabled={pending || !dirty}
          onClick={save}
        >
          {pending ? 'Opslaan…' : 'Opslaan'}
        </button>
        {error && <span style={{ fontSize: 12.5, color: 'var(--klant-danger)' }} role="alert">{error}</span>}
        {saved && !error && <span style={{ fontSize: 12.5, color: 'var(--klant-success)' }} role="status">Opgeslagen.</span>}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--klant-fg-dim)', margin: 0, lineHeight: 1.5 }}>
        Dit zijn je weergavegegevens. Je inloggegevens wijzig je later in V1. Leeg laten zet een veld
        terug op de standaardwaarde.
      </p>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--klant-fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        <Icon size={13} strokeWidth={1.7} /> {label}
      </span>
      <input
        className="klant-input"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
