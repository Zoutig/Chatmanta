// Run: node --import tsx --test lib/v1/admin/__tests__/crawl-retry.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCrawlRetry } from '../crawl-retry';

test('mislukte pagina’s gaan voor: alleen die worden opnieuw gedaan', () => {
  const plan = planCrawlRetry(
    [
      { url: 'https://a.nl/', status: 'ready' },
      { url: 'https://a.nl/x', status: 'failed' },
      { url: 'https://a.nl/x', status: 'failed' },
      { url: 'https://a.nl/y', status: 'failed' },
    ],
    50,
  );
  assert.equal(plan.mode, 'failed');
  assert.deepEqual(plan.urls, ['https://a.nl/x', 'https://a.nl/y']);
  assert.equal(plan.total, 2);
});

test('geen mislukte: de werkende, aangezette pagina’s verversen, met cap', () => {
  const pages = Array.from({ length: 60 }, (_, i) => ({ url: `https://a.nl/p${i}`, status: 'ready', included: true }));
  const plan = planCrawlRetry(pages, 50);
  assert.equal(plan.mode, 'refresh');
  assert.equal(plan.urls.length, 50);
  assert.equal(plan.total, 60);
});

test('refresh slaat lege en door de klant uitgezette pagina’s over', () => {
  const plan = planCrawlRetry(
    [
      { url: 'https://a.nl/aan', status: 'ready', included: true },
      { url: 'https://a.nl/uit', status: 'ready', included: false },
      { url: 'https://a.nl/leeg', status: 'excluded', included: false },
    ],
    50,
  );
  assert.equal(plan.mode, 'refresh');
  assert.deepEqual(plan.urls, ['https://a.nl/aan']);
  assert.equal(plan.total, 1);
  // Alleen uit/leeg → niets te verversen.
  assert.equal(planCrawlRetry([{ url: 'https://a.nl/uit', status: 'ready', included: false }], 50).mode, 'none');
});

test('geen pagina’s: niet raden (geen herontdekking)', () => {
  assert.deepEqual(planCrawlRetry([], 50), { mode: 'none', urls: [], total: 0 });
  assert.equal(planCrawlRetry([{ url: null, status: 'failed' }], 50).mode, 'none');
});
