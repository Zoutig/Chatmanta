'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/v1/client';

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
      // Geen sessie (link verlopen / direct bezocht) → updateUser faalt → terug naar login.
      setError(updateError.message);
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Nieuw wachtwoord"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 10, fontSize: 14 }}
      />
      <input
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="Herhaal wachtwoord"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        style={{ padding: 10, fontSize: 14 }}
      />
      <button type="submit" disabled={busy} style={{ padding: 10, fontSize: 14, cursor: 'pointer' }}>
        {busy ? 'Bezig…' : 'Wachtwoord opslaan'}
      </button>
      {error && (
        <p role="alert" style={{ color: '#b00020', fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
