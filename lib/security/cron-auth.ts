// Timing-safe Bearer-vergelijking voor cron-routes. Vervangt het per-route
// `auth !== `Bearer ${secret}``-patroon (short-circuit op het eerste teken).
// Zelfde aanpak als safeEqual in lib/v1/widget/embed-token.ts. Fail-closed:
// geen secret of geen header → false.
import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(
  authHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authHeader);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
