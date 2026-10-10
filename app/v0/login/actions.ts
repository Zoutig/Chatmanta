'use server';

// Login server action — accepts password from form, sets signed auth cookie
// on match, redirects back to where the user wanted to go (or /).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  AUTH_COOKIE,
  buildAuthCookieValue,
  checkPassword,
} from '@/lib/v0/auth-cookie';

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!checkPassword(password)) {
    return { error: 'Onjuist wachtwoord.' };
  }

  const jar = await cookies();
  jar.set(AUTH_COOKIE.name, buildAuthCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE.maxAgeSeconds,
  });

  // Validate `next` is an internal path (avoid open-redirect).
  // Chrome/Firefox normaliseren `/\` naar `//` → `/\evil.com` zou redirecten
  // naar evil.com. Naast `//` dus ook `/\` blokkeren.
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
      ? next
      : '/';
  redirect(safeNext);
}
