import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appendTurn } from '../write';

// Nep-client: legt per tabel de updates vast; een bestaande thread wordt gevonden.
function fakeClient() {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain;
    b.eq = chain;
    b.is = chain;
    b.in = chain;
    b.maybeSingle = async () => ({ data: { id: 't1', message_count: 4 }, error: null });
    b.update = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      return b;
    };
    b.insert = () => b;
    b.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, updates };
}

const base = { orgId: 'o', chatbotId: 'c', threadId: 't1', question: 'Vraag?', answer: 'Antwoord' };

test('appendTurn: fallback in een bestaand gesprek heropent het (status open)', async () => {
  const { client, updates } = fakeClient();
  await appendTurn(client, { ...base, kind: 'fallback' });
  const bump = updates.find((u) => u.table === 'threads');
  assert.ok(bump);
  assert.equal(bump.values.status, 'open');
  assert.equal(bump.values.message_count, 6);
});

test('appendTurn: een gewoon antwoord laat de status van het gesprek ongemoeid', async () => {
  const { client, updates } = fakeClient();
  await appendTurn(client, { ...base, kind: 'answer' });
  const bump = updates.find((u) => u.table === 'threads');
  assert.ok(bump);
  assert.equal('status' in bump.values, false);
});
