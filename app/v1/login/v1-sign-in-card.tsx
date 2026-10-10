'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck, Store } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

export type LoginMode = 'klant' | 'admin';

const MODES: { value: LoginMode; label: string; icon: typeof Store }[] = [
  { value: 'klant', label: 'Klant', icon: Store },
  { value: 'admin', label: 'Jorion-admin', icon: ShieldCheck },
];

const COPY: Record<LoginMode, { title: string; subtitle: string; submit: string; target: string }> = {
  klant: {
    title: 'Welkom terug',
    subtitle: 'Log in om je chatbot te beheren.',
    submit: 'Inloggen',
    target: '/v1/app',
  },
  admin: {
    title: 'Admin-toegang',
    subtitle: 'Voor het Jorion-team. Je komt direct in het admindashboard.',
    submit: 'Inloggen als admin',
    target: '/v1/admin',
  },
};

// V1-login in de Diepzee-stijl (spec §7.8) met een schuifschakelaar Klant ↔
// Jorion-admin. De keuze bepaalt alleen de bestemming na inloggen; de echte
// toegangscontrole blijft server-side (requireJorionAdmin in de admin-layout).
// In admin-modus checken we na het inloggen wel alvast is_jorion_admin (eigen rij,
// RLS users_select_own), zodat een klant een nette melding krijgt i.p.v. "Geen toegang".
export function V1SignInCard({
  initialError,
  initialMode = 'klant',
}: {
  initialError?: string;
  initialMode?: LoginMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const copy = COPY[mode];

  function selectMode(next: LoginMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    // Houd de URL deelbaar (?as=admin) zonder een navigatie te triggeren.
    const url = new URL(window.location.href);
    if (next === 'admin') url.searchParams.set('as', 'admin');
    else url.searchParams.delete('as');
    window.history.replaceState(window.history.state, '', url);
  }

  function onSwitchKey(e: React.KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next: LoginMode =
      e.key === 'Home' ? 'klant' : e.key === 'End' ? 'admin' : mode === 'klant' ? 'admin' : 'klant';
    selectMode(next);
    optionRefs.current[MODES.findIndex((m) => m.value === next)]?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setBusy(false);
      setError(authErrorMessage(signInError.message));
      return;
    }
    if (mode === 'admin') {
      const { data: profile } = await supabase
        .from('users')
        .select('is_jorion_admin')
        .eq('id', data.user.id)
        .maybeSingle();
      if (!profile?.is_jorion_admin) {
        await supabase.auth.signOut();
        setBusy(false);
        setError('Dit account heeft geen admin-rechten. Schuif naar "Klant" om in te loggen.');
        return;
      }
    }
    router.push(copy.target);
    router.refresh();
  }

  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      <div
        className="v1-login-switch"
        data-mode={mode}
        role="radiogroup"
        aria-label="Inloggen als"
        onKeyDown={onSwitchKey}
      >
        <span className="v1-login-switch-thumb" aria-hidden="true" />
        {MODES.map(({ value, label, icon: Icon }, i) => (
          <button
            key={value}
            ref={(el) => {
              optionRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={mode === value}
            tabIndex={mode === value ? 0 : -1}
            className="v1-login-switch-opt"
            onClick={() => selectMode(value)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="v1-form" data-mode={mode}>
        <div className="v1-field">
          <label htmlFor="v1-login-email" className="v1-label">
            {mode === 'admin' ? 'Jorion-e-mailadres' : 'E-mailadres'}
          </label>
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
          {busy ? 'Inloggen…' : copy.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
