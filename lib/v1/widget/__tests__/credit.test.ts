// Run: node --import tsx --test lib/v1/widget/__tests__/credit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_CREDIT_URL } from '../credit';

test('WIDGET_CREDIT_URL: absoluut https naar www.chatmanta.nl', () => {
  const url = new URL(WIDGET_CREDIT_URL);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'www.chatmanta.nl');
  assert.equal(url.pathname, '/');
  assert.equal(url.hash, '');
});

test('WIDGET_CREDIT_URL: alleen vaste utm-parameters, geen klant- of org-info', () => {
  const url = new URL(WIDGET_CREDIT_URL);
  const keys = [...url.searchParams.keys()];
  for (const k of keys) assert.ok(k.startsWith('utm_'), `onverwachte parameter ${k}`);
  assert.equal(url.searchParams.get('utm_source'), 'widget');
  assert.equal(url.searchParams.get('utm_medium'), 'credit');
  assert.doesNotMatch(WIDGET_CREDIT_URL, /slug|org|chatbot/i);
});
