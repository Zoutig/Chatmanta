'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label className="login-field">
        <span>Wachtwoord</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
        />
      </label>
      {state.error ? <p className="login-error">{state.error}</p> : null}
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? 'Bezig…' : 'Inloggen'}
      </button>
    </form>
  );
}
