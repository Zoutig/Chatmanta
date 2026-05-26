// Kortlevend, org-gebonden embed-token. Bewijst dat een chat/ping-request van
// onze eigen /embed-pagina komt zonder dat we per-user auth hebben in V0.
//
// Wire-format:  base64url(JSON{slug,exp}) "." base64url(HMAC-SHA256(payload, secret))
// exp = unix-seconden. Verificatie is constant-time op de signature.
//
// Fail-closed: zonder EMBED_TOKEN_SECRET throwt createEmbedToken en geeft
// verifyEmbedToken altijd false — het ongate-pad gaat dan dicht.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SEC = Number(process.env.EMBED_TOKEN_TTL_SEC) || 30 * 60;

function secret(): string {
  const s = process.env.EMBED_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error('EMBED_TOKEN_SECRET missing or too short (min 16 chars)');
  }
  return s;
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Maak een token voor `slug`, geldig `ttlSec` seconden (default 30 min). */
export function createEmbedToken(slug: string, ttlSec: number = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(JSON.stringify({ slug, exp }));
  return `${payload}.${sign(payload)}`;
}

/** True iff `token` geldig is, niet verlopen, en hoort bij `slug`. Nooit throw. */
export function verifyEmbedToken(token: string | null | undefined, slug: string): boolean {
  if (!token) return false;
  let hasSecret = false;
  try {
    secret();
    hasSecret = true;
  } catch {
    hasSecret = false;
  }
  if (!hasSecret) return false;

  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      slug?: unknown;
      exp?: unknown;
    };
    if (decoded.slug !== slug) return false;
    if (typeof decoded.exp !== 'number') return false;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
