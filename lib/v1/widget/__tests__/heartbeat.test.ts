// Run: node --import tsx --test lib/v1/widget/__tests__/heartbeat.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embeddedHost, isOwnHost, normalizeHost, shouldCountHeartbeat } from '../heartbeat';

test('normalizeHost: lowercase, zonder poort en www, ook uit een URL', () => {
  assert.equal(normalizeHost('WWW.Klant.nl'), 'klant.nl');
  assert.equal(normalizeHost('localhost:3102'), 'localhost');
  assert.equal(normalizeHost('https://www.klant.nl/pagina?x=1'), 'klant.nl');
  assert.equal(normalizeHost(''), null);
  assert.equal(normalizeHost('onbekend'), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost('https://'), null);
});

test('isOwnHost: apex en www van de app-host tellen als eigen', () => {
  assert.equal(isOwnHost('chatmanta.nl', 'www.chatmanta.nl'), true);
  assert.equal(isOwnHost('www.chatmanta.nl', 'www.chatmanta.nl'), true);
  assert.equal(isOwnHost('klant.nl', 'www.chatmanta.nl'), false);
  assert.equal(isOwnHost('chatmanta.nl.klant.nl', 'www.chatmanta.nl'), false);
});

test('shouldCountHeartbeat: alleen met een vreemde host', () => {
  assert.equal(shouldCountHeartbeat('klant.nl', 'www.chatmanta.nl'), true);
  assert.equal(shouldCountHeartbeat(null, 'www.chatmanta.nl'), false);
  assert.equal(shouldCountHeartbeat('', 'www.chatmanta.nl'), false);
  assert.equal(shouldCountHeartbeat('www.chatmanta.nl', 'www.chatmanta.nl'), false);
  assert.equal(shouldCountHeartbeat('localhost', 'localhost:3102'), false);
});

const APP = 'www.chatmanta.nl';

test('embeddedHost: direct geopende embed-URL (niet in een frame) → null', () => {
  assert.equal(embeddedHost({ framed: false, search: '?h=klant.nl', referrer: '', appHost: APP }), null);
});

test('embeddedHost: in een frame met ?h= → die host', () => {
  assert.equal(embeddedHost({ framed: true, search: '?h=klant.nl&m=1', referrer: '', appHost: APP }), 'klant.nl');
});

test('embeddedHost: zonder ?h= valt terug op de referrer', () => {
  assert.equal(
    embeddedHost({ framed: true, search: '', referrer: 'https://www.klant.nl/contact', appHost: APP }),
    'www.klant.nl',
  );
});

test('embeddedHost: geen host of eigen host → null', () => {
  assert.equal(embeddedHost({ framed: true, search: '', referrer: '', appHost: APP }), null);
  assert.equal(embeddedHost({ framed: true, search: '?h=onbekend', referrer: '', appHost: APP }), null);
  assert.equal(embeddedHost({ framed: true, search: '?h=www.chatmanta.nl', referrer: '', appHost: APP }), null);
  assert.equal(
    embeddedHost({ framed: true, search: '', referrer: 'https://www.chatmanta.nl/v1/app', appHost: APP }),
    null,
  );
});
