import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkProductionEnv,
  assertProductionEnv,
  isProductionRuntime,
} from '../startup-assert';

const GOOD_SECRET = 'a'.repeat(32);

test('checkProductionEnv: geldige env → ok', () => {
  assert.deepEqual(checkProductionEnv({ EMBED_TOKEN_SECRET: GOOD_SECRET }), {
    ok: true,
    errors: [],
  });
});

test('checkProductionEnv: ontbrekend EMBED_TOKEN_SECRET → fout', () => {
  const r = checkProductionEnv({});
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /EMBED_TOKEN_SECRET/);
});

test('checkProductionEnv: te kort EMBED_TOKEN_SECRET → fout', () => {
  const r = checkProductionEnv({ EMBED_TOKEN_SECRET: 'short' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /16 chars/);
});

test('checkProductionEnv: USE_UPSTASH=true zonder Redis-vars → fout', () => {
  const r = checkProductionEnv({ EMBED_TOKEN_SECRET: GOOD_SECRET, USE_UPSTASH: 'true' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /UPSTASH/);
});

test('checkProductionEnv: USE_UPSTASH=true mét Redis-vars → ok', () => {
  const r = checkProductionEnv({
    EMBED_TOKEN_SECRET: GOOD_SECRET,
    USE_UPSTASH: 'true',
    UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'tok',
  });
  assert.deepEqual(r, { ok: true, errors: [] });
});

test('checkProductionEnv: USE_UPSTASH niet "true" → Redis-vars niet vereist', () => {
  assert.equal(
    checkProductionEnv({ EMBED_TOKEN_SECRET: GOOD_SECRET, USE_UPSTASH: 'false' }).ok,
    true,
  );
});

test('assertProductionEnv: productie + fout → throwt (fail-closed)', () => {
  assert.throws(
    () => assertProductionEnv({}, { isProduction: true }),
    /EMBED_TOKEN_SECRET/,
  );
});

test('assertProductionEnv: niet-productie + fout → throwt NIET (luide warn)', () => {
  // Onderdruk de verwachte console.error voor schone testoutput.
  const orig = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => assertProductionEnv({}, { isProduction: false }));
  } finally {
    console.error = orig;
  }
});

test('assertProductionEnv: productie + geldige env → throwt NIET', () => {
  assert.doesNotThrow(() =>
    assertProductionEnv({ EMBED_TOKEN_SECRET: GOOD_SECRET }, { isProduction: true }),
  );
});

test('isProductionRuntime: NODE_ENV/VERCEL_ENV', () => {
  assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  assert.equal(isProductionRuntime({}), false);
});
