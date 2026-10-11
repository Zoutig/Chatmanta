import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FirecrawlBusyError, gatedCall, isFirecrawlRateLimit, parseRetryAfterMs, type GateDeps,
} from '../firecrawl-gate';
import type { RateLimitVerdict } from '@/lib/v0/server/rate-limit';

const FIRECRAWL_429 =
  'Rate limit exceeded. Consumed (req/min): 20, Remaining (req/min): 0. Upgrade your plan at ' +
  'https://firecrawl.dev/pricing for increased rate limits or please retry after 22s, resets at ' +
  'Fri Oct 09 2026 17:58:00 GMT+0000 (Coordinated Universal Time)';

const verdict = (allowed: boolean, retryAfterSec = 0): RateLimitVerdict =>
  ({ allowed, used: 0, limit: 8, retryAfterSec, resetAt: 0 });

/** Nep-klok + nep-sleep: sleep schuift de klok op, zodat deadlines deterministisch zijn. */
function fakeDeps(verdicts: RateLimitVerdict[]): GateDeps & { clock: { t: number }; sleeps: number[] } {
  const clock = { t: 0 };
  const sleeps: number[] = [];
  return {
    clock,
    sleeps,
    now: () => clock.t,
    sleep: async (ms) => { sleeps.push(ms); clock.t += ms; },
    limiterFor: () => ({ check: async () => verdicts.shift() ?? verdict(true) }),
  };
}

test('parseRetryAfterMs: leest "resets at" uit de echte Firecrawl-melding', () => {
  const now = Date.parse('2026-10-09T17:57:38Z');
  assert.equal(parseRetryAfterMs(new Error(FIRECRAWL_429), now), 22_000);
});

test('parseRetryAfterMs: valt terug op "retry after Ns", anders null', () => {
  assert.equal(parseRetryAfterMs(new Error('please retry after 7s'), 0), 7_000);
  assert.equal(parseRetryAfterMs(new Error('iets anders'), 0), null);
  assert.equal(parseRetryAfterMs('geen error', 0), null);
});

test('isFirecrawlRateLimit: status 429 of rate-limit-tekst', () => {
  assert.equal(isFirecrawlRateLimit({ status: 429 }), true);
  assert.equal(isFirecrawlRateLimit(new Error(FIRECRAWL_429)), true);
  assert.equal(isFirecrawlRateLimit(new FirecrawlBusyError(5)), true);
  assert.equal(isFirecrawlRateLimit(new Error('HTTP 500')), false);
});

test('gatedCall: loket vrij → call direct, geen wachttijd', async () => {
  const deps = fakeDeps([]);
  const out = await gatedCall('map', async () => 'ok', 10_000, deps);
  assert.equal(out, 'ok');
  assert.deepEqual(deps.sleeps, []);
});

test('gatedCall: loket vol → wacht en gaat daarna alsnog door', async () => {
  const deps = fakeDeps([verdict(false, 3)]);
  let calls = 0;
  const out = await gatedCall('scrape', async () => { calls++; return 'ok'; }, 10_000, deps);
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
  assert.deepEqual(deps.sleeps, [3_000]);
});

test('gatedCall: Firecrawl-429 → wacht tot de reset en probeert opnieuw', async () => {
  const deps = fakeDeps([]);
  let calls = 0;
  const out = await gatedCall('batch', async () => {
    calls++;
    if (calls === 1) throw new Error('Rate limit exceeded ... please retry after 4s');
    return 'gestart';
  }, 30_000, deps);
  assert.equal(out, 'gestart');
  assert.equal(calls, 2);
  assert.deepEqual(deps.sleeps, [4_500]); // 4s + marge
});

test('gatedCall: wachten zou de deadline overschrijden → FirecrawlBusyError (zonder call)', async () => {
  const deps = fakeDeps([verdict(false, 30)]);
  let calls = 0;
  await assert.rejects(
    gatedCall('batch', async () => { calls++; return 'x'; }, 10_000, deps),
    (err: unknown) => err instanceof FirecrawlBusyError && isFirecrawlRateLimit(err),
  );
  assert.equal(calls, 0);
});

test('gatedCall: andere fouten gaan ongewijzigd door, zonder retry', async () => {
  const deps = fakeDeps([]);
  let calls = 0;
  await assert.rejects(
    gatedCall('map', async () => { calls++; throw new Error('HTTP 500'); }, 10_000, deps),
    /HTTP 500/,
  );
  assert.equal(calls, 1);
});
