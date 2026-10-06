'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// Wachtwoord instellen na de invite-/reset-link (sessie is gezet door
// /v1/auth/confirm). Validatie + flow ongewijzigd.
export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Wachtwoord moet minstens 8 tekens zijn.');
      return;
    }
    if (password !== confirm) {
      setError('De wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(authErrorMessage(updateError.message));
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <AuthCard title="Kies je wachtwoord" subtitle="Minstens 8 tekens. Hiermee log je voortaan in.">
      <form onSubmit={onSubmit} className="v1-form" noValidate>
        <div className="v1-field">
          <label htmlFor="v1-new-password" className="v1-label">Nieuw wachtwoord</label>
          <div className="v1-input-wrap">
            <input
              id="v1-new-password"
              autoFocus
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
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
        <div className="v1-field">
          <label htmlFor="v1-confirm-password" className="v1-label">Herhaal wachtwoord</label>
          <input
            id="v1-confirm-password"
            name="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            className="v1-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </Button>
      </form>
    </AuthCard>
  );
}
