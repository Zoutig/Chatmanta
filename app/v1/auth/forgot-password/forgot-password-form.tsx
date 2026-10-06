'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// "Wachtwoord vergeten" in de Diepzee-stijl. Flow ongewijzigd:
// resetPasswordForEmail(email); bij succes altijd dezelfde bevestiging (anti-
// enumeratie: verraadt
// niet of het adres bestaat).
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (resetError) {
      setError(authErrorMessage(resetError.message));
      return;
    }
    setSent(true);
  }

  const backToLogin = <Link href="/v1/login" className="v1-link">Terug naar inloggen</Link>;

  if (sent) {
    return (
      <AuthCard
        title="Check je inbox"
        subtitle="Als dit e-mailadres bij ons bekend is, ontvang je binnen een paar minuten een link om een nieuw wachtwoord te kiezen."
        footer={backToLogin}
      >
        <p className="v1-alert v1-alert--ok" role="status">E-mail verstuurd naar {email}.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Wachtwoord vergeten"
      subtitle="Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord te kiezen."
      footer={backToLogin}
    >
      <form onSubmit={onSubmit} className="v1-form">
        <div className="v1-field">
          <label htmlFor="v1-forgot-email" className="v1-label">E-mailadres</label>
          <input
            id="v1-forgot-email"
            autoFocus
            name="email"
            type="email"
            autoComplete="email"
            required
            className="v1-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Versturen…' : 'Stuur link'}
        </Button>
      </form>
    </AuthCard>
  );
}
