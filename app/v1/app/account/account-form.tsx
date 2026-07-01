'use client';

// V1 Account — e-mail/wachtwoord via Supabase Auth (V1 browser-client), org-naam via
// owner-gated server-action, + verbruik/workspace-info in een rechterkolom.
// Spiegelt de V0 Account-pagina-layout: 2-koloms grid (links auth, rechts info/metrics).
// Styling via het V0-klantendashboard-designsysteem (klant.css-classes).

import { useState, useTransition } from 'react';
import { Database, MessagesSquare, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { updateOrgNameAction } from './actions';

const inputStyle: React.CSSProperties = { maxWidth: 360 };

export function AccountForm({
  email,
  orgName,
  isOwner,
  orgId,
  conversationsThisMonth,
  documentsCount,
}: {
  email: string;
  orgName: string;
  isOwner: boolean;
  orgId: string;
  conversationsThisMonth: number;
  documentsCount: number;
}) {
  return (
    <div
      className="klant-stack-narrow"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {/* Linker kolom: auth-secties (e-mail, wachtwoord, org-naam) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <EmailSection currentEmail={email} />
        <PasswordSection />
        <OrgNameSection initialName={orgName} isOwner={isOwner} />
      </div>

      {/* Rechter kolom: workspace-ID + verbruiksmetrics */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 className="klant-section-title">Workspace</h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--klant-r-md)',
                background: 'var(--klant-surface)',
                color: 'var(--klant-fg-muted)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={15} strokeWidth={1.7} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--klant-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  marginBottom: 2,
                }}
              >
                Workspace-ID
              </div>
              <code
                style={{
                  fontSize: 12,
                  background: 'var(--klant-surface)',
                  padding: '2px 8px',
                  borderRadius: 'var(--klant-r-sm)',
                  fontFamily: 'var(--font-mono), monospace',
                  color: 'var(--klant-fg-muted)',
                  wordBreak: 'break-all',
                }}
              >
                {orgId}
              </code>
            </div>
          </div>
        </section>

        <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="klant-section-title">Verbruik</h3>
          <UsageCell
            icon={MessagesSquare}
            label="Gesprekken deze maand"
            value={conversationsThisMonth}
          />
          <UsageCell
            icon={Database}
            label="Documenten in kennisbank"
            value={documentsCount}
          />
        </section>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gedeelde hulpcomponenten
// ---------------------------------------------------------------------------

function Status({ msg, error }: { msg: string | null; error: string | null }) {
  if (error) return <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>;
  if (msg) return <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>{msg}</span>;
  return null;
}

function UsageCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--klant-r-md)',
          background: 'var(--klant-accent-soft)',
          color: 'var(--klant-accent)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-muted)' }}>{label}</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--klant-fg)',
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth-secties (ongewijzigd — Supabase Auth + server-action)
// ---------------------------------------------------------------------------

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
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="klant-input"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={busy}>
          {busy ? 'Bezig…' : 'E-mail wijzigen'}
        </button>
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
        <button type="submit" className="klant-btn" data-variant="primary" disabled={busy}>
          {busy ? 'Bezig…' : 'Wachtwoord wijzigen'}
        </button>
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="klant-input"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="submit"
              className="klant-btn"
              data-variant="primary"
              disabled={pending || name.trim() === baseline.trim()}
            >
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
