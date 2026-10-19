// Unit-test: een Jorion-admin-account wordt nooit gewist bij lid-/org-verwijderen.
// Run: node --import tsx --test lib/v1/admin/__tests__/protected-users.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isProtectedAdminUser } from '../protected-users';

function fake(result: { data: unknown; error: unknown } | 'throw') {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      if (result === 'throw') throw new Error('netwerk');
      return result;
    },
  };
  return {
    from: (table: string) => {
      assert.equal(table, 'users');
      return chain;
    },
  } as unknown as SupabaseClient;
}

test('Jorion-admin → beschermd', async () => {
  assert.equal(await isProtectedAdminUser(fake({ data: { is_jorion_admin: true }, error: null }), 'u'), true);
});

test('gewone user → niet beschermd', async () => {
  assert.equal(await isProtectedAdminUser(fake({ data: { is_jorion_admin: false }, error: null }), 'u'), false);
  assert.equal(await isProtectedAdminUser(fake({ data: null, error: null }), 'u'), false);
});

test('leesfout of exception → fail-closed (beschermd)', async () => {
  assert.equal(await isProtectedAdminUser(fake({ data: null, error: { message: 'x' } }), 'u'), true);
  assert.equal(await isProtectedAdminUser(fake('throw'), 'u'), true);
});
