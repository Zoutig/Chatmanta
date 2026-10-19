// Run: node --import tsx --test lib/voorbeeld/__tests__/demo-notice-storage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_NOTICE_KEY, readNoticeSeen, writeNoticeSeen } from '../demo-notice-storage';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

test('demo-notice: verse sessie → niet gezien; na schrijven → gezien', () => {
  const s = memoryStorage();
  assert.equal(readNoticeSeen(s), false);
  writeNoticeSeen(s);
  assert.equal(readNoticeSeen(s), true);
  assert.equal(s.getItem(DEMO_NOTICE_KEY), '1');
});

test('demo-notice: geen of geblokkeerde opslag gooit nooit en telt als niet gezien', () => {
  assert.equal(readNoticeSeen(null), false);
  assert.doesNotThrow(() => writeNoticeSeen(null));
  assert.equal(readNoticeSeen(throwing), false);
  assert.doesNotThrow(() => writeNoticeSeen(throwing));
});

test('demo-notice: alleen de waarde "1" telt als gezien', () => {
  const s = memoryStorage();
  s.setItem(DEMO_NOTICE_KEY, 'true');
  assert.equal(readNoticeSeen(s), false);
});
