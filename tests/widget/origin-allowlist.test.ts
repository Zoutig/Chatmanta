// Run: node --import tsx --test tests/widget/origin-allowlist.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHost,
  parseAllowedOrigins,
  evaluateEmbedAccess,
} from '../../lib/widget/origin-allowlist';

test('normalizeHost strips scheme, path, port, query and leading www', () => {
  assert.equal(normalizeHost('https://www.Example.com:443/pad?x=1'), 'example.com');
  assert.equal(normalizeHost('http://shop.example.com/a/b'), 'shop.example.com');
  assert.equal(normalizeHost('Example.COM'), 'example.com');
  assert.equal(normalizeHost('www.example.com'), 'example.com');
});

test('normalizeHost returns null for empty/blank input', () => {
  assert.equal(normalizeHost(''), null);
  assert.equal(normalizeHost('   '), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost(undefined), null);
});

test('parseAllowedOrigins splits on newline/comma, normalizes and dedupes', () => {
  const out = parseAllowedOrigins('example.com\nwww.example.com, https://Shop.Example.com\n\n');
  assert.deepEqual(out, ['example.com', 'shop.example.com']);
});

test('evaluateEmbedAccess fail-opens on empty allowlist', () => {
  assert.equal(evaluateEmbedAccess(undefined, 'https://attacker.test/'), 'open');
  assert.equal(evaluateEmbedAccess([], 'https://attacker.test/'), 'open');
});

test('evaluateEmbedAccess fail-opens when parent host is unknown', () => {
  assert.equal(evaluateEmbedAccess(['example.com'], null), 'open');
  assert.equal(evaluateEmbedAccess(['example.com'], ''), 'open');
});

test('evaluateEmbedAccess allows a matching parent (incl. www variance) via Referer URL', () => {
  assert.equal(evaluateEmbedAccess(['example.com'], 'https://www.example.com/contact'), 'allow');
  assert.equal(evaluateEmbedAccess(['example.com'], 'example.com'), 'allow');
});

test('evaluateEmbedAccess blocks a non-matching parent', () => {
  assert.equal(evaluateEmbedAccess(['example.com'], 'https://attacker.test/'), 'block');
  assert.equal(evaluateEmbedAccess(['example.com'], 'sub.example.com'), 'block');
});
