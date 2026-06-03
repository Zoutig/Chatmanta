// V0 rate limiter — twee schillen achter dezelfde RateLimiter-interface:
//
//   * chat-limiter      → POST /api/v0/chat (default 30 req/min/IP)
//   * mutation-limiter  → server actions die data wijzigen of LLM-tokens
//                          verbruiken (default 10 req/min/IP, strenger)
//
// Beide instances zijn module-singletons. De factories kiezen op basis van
// `USE_UPSTASH` env-var tussen `InMemoryRateLimiter` (default, per-process Map)
// en `UpstashRateLimiter` (globaal, Redis-backed). Zonder Upstash-vars valt
// de factory fail-safe terug op in-memory + één console.warn.
//
// Kanttekeningen voor de in-memory implementatie:
//   * Per-process Map: bij meerdere serverless instances heeft elke instance
//     zijn eigen counter — effectief limiet wordt N × limit. Voor productie
//     wil je USE_UPSTASH=true zodat alle instances dezelfde Redis-counter
//     gebruiken.
//   * Geen evictie: op zware load groeit de Map onbeperkt. Voor V0 testing
//     prima (single-user); Upstash heeft auto-eviction via TTL.

import 'server-only';
import { headers } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { getSink } from '@/lib/observability/sink';
import { checkWithFallback } from './rate-limit-fallback';

const DEFAULT_MAX_REQUESTS_PER_MIN = 30;
const DEFAULT_MUTATION_MAX_PER_MIN = 10;
// Per-org bucket: ruimer dan per-IP (één org heeft legitiem meerdere bezoekers
// vanaf verschillende IP's), maar laag genoeg om een gescript misbruik dat over
// IP's roteert af te knijpen op kosten. Override via ORG_RATE_LIMIT_PER_MIN.
const DEFAULT_ORG_MAX_PER_MIN = 120;
// Bij een Upstash-storing valt de limiter terug op in-memory en slaat alarm; dit
// dempt dat alarm tot hooguit één melding per instance per venster (anders zou
// een aanhoudende storing de logs + Issues-sink overspoelen).
const ALARM_THROTTLE_MS = 60_000;

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
  check(key: string): Promise<RateLimitVerdict>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(opts?: { maxRequestsPerMin?: number }) {
    this.limit = opts?.maxRequestsPerMin ?? DEFAULT_MAX_REQUESTS_PER_MIN;
    this.windowMs = 60_000;
  }

  async check(key: string): Promise<RateLimitVerdict> {
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

/**
 * Upstash-backed limiter. Counter staat in een centrale Redis, dus alle Vercel
 * instances delen dezelfde state — een aanvaller kan niet meer via load-spreading
 * onder het limiet doorglippen. Algoritme: sliding window (60s) — eerlijker dan
 * fixed window op de minuut-grens.
 *
 * `ratelimit.limit()` is async (HTTP call naar Upstash REST), vandaar dat de
 * interface `check()` Promise-returnt. In-memory wrapt zijn return ook in een
 * Promise om dezelfde signatuur te delen.
 *
 * Fail-safe: faalt de Upstash-call (Redis down / netwerk / foute credential),
 * dan 500't de route NIET — `check()` valt via {@link checkWithFallback} terug
 * op een per-instance in-memory teller en slaat (gedempt) alarm. Tijdens de
 * storing telt de limiet dus per-process i.p.v. globaal, maar de ergste runaway
 * blijft begrensd en de publieke routes blijven overeind.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;
  private readonly limitValue: number;
  private readonly fallback: InMemoryRateLimiter;
  private lastAlarmAtMs = 0;

  constructor(opts: { maxRequestsPerMin: number; prefix: string; redis: Redis }) {
    this.limitValue = opts.maxRequestsPerMin;
    this.ratelimit = new Ratelimit({
      redis: opts.redis,
      limiter: Ratelimit.slidingWindow(opts.maxRequestsPerMin, '60 s'),
      analytics: false,
      prefix: opts.prefix,
    });
    this.fallback = new InMemoryRateLimiter({ maxRequestsPerMin: opts.maxRequestsPerMin });
  }

  check(key: string): Promise<RateLimitVerdict> {
    return checkWithFallback(
      () => this.limitViaUpstash(key),
      this.fallback,
      key,
      (err) => this.alarm(err),
    );
  }

  private async limitViaUpstash(key: string): Promise<RateLimitVerdict> {
    const { success, remaining, reset } = await this.ratelimit.limit(key);
    const now = Date.now();
    const retryAfterSec = success ? 0 : Math.max(1, Math.ceil((reset - now) / 1000));
    return {
      allowed: success,
      used: this.limitValue - remaining,
      limit: this.limitValue,
      retryAfterSec,
      resetAt: reset,
    };
  }

  /** Luid maar gedempt alarm bij een Upstash-storing: console + observability-
   *  sink (Issues-tab), zodat een stille terugval op in-memory zichtbaar wordt.
   *  Hooguit één melding per ALARM_THROTTLE_MS per instance. */
  private alarm(err: unknown): void {
    const now = Date.now();
    if (now - this.lastAlarmAtMs < ALARM_THROTTLE_MS) return;
    this.lastAlarmAtMs = now;
    console.error(
      '[rate-limit] Upstash-call faalde — terugval op in-memory limiter ' +
        '(per-instance, niet globaal gedeeld). Controleer Upstash-status/credentials.',
      err,
    );
    getSink().capture({
      surface: 'system',
      severity: 'error',
      code: 'RATE_LIMIT_BACKEND',
      title: 'Upstash rate-limit onbereikbaar — terugval op in-memory',
      message: err instanceof Error ? err.message : String(err),
      error: err,
      context: { route: 'rate-limit' },
    });
  }
}

// Module-level singletons — twee aparte counters, één per limiet-soort. Beide
// worden lazy aangemaakt zodat env-vars op het eerste-call-moment gelezen
// worden (handig in tests).
let _chatInstance: RateLimiter | null = null;
let _mutationInstance: RateLimiter | null = null;
let _orgInstance: RateLimiter | null = null;
let _clientErrorInstance: RateLimiter | null = null;
let _upstashWarned = false;

function readEnvLimit(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Bouwt een limiter — kiest Upstash als USE_UPSTASH=true én de Redis-env-vars
 * staan; anders InMemoryRateLimiter (fail-safe, met one-shot console.warn als
 * USE_UPSTASH wel gevraagd was maar config ontbrak).
 */
function buildLimiter(opts: { limit: number; prefix: string }): RateLimiter {
  const useUpstash = process.env.USE_UPSTASH === 'true';
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (useUpstash && url && token) {
    const redis = new Redis({ url, token });
    return new UpstashRateLimiter({
      maxRequestsPerMin: opts.limit,
      prefix: opts.prefix,
      redis,
    });
  }

  if (useUpstash && !_upstashWarned) {
    _upstashWarned = true;
    console.warn(
      '[rate-limit] USE_UPSTASH=true maar UPSTASH_REDIS_REST_URL/_TOKEN ontbreken. ' +
        'Val terug op in-memory limiter — counters tellen per-process en niet globaal.',
    );
  }

  return new InMemoryRateLimiter({ maxRequestsPerMin: opts.limit });
}

export function getRateLimiter(): RateLimiter {
  if (_chatInstance) return _chatInstance;
  _chatInstance = buildLimiter({
    limit: readEnvLimit('RATE_LIMIT_PER_MIN', DEFAULT_MAX_REQUESTS_PER_MIN),
    prefix: '@chatmanta/rl-chat',
  });
  return _chatInstance;
}

/**
 * Limiter voor server actions die mutaties of LLM-calls doen. Strenger dan de
 * chat-limiter: een echte gebruiker doet maar zelden meer dan een paar
 * documenten/threads per minuut, dus 10/min is ruim voor normaal gedrag en
 * dichtbij genoeg om een loop-aanvaller af te knijpen.
 */
export function getMutationRateLimiter(): RateLimiter {
  if (_mutationInstance) return _mutationInstance;
  _mutationInstance = buildLimiter({
    limit: readEnvLimit('MUTATION_RATE_LIMIT_PER_MIN', DEFAULT_MUTATION_MAX_PER_MIN),
    prefix: '@chatmanta/rl-mutation',
  });
  return _mutationInstance;
}

/**
 * Per-org limiter voor het publieke chat-pad — een tweede begrenzing náást de
 * per-IP limiter. Vangt het misbruik-scenario af waarbij een gescraped token
 * over veel IP's wordt ingezet: de IP-bucket ziet dat niet, de org-bucket wel.
 * Sleutel: `org:<organizationId>`. Ruimer dan per-IP omdat één org legitiem
 * veel bezoekers heeft.
 */
export function getOrgRateLimiter(): RateLimiter {
  if (_orgInstance) return _orgInstance;
  _orgInstance = buildLimiter({
    limit: readEnvLimit('ORG_RATE_LIMIT_PER_MIN', DEFAULT_ORG_MAX_PER_MIN),
    prefix: '@chatmanta/rl-org',
  });
  return _orgInstance;
}

/**
 * Dedicated limiter voor het publieke /api/v0/client-error ingest-endpoint.
 * Eigen (lage) bucket zodat een crashende/loopende pagina of een scripted abuser
 * niet het chat-bucket leegtrekt. Default 20/min/IP, override via
 * CLIENT_ERROR_RATE_LIMIT_PER_MIN. (Géén per-org bucket: de org daar is een
 * niet-geauthenticeerde, spoofbare hint — de IP-limit + cardinaliteits-cap +
 * altijd-204 + retention zijn de echte controls.)
 */
export function getClientErrorRateLimiter(): RateLimiter {
  if (_clientErrorInstance) return _clientErrorInstance;
  _clientErrorInstance = buildLimiter({
    limit: readEnvLimit('CLIENT_ERROR_RATE_LIMIT_PER_MIN', 20),
    prefix: '@chatmanta/rl-clienterr',
  });
  return _clientErrorInstance;
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

/**
 * Server-action variant: haalt headers op uit `next/headers` ipv uit een
 * Request-object. Next 16 maakt `headers()` async — vandaar de await.
 */
async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}

export type MutationLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number; message: string };

/**
 * Eén-regel-helper voor server actions: pakt het client-IP, raadpleegt de
 * mutation-limiter, en geeft een verdict dat direct in een discriminated-union
 * return-shape past. Server actions kunnen geen HTTP 429 sturen, dus we
 * communiceren via een platte error-message + retryAfterSec voor clients die
 * willen tonen wanneer ze het opnieuw mogen proberen.
 */
export async function checkMutationLimit(): Promise<MutationLimitVerdict> {
  const ip = await getClientIpFromHeaders();
  const verdict = await getMutationRateLimiter().check(ip);
  if (verdict.allowed) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: verdict.retryAfterSec,
    message: `Te veel verzoeken — probeer over ${verdict.retryAfterSec} ${verdict.retryAfterSec === 1 ? 'seconde' : 'seconden'} opnieuw.`,
  };
}
