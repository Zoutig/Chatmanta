// Run: node --import tsx --test app/v1/app/widget/__tests__/format.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedFields, formatLastSeen, normalizeHex } from '../format';

test('formatLastSeen: altijd Amsterdamse tijd, ongeacht de server-tijdzone', () => {
  // Winter (UTC+1) en zomer (UTC+2).
  assert.equal(formatLastSeen('2026-01-15T13:03:00Z'), '15 jan, 14:03');
  assert.equal(formatLastSeen('2026-07-03T12:03:00Z'), '3 jul, 14:03');
  assert.equal(formatLastSeen('onzin'), '');
});

test('changedFields: alleen gewijzigde velden', () => {
  const base = { a: '1', b: '2', c: null as string | null };
  assert.deepEqual(changedFields(base, { ...base }), {});
  assert.deepEqual(changedFields(base, { ...base, b: '3' }), { b: '3' });
  assert.deepEqual(changedFields(base, { ...base, c: 'logo' }), { c: 'logo' });
});

test('normalizeHex: 3- en 6-hex, anders null', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('0c1e2e'), '#0c1e2e');
  assert.equal(normalizeHex(' #0C1E2E '), '#0c1e2e');
  assert.equal(normalizeHex('#abcd'), null);
  assert.equal(normalizeHex('blauw'), null);
});
