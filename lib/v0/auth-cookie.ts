// V0 demo auth-cookie — HMAC-signed marker cookie.
//
// Hoe het werkt: na correcte password (timing-safe equal) zet de server een
// cookie `v0_auth=ok.<sig>` waar sig = HMAC-SHA256(payload, V0_COOKIE_SECRET).
// proxy.ts en server actions checken via verifyAuthCookie() of de
// signature klopt — onmogelijk te forgen zonder het server-secret.
//
// Bewust géén iron-session / next-auth: V0 demo, geen user-IDs, één gedeeld
// password voor "ja, mag binnen". In V1 vervangen we dit door echte auth via
// Supabase Auth + lib/auth.ts.
//
// Beide env vars moeten gezet zijn in dev én op Vercel:
//   V0_DEMO_PASSWORD   — wat bezoekers intikken
//   V0_COOKIE_SECRET   — server-only, ondertekent cookies (32+ chars)

import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'v0_auth';
const COOKIE_PAYLOAD = 'ok';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dagen

function secret(): string {
  const s = process.env.V0_COOKIE_SECRET;
  if (!s || s.length < 16) {
    throw new Error('V0_COOKIE_SECRET missing or too short (min 16 chars)');
  }
  return s;
}

function expectedPassword(): string {
  const p = process.env.V0_DEMO_PASSWORD;
  if (!p || p.length < 4) {
    throw new Error('V0_DEMO_PASSWORD missing or too short');
  }
  return p;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time compare. Returns false on length mismatch (no leak). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True iff the user-typed password matches V0_DEMO_PASSWORD (timing-safe). */
export function checkPassword(input: string): boolean {
  return safeEqual(input, expectedPassword());
}

/** Build the cookie value to set after successful login. */
export function buildAuthCookieValue(): string {
  return `${COOKIE_PAYLOAD}.${sign(COOKIE_PAYLOAD)}`;
}

/** Verify a cookie value (e.g. from request). Tolerates undefined. */
export function verifyAuthCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot < 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (payload !== COOKIE_PAYLOAD) return false;
  return safeEqual(sig, sign(COOKIE_PAYLOAD));
}

export const AUTH_COOKIE = {
  name: COOKIE_NAME,
  maxAgeSeconds: COOKIE_MAX_AGE_SECONDS,
};
