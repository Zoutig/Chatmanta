// Self-check voor de WP5c suspend-gate: een gesuspendeerde org geeft ORG_SUSPENDED
// terug VÓÓR de rate-limit/maand/budget-checks (die de rate-limiter + query_log zouden
// raken). We hoeven daarom alleen de organizations-read te faken — de suspend-return
// short-circuit voordat er iets anders wordt aangeroepen. Run:
//   node --import tsx --conditions=react-server --test lib/v1/limits/__tests__/chat-gates.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkOrgChatGates } from '../chat-gates';

/** Minimale fake: alléén organizations.select(...).eq(...).maybeSingle() wordt geraakt
 *  vóór de suspend-return. Andere from()-tabellen zouden een testfout signaleren. */
function fakeClient(orgRow: { suspended_at: string | null; daily_budget_eur: number | string | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({ data: orgRow, error: null }),
  };
  return {
    from: (table: string) => {
      assert.equal(table, 'organizations', `onverwachte tabel-read vóór suspend-return: ${table}`);
      return chain;
    },
  } as unknown as SupabaseClient;
}

test('checkOrgChatGates — gesuspendeerde org → ORG_SUSPENDED (vóór rate-limit/budget)', async () => {
  const res = await checkOrgChatGates(
    fakeClient({ suspended_at: '2026-07-06T10:00:00.000Z', daily_budget_eur: 1 }),
    'org-1',
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.code, 'ORG_SUSPENDED');
  // Eerlijke melding — géén misleidend "probeer morgen".
  assert.ok(res.ok === false && !/morgen/i.test(res.message));
});
