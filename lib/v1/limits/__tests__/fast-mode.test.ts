// Self-check voor de per-org Fast-mode-schakelaar. Run:
//   node --import tsx --conditions=react-server --test lib/v1/limits/__tests__/fast-mode.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RagConfig } from '@/lib/rag/types';
import { applyFastMode, getOrgFastMode } from '../fast-mode';

function fakeClient(result: { data: unknown; error: unknown } | 'throw') {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      if (result === 'throw') throw new Error('netwerk');
      return result;
    },
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

test('getOrgFastMode — kolom true → aan', async () => {
  assert.equal(await getOrgFastMode(fakeClient({ data: { fast_mode_enabled: true }, error: null }), 'o'), true);
});

test('getOrgFastMode — false / geen rij / leesfout / ontbrekende kolom → uit (goedkope kant)', async () => {
  assert.equal(await getOrgFastMode(fakeClient({ data: { fast_mode_enabled: false }, error: null }), 'o'), false);
  assert.equal(await getOrgFastMode(fakeClient({ data: null, error: null }), 'o'), false);
  assert.equal(await getOrgFastMode(fakeClient({ data: null, error: { message: 'column does not exist' } }), 'o'), false);
  assert.equal(await getOrgFastMode(fakeClient('throw'), 'o'), false);
});

test('applyFastMode — uit haalt beide tiers weg, aan laat de config ongemoeid', () => {
  const base = { chatServiceTier: 'priority', auxServiceTier: 'priority', version: 'v1.0' } as unknown as RagConfig;
  const off = applyFastMode(base, false);
  assert.equal(off.chatServiceTier, undefined);
  assert.equal(off.auxServiceTier, undefined);
  assert.equal(off.version, 'v1.0');
  assert.equal(applyFastMode(base, true), base);
});
