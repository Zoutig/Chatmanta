// Unit-tests voor de SSRF-guard van de website-crawler (SA-2).
//
// Run: node --import tsx --test tests/v0/crawl-ssrf.test.ts
//
// Alle cases hier zijn hermetisch: ze raken óf een letterlijk IP, óf een
// geblokkeerde hostnaam/scheme — dus de DNS-lookup-tak wordt nooit geraakt en
// de test heeft geen netwerk nodig.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateCrawlUrl } from '../../lib/v0/crawler/validateCrawlUrl';

async function assertBlocked(url: string) {
  const res = await validateCrawlUrl(url);
  assert.equal(res.allowed, false, `verwacht geblokkeerd: ${url}`);
}

async function assertAllowed(url: string) {
  const res = await validateCrawlUrl(url);
  assert.equal(res.allowed, true, `verwacht toegestaan: ${url}`);
}

test('weigert niet-http(s) schemes', async () => {
  await assertBlocked('ftp://example.com');
  await assertBlocked('file:///etc/passwd');
  await assertBlocked('javascript:alert(1)');
});

test('weigert localhost en interne suffixen', async () => {
  await assertBlocked('http://localhost/');
  await assertBlocked('http://localhost:3000/admin');
  await assertBlocked('http://db.internal/');
  await assertBlocked('http://printer.local/');
});

test('weigert loopback / private / link-local IPv4', async () => {
  await assertBlocked('http://127.0.0.1/');
  await assertBlocked('http://10.0.0.5/');
  await assertBlocked('http://192.168.1.1/');
  await assertBlocked('http://172.16.0.1/');
  await assertBlocked('http://0.0.0.0/');
});

test('weigert cloud-metadata (169.254.169.254)', async () => {
  await assertBlocked('http://169.254.169.254/latest/meta-data/');
});

test('weigert loopback / unique-local IPv6', async () => {
  await assertBlocked('http://[::1]/');
  await assertBlocked('http://[fc00::1]/');
  await assertBlocked('http://[fe80::1]/');
});

test('weigert lege of malformede URL', async () => {
  await assertBlocked('');
  await assertBlocked('niet-een-url');
  await assertBlocked('http://');
});

test('staat een publiek letterlijk IP toe (geen DNS nodig)', async () => {
  await assertAllowed('http://8.8.8.8/');
  await assertAllowed('https://1.1.1.1/');
});
