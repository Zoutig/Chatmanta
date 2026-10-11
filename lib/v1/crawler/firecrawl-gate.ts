// V1 Website Crawler — Firecrawl-loket (globale snelheidsrem vóór de API).
//
// Waarom: Firecrawl begrenst per endpoint en per TEAM — al onze klanten, de cron én
// de MCP-koppeling delen één teller. Zonder rem liep een discovery op een site met
// een sitemap-index (spotler.com, 2026-10-09) door de minuut-limiet heen, waarna de
// échte crawl-start een 429 kreeg. Dit loket:
//   1. telt elke call vooraf af tegen een eigen (gedeelde, Upstash) teller per
//      endpoint, iets onder Firecrawl's limiet → bij "vol" even WACHTEN i.p.v. falen;
//   2. vangt een 429 van Firecrawl zelf op (bv. door MCP-gebruik dat wij niet zien),
//      leest de "retry after Xs" uit de melding en probeert opnieuw;
//   3. alles binnen een harde deadline, zodat de serverfunctie nooit wordt afgekapt.
//      Deadline op → FirecrawlBusyError (status 429, dus de poll-verwerker ziet 'm
//      als tijdelijk).
//
// Puur + DI (limiter/sleep/now) zodat het zonder Upstash of Firecrawl te testen is.

import type { RateLimiter } from '@/lib/v0/server/rate-limit';

export type FirecrawlEndpoint = 'map' | 'scrape' | 'batch';

/** Eigen plafond per minuut, bewust ónder Firecrawl's team-limiet (free plan: /scrape
 *  en /map 10/min volgens de docs; batch-start werd op 20/min begrensd gemeten). Bij
 *  een plan-upgrade hier ophogen. Statuspolls (eigen ruim budget) lopen NIET via het loket. */
export const FIRECRAWL_PER_MIN: Record<FirecrawlEndpoint, number> = {
  map: 8,
  scrape: 8,
  batch: 10,
};

/** Firecrawl had binnen het wachtbudget geen ruimte. */
export class FirecrawlBusyError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSec: number) {
    super(`Firecrawl rate limit: geen ruimte binnen het wachtbudget (opnieuw over ~${retryAfterSec}s).`);
    this.name = 'FirecrawlBusyError';
  }
}

/** Herkent een Firecrawl rate-limit-fout (HTTP 429) op .status/.statusCode of de message. */
export function isFirecrawlRateLimit(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number; message?: unknown };
  if (e.status === 429 || e.statusCode === 429) return true;
  return typeof e.message === 'string' && /rate.?limit/i.test(e.message);
}

/**
 * Wachttijd uit een Firecrawl-429-melding, bv. "please retry after 22s, resets at
 * Fri Oct 09 2026 17:58:00 GMT+0000". Voorkeur: "resets at" (absoluut), anders
 * "retry after Ns". Null als er niets bruikbaars in staat.
 */
export function parseRetryAfterMs(err: unknown, nowMs: number): number | null {
  const message = err && typeof err === 'object' ? (err as { message?: unknown }).message : null;
  if (typeof message !== 'string') return null;
  const resets = /resets at ([^)\n]+?GMT[+-]\d{4})/i.exec(message);
  if (resets) {
    const at = Date.parse(resets[1]);
    if (Number.isFinite(at)) return Math.max(0, at - nowMs);
  }
  const after = /retry after (\d+)\s*s/i.exec(message);
  if (after) return Number(after[1]) * 1000;
  return null;
}

export type GateDeps = {
  /** Geeft per endpoint de gedeelde teller. */
  limiterFor: (endpoint: FirecrawlEndpoint) => RateLimiter;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** Wachttijd als Firecrawl een 429 geeft zonder bruikbare retry-hint. */
const DEFAULT_429_WAIT_MS = 5_000;
/** Marge bovenop Firecrawl's reset-moment (klokverschil). */
const RESET_MARGIN_MS = 500;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Voer één Firecrawl-call uit via het loket. Wacht op een vrije plek en herhaalt bij
 * een 429, maar nooit voorbij `deadline` (epoch-ms) — dan FirecrawlBusyError. Andere
 * fouten gaan ongewijzigd door.
 */
export async function gatedCall<T>(
  endpoint: FirecrawlEndpoint,
  fn: () => Promise<T>,
  deadline: number,
  deps: GateDeps,
): Promise<T> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const limiter = deps.limiterFor(endpoint);

  for (;;) {
    const verdict = await limiter.check(`firecrawl:${endpoint}`);
    if (!verdict.allowed) {
      const waitMs = Math.max(250, verdict.retryAfterSec * 1000);
      if (now() + waitMs > deadline) throw new FirecrawlBusyError(verdict.retryAfterSec);
      await sleep(waitMs);
      continue;
    }
    try {
      return await fn();
    } catch (err) {
      if (!isFirecrawlRateLimit(err) || err instanceof FirecrawlBusyError) throw err;
      const waitMs = (parseRetryAfterMs(err, now()) ?? DEFAULT_429_WAIT_MS) + RESET_MARGIN_MS;
      if (now() + waitMs > deadline) throw new FirecrawlBusyError(Math.ceil(waitMs / 1000));
      await sleep(waitMs);
    }
  }
}
