// Run: node --import tsx --test app/v1/_ui/__tests__/nav.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNavActive,
  activeIndex,
  formatCount,
  initials,
  STATUS_LABEL,
  NAV_ITEM_PITCH,
} from '../nav';

test('isNavActive: exact match alleen op het pad zelf', () => {
  assert.equal(isNavActive('/v1/app', '/v1/app', true), true);
  assert.equal(isNavActive('/v1/app/kennisbank', '/v1/app', true), false);
});

test('isNavActive: niet-exact matcht ook subpaden', () => {
  assert.equal(isNavActive('/v1/app/gesprekken/abc', '/v1/app/gesprekken'), true);
  assert.equal(isNavActive('/v1/app/gesprekken', '/v1/app/gesprekken'), true);
  assert.equal(isNavActive('/v1/app/gesprekkenx', '/v1/app/gesprekken'), false);
});

test('activeIndex: index van het actieve item, -1 als geen', () => {
  const items = [
    { href: '/v1/app', exact: true },
    { href: '/v1/app/gesprekken' },
    { href: '/v1/app/kennisbank' },
  ];
  assert.equal(activeIndex('/v1/app', items), 0);
  assert.equal(activeIndex('/v1/app/kennisbank', items), 2);
  assert.equal(activeIndex('/v1/app/account', items), -1);
});

test('formatCount: null bij 0/undefined, 99+ boven 99', () => {
  assert.equal(formatCount(undefined), null);
  assert.equal(formatCount(0), null);
  assert.equal(formatCount(3), '3');
  assert.equal(formatCount(100), '99+');
});

test('initials: twee letters uit de naam', () => {
  assert.equal(initials('Manta Demo'), 'MD');
  assert.equal(initials('bakkerij'), 'BA');
  assert.equal(initials('   '), 'CM');
});

test('STATUS_LABEL dekt alle chatbotstatussen', () => {
  assert.deepEqual(STATUS_LABEL, {
    concept: 'Concept',
    testing: 'Testmodus',
    live: 'Live',
    paused: 'Gepauzeerd',
  });
});

test('NAV_ITEM_PITCH = itemhoogte 40 + gap 2', () => {
  assert.equal(NAV_ITEM_PITCH, 42);
});
