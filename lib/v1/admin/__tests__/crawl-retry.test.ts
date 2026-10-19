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

test('geen mislukte: de bestaande selectie verversen, met cap', () => {
  const pages = Array.from({ length: 60 }, (_, i) => ({ url: `https://a.nl/p${i}`, status: i % 2 ? 'ready' : 'excluded' }));
  const plan = planCrawlRetry(pages, 50);
  assert.equal(plan.mode, 'refresh');
  assert.equal(plan.urls.length, 50);
  assert.equal(plan.total, 60);
});

test('geen pagina’s: niet raden (geen herontdekking)', () => {
  assert.deepEqual(planCrawlRetry([], 50), { mode: 'none', urls: [], total: 0 });
  assert.equal(planCrawlRetry([{ url: null, status: 'failed' }], 50).mode, 'none');
});
