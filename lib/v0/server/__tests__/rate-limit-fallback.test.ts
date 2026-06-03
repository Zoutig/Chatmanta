import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkWithFallback } from '../rate-limit-fallback';
import type { RateLimiter, RateLimitVerdict } from '../rate-limit';

const OK: RateLimitVerdict = { allowed: true, used: 1, limit: 5, retryAfterSec: 0, resetAt: 0 };

/** Fallback-limiter die onthoudt met welke keys 'ie is aangeroepen. */
function recordingFallback(verdict: RateLimitVerdict): { limiter: RateLimiter; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    limiter: {
      check: async (key: string) => {
        calls.push(key);
        return verdict;
      },
    },
  };
}

test('primary slaagt → verdict door, geen fallback, geen alarm', async () => {
  const { limiter, calls } = recordingFallback({ ...OK, used: 99 });
  let alarms = 0;
  const out = await checkWithFallback(async () => OK, limiter, 'ip:1', () => alarms++);
  assert.deepEqual(out, OK);
  assert.equal(calls.length, 0, 'fallback mag niet aangeroepen worden bij succes');
  assert.equal(alarms, 0, 'geen alarm bij succes');
});

test('primary faalt → terugval op fallback (zelfde key) + alarm één keer', async () => {
  const fb: RateLimitVerdict = { allowed: true, used: 1, limit: 5, retryAfterSec: 0, resetAt: 123 };
  const { limiter, calls } = recordingFallback(fb);
  const errs: unknown[] = [];
  const out = await checkWithFallback(
    async () => {
      throw new Error('upstash down');
    },
    limiter,
    'ip:2',
    (e) => errs.push(e),
  );
  assert.deepEqual(out, fb, 'verdict komt van de fallback');
  assert.deepEqual(calls, ['ip:2'], 'fallback aangeroepen met dezelfde key');
  assert.equal(errs.length, 1);
  assert.match((errs[0] as Error).message, /upstash down/);
});

test('een falend alarm ondermijnt het vangnet niet', async () => {
  const fb: RateLimitVerdict = { allowed: false, used: 6, limit: 5, retryAfterSec: 30, resetAt: 456 };
  const { limiter } = recordingFallback(fb);
  const out = await checkWithFallback(
    async () => {
      throw new Error('redis kapot');
    },
    limiter,
    'ip:3',
    () => {
      throw new Error('alarm zelf kapot');
    },
  );
  assert.deepEqual(out, fb, 'fallback-verdict ondanks een falend alarm');
});

test('zonder onError-callback valt het nog steeds terug', async () => {
  const fb: RateLimitVerdict = { allowed: true, used: 1, limit: 3, retryAfterSec: 0, resetAt: 0 };
  const { limiter, calls } = recordingFallback(fb);
  const out = await checkWithFallback(
    async () => {
      throw new Error('x');
    },
    limiter,
    'ip:4',
  );
  assert.deepEqual(out, fb);
  assert.deepEqual(calls, ['ip:4']);
});
