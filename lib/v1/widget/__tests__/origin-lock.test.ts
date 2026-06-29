// Unit-test voor de V1-widget origin-lock. Pure functie → geen Next/DB nodig.
// Run: node --import tsx --test lib/v1/widget/__tests__/origin-lock.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sameOrigin } from '../origin-lock';

function req(headers: Record<string, string>) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (n: string) => map.get(n.toLowerCase()) ?? null } };
}

test('same host via Origin → true', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl', origin: 'https://app.chatmanta.nl' })), true);
});

test('Origin met poort-mismatch → false', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl', origin: 'https://app.chatmanta.nl:3000' })), false);
});

test('cross-origin → false', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl', origin: 'https://evil.example.com' })), false);
});

test('valt terug op Referer wanneer Origin ontbreekt', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl', referer: 'https://app.chatmanta.nl/embed-v1/acme' })), true);
});

test('geen Origin én geen Referer → false (fail-closed)', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl' })), false);
});

test('onparseerbare Origin → false', () => {
  assert.equal(sameOrigin(req({ host: 'app.chatmanta.nl', origin: 'not-a-url' })), false);
});
