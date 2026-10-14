// Self-check voor de per-org Linkknoppen-schakelaar. Run:
//   node --import tsx --conditions=react-server --test lib/v1/org-flags/__tests__/link-buttons.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { V1_RAG_DEFAULTS } from '@/app/v1/app/rag-config';
import { applyLinkButtons, getOrgLinkButtons } from '../link-buttons';

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

test('getOrgLinkButtons — kolom true → aan', async () => {
  assert.equal(await getOrgLinkButtons(fakeClient({ data: { link_buttons_enabled: true }, error: null }), 'o'), true);
});

test('getOrgLinkButtons — false / geen rij / ontbrekende kolom / netwerkfout → uit', async () => {
  assert.equal(await getOrgLinkButtons(fakeClient({ data: { link_buttons_enabled: false }, error: null }), 'o'), false);
  assert.equal(await getOrgLinkButtons(fakeClient({ data: null, error: null }), 'o'), false);
  assert.equal(
    await getOrgLinkButtons(fakeClient({ data: null, error: { message: 'column organizations.link_buttons_enabled does not exist' } }), 'o'),
    false,
  );
  assert.equal(await getOrgLinkButtons(fakeClient('throw'), 'o'), false);
});

test('applyLinkButtons — standaard (uit) = hard rule 9: geen links', () => {
  const off = applyLinkButtons(V1_RAG_DEFAULTS, false);
  assert.equal(off.sourceLinksEnabled, false);
  assert.equal(off.sourceLinksMode, undefined);
  // Ook als een eerdere stap links aanzette: uit wint.
  assert.equal(applyLinkButtons({ ...V1_RAG_DEFAULTS, sourceLinksEnabled: true }, false).sourceLinksEnabled, false);
});

test('applyLinkButtons — aan = alleen-op-verzoek, rest van de config ongemoeid', () => {
  const on = applyLinkButtons(V1_RAG_DEFAULTS, true);
  assert.equal(on.sourceLinksEnabled, true);
  assert.equal(on.sourceLinksMode, 'on-request');
  assert.deepEqual({ ...on, sourceLinksEnabled: false, sourceLinksMode: undefined }, applyLinkButtons(V1_RAG_DEFAULTS, false));
});
