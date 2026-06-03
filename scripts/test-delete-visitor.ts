// C9 (v0.10) — integratietest voor deleteVisitorData (AVG-verwijderpad).
//
// Maakt voor DEZELFDE visitor een thread+bericht aan in TWEE verschillende orgs,
// verwijdert dan de data voor org A, en bevestigt dat org A's rijen weg zijn én org B
// volledig onaangeroerd blijft (org-isolatie). Ruimt org B daarna op.
//
// Run: npm run test:delete-visitor
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { deleteVisitorData } from '../lib/v0/server/threads';
import { KNOWN_ORGS } from '../lib/v0/server/active-org';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✗ Supabase env ontbreekt — draai met --env-file=.env.local');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const orgA = KNOWN_ORGS['dev-org'].id;
  const orgB = KNOWN_ORGS['acme-corp'].id;
  const visitor = `c9-test-${randomUUID().slice(0, 12)}`;

  async function makeThread(orgId: string): Promise<string> {
    const { data: t, error: tErr } = await sb
      .from('v0_threads')
      .insert({ organization_id: orgId, bot_version: 'v0.10', title: 'C9-test', visitor_id: visitor })
      .select('id')
      .single();
    if (tErr || !t) throw new Error(`thread-insert faalde: ${tErr?.message}`);
    const threadId = (t as { id: string }).id;
    const { error: mErr } = await sb.from('v0_thread_messages').insert([
      { thread_id: threadId, position: 0, role: 'user', content: 'hoi' },
      { thread_id: threadId, position: 1, role: 'assistant', content: 'hallo' },
    ]);
    if (mErr) throw new Error(`message-insert faalde: ${mErr.message}`);
    return threadId;
  }

  async function countThreads(orgId: string): Promise<number> {
    const { count } = await sb
      .from('v0_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('visitor_id', visitor);
    return count ?? 0;
  }
  async function countMessages(threadId: string): Promise<number> {
    const { count } = await sb
      .from('v0_thread_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId);
    return count ?? 0;
  }

  const tA = await makeThread(orgA);
  const tB = await makeThread(orgB);

  try {
    check('vóór: org A heeft 1 thread', await countThreads(orgA), 1);
    check('vóór: org B heeft 1 thread', await countThreads(orgB), 1);

    const res = await deleteVisitorData(orgA, visitor);
    check('deleteVisitorData: 1 thread verwijderd', res.threadsDeleted, 1);
    check('deleteVisitorData: 2 berichten verwijderd', res.messagesDeleted, 2);

    check('ná: org A heeft 0 threads (visitor gewist)', await countThreads(orgA), 0);
    check('ná: org A thread-berichten 0 (cascade/expliciet)', await countMessages(tA), 0);
    check('ná: org B ONAANGEROERD — 1 thread', await countThreads(orgB), 1);
    check('ná: org B berichten ONAANGEROERD — 2', await countMessages(tB), 2);
  } finally {
    // Cleanup org B (org A is al gewist door de test).
    await sb.from('v0_thread_messages').delete().eq('thread_id', tB);
    await sb.from('v0_threads').delete().eq('id', tB);
    console.log('✓ cleanup: org B test-rijen verwijderd');
  }
}

main()
  .then(() => {
    if (failed > 0) {
      console.error(`\n✗ ${failed} delete-visitor test(s) gefaald`);
      process.exit(1);
    }
    console.log('\n✓ deleteVisitorData wist de juiste visitor, org-isolatie intact');
  })
  .catch((err) => {
    console.error('✗ onverwachte fout:', err);
    process.exit(1);
  });
