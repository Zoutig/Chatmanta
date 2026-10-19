// Unit-test voor de daglimieten op publieke V1-paden (security-audit 2026-10, #4/#5). Draait met
// een in-memory limiter met dagvenster (geen Upstash nodig). Run:
//   node --import tsx --conditions=react-server --test lib/v1/limits/__tests__/visitor-day-limit.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { InMemoryRateLimiter, type RateLimiter } from '@/lib/v0/server/rate-limit';
import {
  allowOrgContactMailToday,
  allowVisitorContactToday,
  checkVisitorDayLimit,
  ORG_DAILY_CONTACT_MAIL_LIMIT,
  VISITOR_DAILY_CONTACT_LIMIT,
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

test('contactformulier: per (org, IP) max VISITOR_DAILY_CONTACT_LIMIT per dag', async () => {
  const limiter = new InMemoryRateLimiter({ maxRequestsPerMin: VISITOR_DAILY_CONTACT_LIMIT, windowSec: 86_400 });
  for (let i = 0; i < VISITOR_DAILY_CONTACT_LIMIT; i++) {
    assert.equal(await allowVisitorContactToday('org-a', '198.51.100.1', limiter), true);
  }
  assert.equal(await allowVisitorContactToday('org-a', '198.51.100.1', limiter), false);
  assert.equal(await allowVisitorContactToday('org-a', '198.51.100.2', limiter), true);
});

test('contactmails: per org max ORG_DAILY_CONTACT_MAIL_LIMIT per dag, los per org', async () => {
  const limiter = new InMemoryRateLimiter({ maxRequestsPerMin: ORG_DAILY_CONTACT_MAIL_LIMIT, windowSec: 86_400 });
  for (let i = 0; i < ORG_DAILY_CONTACT_MAIL_LIMIT; i++) {
    assert.equal(await allowOrgContactMailToday('org-a', limiter), true);
  }
  assert.equal(await allowOrgContactMailToday('org-a', limiter), false);
  assert.equal(await allowOrgContactMailToday('org-b', limiter), true);
});

test('limieten: env-override, ongeldige waarde valt terug op de default', async () => {
  const { visitorDailyQuestionLimit, voorbeeldDailyQuestionLimit, VOORBEELD_DAILY_QUESTION_LIMIT } =
    await import('../visitor-day-limit');
  const saved = { a: process.env.VISITOR_DAILY_QUESTION_LIMIT, b: process.env.VOORBEELD_DAILY_QUESTION_LIMIT };
  try {
    delete process.env.VISITOR_DAILY_QUESTION_LIMIT;
    delete process.env.VOORBEELD_DAILY_QUESTION_LIMIT;
    assert.equal(visitorDailyQuestionLimit(), VISITOR_DAILY_QUESTION_LIMIT);
    assert.equal(voorbeeldDailyQuestionLimit(), VOORBEELD_DAILY_QUESTION_LIMIT);
    assert.ok(VOORBEELD_DAILY_QUESTION_LIMIT > VISITOR_DAILY_QUESTION_LIMIT);
    process.env.VISITOR_DAILY_QUESTION_LIMIT = '70';
    process.env.VOORBEELD_DAILY_QUESTION_LIMIT = 'abc';
    assert.equal(visitorDailyQuestionLimit(), 70);
    assert.equal(voorbeeldDailyQuestionLimit(), VOORBEELD_DAILY_QUESTION_LIMIT);
  } finally {
    if (saved.a === undefined) delete process.env.VISITOR_DAILY_QUESTION_LIMIT;
    else process.env.VISITOR_DAILY_QUESTION_LIMIT = saved.a;
    if (saved.b === undefined) delete process.env.VOORBEELD_DAILY_QUESTION_LIMIT;
    else process.env.VOORBEELD_DAILY_QUESTION_LIMIT = saved.b;
  }
});

test('demo-bucket staat los van de klant-widget-bucket', async () => {
  const { checkVoorbeeldDayLimit } = await import('../visitor-day-limit');
  const limiter = new InMemoryRateLimiter({ maxRequestsPerMin: 2, windowSec: 24 * 60 * 60 });
  await checkVisitorDayLimit('org-demo', '203.0.113.9', limiter);
  await checkVisitorDayLimit('org-demo', '203.0.113.9', limiter);
  assert.equal((await checkVisitorDayLimit('org-demo', '203.0.113.9', limiter)).ok, false);
  assert.equal((await checkVoorbeeldDayLimit('org-demo', '203.0.113.9', limiter)).ok, true);
});
