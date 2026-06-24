import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkProductionEnv,
  assertProductionEnv,
  isProductionRuntime,
} from '../startup-assert';

const GOOD_SECRET = 'a'.repeat(32);

// Volledige geldige productie-env: embed-secret + de V0/V1-Supabase-vars die sinds
// de namespace-split (kickoff §3) vereist zijn. Tests die een specifieke fout
// willen, vertrekken vanuit deze basis en halen er één var uit / overschrijven 'm.
const GOOD_ENV = {
  EMBED_TOKEN_SECRET: GOOD_SECRET,
  V0_SUPABASE_URL: 'https://v0.supabase.co',
  V0_SUPABASE_SERVICE_ROLE_KEY: 'v0-key',
  NEXT_PUBLIC_V1_SUPABASE_URL: 'https://v1.supabase.co',
  NEXT_PUBLIC_V1_SUPABASE_ANON_KEY: 'v1-anon',
  V1_SUPABASE_SERVICE_ROLE_KEY: 'v1-key',
};

test('checkProductionEnv: geldige env → ok', () => {
  assert.deepEqual(checkProductionEnv(GOOD_ENV), { ok: true, errors: [] });
});

test('checkProductionEnv: ontbrekend EMBED_TOKEN_SECRET → fout', () => {
  const { EMBED_TOKEN_SECRET: _omit, ...rest } = GOOD_ENV;
  const r = checkProductionEnv(rest);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /EMBED_TOKEN_SECRET/);
});

test('checkProductionEnv: te kort EMBED_TOKEN_SECRET → fout', () => {
  const r = checkProductionEnv({ ...GOOD_ENV, EMBED_TOKEN_SECRET: 'short' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /16 chars/);
});

test('checkProductionEnv: USE_UPSTASH=true zonder Redis-vars → fout', () => {
  const r = checkProductionEnv({ ...GOOD_ENV, USE_UPSTASH: 'true' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /UPSTASH/);
});

test('checkProductionEnv: USE_UPSTASH=true mét Redis-vars → ok', () => {
  const r = checkProductionEnv({
    ...GOOD_ENV,
    USE_UPSTASH: 'true',
    UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'tok',
  });
  assert.deepEqual(r, { ok: true, errors: [] });
});

test('checkProductionEnv: USE_UPSTASH niet "true" → Redis-vars niet vereist', () => {
  assert.equal(checkProductionEnv({ ...GOOD_ENV, USE_UPSTASH: 'false' }).ok, true);
});

test('checkProductionEnv: ontbrekende V0/V1 Supabase-vars → fout', () => {
  const r = checkProductionEnv({ EMBED_TOKEN_SECRET: GOOD_SECRET });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('V0_SUPABASE_URL')));
  assert.ok(r.errors.some((e) => e.includes('V0_SUPABASE_SERVICE_ROLE_KEY')));
  assert.ok(r.errors.some((e) => e.includes('NEXT_PUBLIC_V1_SUPABASE_URL')));
  assert.ok(r.errors.some((e) => e.includes('NEXT_PUBLIC_V1_SUPABASE_ANON_KEY')));
  assert.ok(r.errors.some((e) => e.includes('V1_SUPABASE_SERVICE_ROLE_KEY')));
});

test('checkProductionEnv: één ontbrekende V1-var → precies die fout', () => {
  const { V1_SUPABASE_SERVICE_ROLE_KEY: _omit, ...rest } = GOOD_ENV;
  const r = checkProductionEnv(rest);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /V1_SUPABASE_SERVICE_ROLE_KEY/);
});

test('assertProductionEnv: productie + fout → throwt (fail-closed)', () => {
  assert.throws(() => assertProductionEnv({}, { isProduction: true }), /EMBED_TOKEN_SECRET/);
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
  assert.doesNotThrow(() => assertProductionEnv(GOOD_ENV, { isProduction: true }));
});

test('isProductionRuntime: NODE_ENV/VERCEL_ENV', () => {
  assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  assert.equal(isProductionRuntime({}), false);
});
