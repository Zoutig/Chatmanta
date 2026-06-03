// C7 (v0.10) — integratietest: logQuery() redacteert PII in query_log.
//
// Schrijft via de échte logQuery een smalltalk-rij met een e-mail + telefoonnummer in
// zowel de vraag als het antwoord, leest de rij terug en bevestigt dat de opgeslagen
// question/answer geen ruwe PII meer bevatten (maar [email]/[telefoon]-placeholders),
// en ruimt de rij daarna op.
//
// Run: npm run test:pii-log
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { logQuery } from '../lib/v0/server/log';
import type { ChatResponse } from '../lib/v0/server/rag';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

let failed = 0;
function check(name: string, got: boolean, want: boolean) {
  if (got !== want) {
    console.error(`✗ ${name}: got ${got}, want ${want}`);
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

  const id = randomUUID();
  const question = 'Mijn e-mail is jan@example.com en mijn nummer 06-12345678, bel me terug.';
  const resp = {
    kind: 'smalltalk',
    botVersion: 'v0.10',
    tone: 'neutral',
    length: 'medium',
    generalKnowledgeActual: null,
    answer: 'Ik noteer jan@example.com en 06-12345678 voor je.',
    preProcessTokens: { in: 0, out: 0 },
    totalCostUsd: 0,
  } as unknown as ChatResponse;

  await logQuery(question, resp, undefined, DEV_ORG_ID, undefined, undefined, id);

  const { data, error } = await sb
    .from('query_log')
    .select('question, answer')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('✗ kon de geschreven rij niet teruglezen:', error?.message ?? 'geen data');
    failed++;
  } else {
    const q = String((data as { question: string }).question);
    const a = String((data as { answer: string }).answer);
    check('vraag bevat GEEN ruwe e-mail', /jan@example\.com/.test(q), false);
    check('vraag bevat GEEN ruw telefoonnummer', /0612345678/.test(q.replace(/[\s-]/g, '')), false);
    check('vraag is geredacteerd ([email] + [telefoon])', /\[email\]/.test(q) && /\[telefoon\]/.test(q), true);
    check('antwoord bevat GEEN ruwe e-mail', /jan@example\.com/.test(a), false);
    check('antwoord is geredacteerd ([email])', /\[email\]/.test(a), true);
  }

  const { error: delErr } = await sb.from('query_log').delete().eq('id', id);
  if (delErr) {
    console.error(`✗ CLEANUP faalde — verwijder handmatig query_log id=${id}:`, delErr.message);
    failed++;
  } else {
    console.log(`✓ cleanup: test-rij ${id} verwijderd`);
  }
}

main()
  .then(() => {
    if (failed > 0) {
      console.error(`\n✗ ${failed} PII-redactie test(s) gefaald`);
      process.exit(1);
    }
    console.log('\n✓ logQuery redacteert PII in query_log');
  })
  .catch((err) => {
    console.error('✗ onverwachte fout:', err);
    process.exit(1);
  });
