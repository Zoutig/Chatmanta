// Run: node --import tsx --test lib/v1/crawler/__tests__/disabled-snapshot.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerDisabledUrls } from '../disabled-snapshot';

const row = (url: string, status: string, included: boolean) => ({ metadata: { source_url: url }, status, included });

test('een door de klant uitgezette geslaagde pagina blijft uit', () => {
  const s = customerDisabledUrls([row('https://a.nl/x', 'ready', false)]);
  assert.ok(s.has('https://a.nl/x'));
});

test('mislukte of lege pagina is geen klantkeuze: een geslaagde retry gaat aan', () => {
  const s = customerDisabledUrls([
    row('https://a.nl/kapot', 'failed', false),
    row('https://a.nl/leeg', 'excluded', false),
  ]);
  assert.equal(s.size, 0);
  // ingestCrawlResults zet included = !disabledUrls.has(url) → true.
  assert.equal(!s.has('https://a.nl/kapot'), true);
});

test('included=true of ontbrekende URL telt niet mee', () => {
  const s = customerDisabledUrls([
    row('https://a.nl/aan', 'ready', true),
    { metadata: null, status: 'ready', included: false },
    { metadata: { source_url: '' }, status: 'ready', included: false },
  ]);
  assert.equal(s.size, 0);
});
