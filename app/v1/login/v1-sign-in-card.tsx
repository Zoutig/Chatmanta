'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// V1-login in de Diepzee-stijl (spec §7.8). Auth-flow ongewijzigd t.o.v. de
// vorige versie: signInWithPassword → /v1/app.
export function V1SignInCard({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(authErrorMessage(signInError.message));
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <AuthCard title="Welkom terug" subtitle="Log in om je chatbot te beheren.">
      <form onSubmit={onSubmit} className="v1-form" noValidate>
        <div className="v1-field">
          <label htmlFor="v1-login-email" className="v1-label">E-mailadres</label>
          <input
            id="v1-login-email"
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
        <div className="v1-field">
          <div className="v1-row-between">
            <label htmlFor="v1-login-password" className="v1-label">Wachtwoord</label>
            <Link href="/v1/auth/forgot-password" className="v1-link">Wachtwoord vergeten?</Link>
          </div>
          <div className="v1-input-wrap">
            <input
              id="v1-login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="v1-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="v1-input-action"
              aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Inloggen…' : 'Inloggen'}
        </Button>
      </form>
    </AuthCard>
  );
}
