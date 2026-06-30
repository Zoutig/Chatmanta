'use client';

// V1 Account — e-mail/wachtwoord via Supabase Auth (V1 browser-client), org-naam via
// owner-gated server-action. E-mailwijziging stuurt een bevestigingsmail; het adres
// hieronder komt uit de SESSIE (user.email), niet uit public.users (die mirror kan
// driften na een wijziging). Styling via het V0-klantendashboard-designsysteem
// (klant.css-classes, geladen door de /v1/app-shell). Alleen markup/className herstyled.

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/v1/client';
import { updateOrgNameAction } from './actions';

const inputStyle: React.CSSProperties = { maxWidth: 360 };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <EmailSection currentEmail={email} />
      <PasswordSection />
      <OrgNameSection initialName={orgName} isOwner={isOwner} />
    </div>
  );
}

function Status({ msg, error }: { msg: string | null; error: string | null }) {
  if (error) return <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>;
  if (msg) return <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>{msg}</span>;
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
    <form onSubmit={submit} className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="klant-section-title" style={{ margin: 0 }}>E-mailadres</h3>
      <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0 }}>
        Je huidige adres is <strong>{currentEmail}</strong>. Een wijziging vereist bevestiging via e-mail.
      </p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="klant-input" style={inputStyle} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={busy}>{busy ? 'Bezig…' : 'E-mail wijzigen'}</button>
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
    <form onSubmit={submit} className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="klant-section-title" style={{ margin: 0 }}>Wachtwoord</h3>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Nieuw wachtwoord"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="klant-input"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={busy}>{busy ? 'Bezig…' : 'Wachtwoord wijzigen'}</button>
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
    <form onSubmit={submit} className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="klant-section-title" style={{ margin: 0 }}>Organisatienaam</h3>
      {isOwner ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} className="klant-input" style={inputStyle} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="submit" className="klant-btn" data-variant="primary" disabled={pending || name.trim() === baseline.trim()}>
              {pending ? 'Bezig…' : 'Naam opslaan'}
            </button>
            <Status msg={msg} error={error} />
          </div>
        </>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: 0 }}>
          <strong>{initialName}</strong> — alleen de eigenaar van de organisatie kan de naam wijzigen.
        </p>
      )}
    </form>
  );
}
