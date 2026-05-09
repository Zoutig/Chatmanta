// V0.4 rate limiter — eenvoudige in-memory implementatie achter een interface
// zodat V1 zonder code-wijziging naar Upstash Ratelimit kan migreren.
//
// Scope: per-IP throttling op de chat API. Window = sliding bucket met fixed
// reset (eenvoudiger en goed-genoeg dan true sliding window).
//
// Kanttekeningen voor V0:
//   * Per-process Map: bij meerdere serverless instances loopt elke instance
//     zijn eigen counter — effectief limiet wordt N×limit. Acceptabel voor
//     V0 omdat Vercel hot-reload één instance houdt; productie-V1 loopt op
//     Upstash dat wél globaal is.
//   * Geen evictie: op zware load groeit de Map onbeperkt. Voor V0 prima
//     (single-user testing); V1 lost dat op via Upstash TTL.

import 'server-only';

const DEFAULT_MAX_REQUESTS_PER_MIN = 30;

export type RateLimitVerdict = {
  allowed: boolean;
  /** Hoeveel requests in dit window al verbruikt (incl. de huidige). */
  used: number;
  /** Maximum requests in het window. */
  limit: number;
  /** Hoelang nog tot reset (in seconden, ≥0). */
  retryAfterSec: number;
  /** Unix epoch ms waarop het bucket resette. */
  resetAt: number;
};

export interface RateLimiter {
  check(key: string): RateLimitVerdict;
}

export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(opts?: { maxRequestsPerMin?: number }) {
    this.limit = opts?.maxRequestsPerMin ?? DEFAULT_MAX_REQUESTS_PER_MIN;
    this.windowMs = 60_000;
  }

  check(key: string): RateLimitVerdict {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      // Nieuw window starten — eerste request in dit minuut-bucket.
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        used: 1,
        limit: this.limit,
        retryAfterSec: 0,
        resetAt,
      };
    }

    existing.count += 1;
    const allowed = existing.count <= this.limit;
    const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed,
      used: existing.count,
      limit: this.limit,
      retryAfterSec,
      resetAt: existing.resetAt,
    };
  }
}

// Module-level singleton — process-wide Map, één per dev-server / serverless
// instance. Beëmuleert wat Upstash global doet zonder de Redis-dep.
let _instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (_instance) return _instance;
  const max = Number(process.env.RATE_LIMIT_PER_MIN);
  _instance = new InMemoryRateLimiter({
    maxRequestsPerMin: Number.isFinite(max) && max > 0 ? max : undefined,
  });
  return _instance;
}

/**
 * Pak de client IP uit een Next.js Request. Probeert de gangbare proxy-headers
 * (Vercel, Cloudflare) en valt terug op 'unknown' als niets bruikbaar is.
 * 'unknown' alle tezamen is niet ideaal — bij alle anonimieten dezelfde
 * bucket — maar dat is een V0 trade-off.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for kan komma-gescheiden zijn — eerste IP = origineel.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}
