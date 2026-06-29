'use client';

// V1 Account — e-mail/wachtwoord via Supabase Auth (V1 browser-client), org-naam via
// owner-gated server-action. E-mailwijziging stuurt een bevestigingsmail; het adres
// hieronder komt uit de SESSIE (user.email), niet uit public.users (die mirror kan
// driften na een wijziging). Bewust inline styles: /v1 laadt klant.css niet.

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/v1/client';
import { updateOrgNameAction } from './actions';

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  padding: 8,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 6,
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = { padding: '8px 16px', fontSize: 14, cursor: 'pointer' };

export function AccountForm({
  email,
  orgName,
  isOwner,
}: {
  email: string;
  orgName: string;
  isOwner: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <EmailSection currentEmail={email} />
      <PasswordSection />
      <OrgNameSection initialName={orgName} isOwner={isOwner} />
    </div>
  );
}

function Status({ msg, error }: { msg: string | null; error: string | null }) {
  if (error) return <span role="alert" style={{ fontSize: 13, color: '#b00020' }}>{error}</span>;
  if (msg) return <span style={{ fontSize: 13, color: '#0a0' }}>{msg}</span>;
  return null;
}

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    if (!email.trim() || email.trim() === currentEmail) {
      setError('Vul een nieuw e-mailadres in.');
      return;
    }
    setBusy(true);
    const { error: updErr } = await createClient().auth.updateUser({ email: email.trim() });
    setBusy(false);
    if (updErr) setError(updErr.message);
    else setMsg('Bevestigingsmail verstuurd — bevestig via de link om de wijziging af te ronden.');
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>E-mailadres</h2>
      <p style={{ fontSize: 13, color: '#777', margin: 0 }}>
        Je huidige adres is <strong>{currentEmail}</strong>. Een wijziging vereist bevestiging via e-mail.
      </p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={btnStyle}>{busy ? 'Bezig…' : 'E-mail wijzigen'}</button>
        <Status msg={msg} error={error} />
      </div>
    </form>
  );
}

function PasswordSection() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    if (pw.length < 8) {
      setError('Kies een wachtwoord van minstens 8 tekens.');
      return;
    }
    setBusy(true);
    const { error: updErr } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (updErr) setError(updErr.message);
    else {
      setMsg('Wachtwoord gewijzigd.');
      setPw('');
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>Wachtwoord</h2>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Nieuw wachtwoord"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={btnStyle}>{busy ? 'Bezig…' : 'Wachtwoord wijzigen'}</button>
        <Status msg={msg} error={error} />
      </div>
    </form>
  );
}

function OrgNameSection({ initialName, isOwner }: { initialName: string; isOwner: boolean }) {
  const [name, setName] = useState(initialName);
  const [baseline, setBaseline] = useState(initialName);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await updateOrgNameAction(name);
      if (res.ok) {
        setName(res.name);
        setBaseline(res.name);
        setMsg('Opgeslagen.');
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>Organisatienaam</h2>
      {isOwner ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="submit" disabled={pending || name.trim() === baseline.trim()} style={btnStyle}>
              {pending ? 'Bezig…' : 'Naam opslaan'}
            </button>
            <Status msg={msg} error={error} />
          </div>
        </>
      ) : (
        <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
          <strong>{initialName}</strong> — alleen de eigenaar van de organisatie kan de naam wijzigen.
        </p>
      )}
    </form>
  );
}
