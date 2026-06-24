'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/v1/client';

// V1-login (fundament-proof). Logt in tegen het V1-project via Supabase Auth en
// stuurt door naar /v1/app. Bewust minimale UI — dit bewijst de auth-flow, geen
// productie-vormgeving (komt bij een latere mijlpaal).
export function V1LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        name="email"
        type="email"
        autoComplete="email"
        placeholder="E-mail"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 10, fontSize: 14 }}
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Wachtwoord"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 10, fontSize: 14 }}
      />
      <button type="submit" disabled={busy} style={{ padding: 10, fontSize: 14, cursor: 'pointer' }}>
        {busy ? 'Bezig…' : 'Inloggen'}
      </button>
      {error && (
        <p role="alert" style={{ color: '#b00020', fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
