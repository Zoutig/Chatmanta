// Unit-test voor de daglimiet per bezoeker (security-audit 2026-10, #4). Draait met
// een in-memory limiter met dagvenster (geen Upstash nodig). Run:
//   node --import tsx --conditions=react-server --test lib/v1/limits/__tests__/visitor-day-limit.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { InMemoryRateLimiter, type RateLimiter } from '@/lib/v0/server/rate-limit';
import {
  checkVisitorDayLimit,
  VISITOR_DAILY_QUESTION_LIMIT,
  VISITOR_DAY_LIMIT_MESSAGE,
} from '../visitor-day-limit';

const dayLimiter = () =>
  new InMemoryRateLimiter({ maxRequestsPerMin: VISITOR_DAILY_QUESTION_LIMIT, windowSec: 24 * 60 * 60 });

test('blokkeert na VISITOR_DAILY_QUESTION_LIMIT vragen van één IP bij één org', async () => {
  const limiter = dayLimiter();
  for (let i = 0; i < VISITOR_DAILY_QUESTION_LIMIT; i++) {
    assert.deepEqual(await checkVisitorDayLimit('org-a', '203.0.113.7', limiter), { ok: true });
  }
  assert.deepEqual(await checkVisitorDayLimit('org-a', '203.0.113.7', limiter), {
    ok: false,
    message: VISITOR_DAY_LIMIT_MESSAGE,
  });
});

test('andere org of ander IP heeft een eigen bucket', async () => {
  const limiter = dayLimiter();
  for (let i = 0; i < VISITOR_DAILY_QUESTION_LIMIT + 1; i++) {
    await checkVisitorDayLimit('org-a', '203.0.113.7', limiter);
  }
  assert.equal((await checkVisitorDayLimit('org-b', '203.0.113.7', limiter)).ok, true);
  assert.equal((await checkVisitorDayLimit('org-a', '203.0.113.8', limiter)).ok, true);
});

test('sleutel bevat het gehashte IP, nooit het ruwe IP', async () => {
  const keys: string[] = [];
  const spy: RateLimiter = {
    async check(key) {
      keys.push(key);
      return { allowed: true, used: 1, limit: 1, retryAfterSec: 0, resetAt: 0 };
    },
  };
  await checkVisitorDayLimit('org-a', '203.0.113.7', spy);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^org-ip-day:org-a:[0-9a-f]{16}$/);
  assert.ok(!keys[0].includes('203.0.113.7'));
});

test("onbekend IP → bucket overslaan (geen gedeelde 'unknown'-bucket)", async () => {
  const spy: RateLimiter = {
    async check() {
      throw new Error('mag niet aangeroepen worden');
    },
  };
  assert.deepEqual(await checkVisitorDayLimit('org-a', 'unknown', spy), { ok: true });
  assert.deepEqual(await checkVisitorDayLimit('org-a', '  ', spy), { ok: true });
});

test('InMemoryRateLimiter: windowSec bepaalt het venster (default blijft 60 s)', async () => {
  const day = new InMemoryRateLimiter({ maxRequestsPerMin: 1, windowSec: 24 * 60 * 60 });
  const v = await day.check('k');
  assert.ok(v.resetAt - Date.now() > 23 * 60 * 60 * 1000);
  const minute = new InMemoryRateLimiter({ maxRequestsPerMin: 1 });
  const m = await minute.check('k');
  assert.ok(m.resetAt - Date.now() <= 60_000);
});
