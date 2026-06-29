// M-A telemetrie DoD-bewijs (non-billable). Bouwt een GECANNED ChatResponse
// (geen LLM/embedding-call → niet billable), logt 'm via de neutrale
// logRagQuery naar V1 query_log, leest de rij terug en assert:
//   (1) cost_eur > 0 en ≈ cost_usd * USD_EUR_RATE (0.92)
//   (2) ip_hash is 16 hex-chars (= hashIp('203.0.113.7'))
//   (3) question/answer bevatten geen plain e-mail meer maar [email] (PII-redactie)
// Ruimt de testrij daarna op.
//
// Vereist: migratie 0007 toegepast op V1-prod + npm run v1:seed (actieve chatbot
// in de seed-org). Draai met: npm run v1:test-log

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { logRagQuery } from '../lib/rag/log-query';
import { hashIp } from '../lib/observability/hash-ip';
import type { ChatResponse } from '../lib/rag/run-rag-query';

const ORG = process.env.V1_SEED_ORG_ID;
if (!ORG) {
  console.error('✗ V1_SEED_ORG_ID vereist');
  process.exit(1);
}

const TOKEN = Math.random().toString(36).slice(2, 10);
const QUESTION = `test ${TOKEN}`;
const FAKE_EMAIL = 'jan@firma.nl';
const COST_USD = 0.005;
const TEST_IP = '203.0.113.7';

const response: ChatResponse = {
  kind: 'answer',
  botVersion: 'ma-test-v1',
  tone: 'neutral',
  length: 'medium',
  generalKnowledgeActual: false,
  answer: `Stuur gerust een mail naar ${FAKE_EMAIL} voor meer informatie.`,
  rewrite: null,
  sources: [],
  threshold: 0.4,
  embedTokens: 100,
  chatInputTokens: 200,
  chatOutputTokens: 50,
  totalCostUsd: COST_USD,
  extras: {
    phaseTimingsMs: { embedding_ms: 5, retrieval_ms: 10, generation_ms: 20, total_ms: 35 },
  },
};

async function main() {
  const svc = getV1ServiceRoleClient();

  const { data: bot } = await svc
    .from('chatbots')
    .select('id')
    .eq('organization_id', ORG as string)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!bot) throw new Error('geen chatbot voor seed-org — draai eerst npm run v1:seed');
  const chatbotId = (bot as { id: string }).id;

  const expectedIpHash = hashIp(TEST_IP);
  const expectedEur = Math.round(COST_USD * (Number(process.env.USD_EUR_RATE) || 0.92) * 1e6) / 1e6;

  try {
    await logRagQuery(svc, {
      question: QUESTION,
      response,
      organizationId: ORG as string,
      chatbotId,
      ipHash: expectedIpHash,
    });

    const { data: rows, error } = await svc
      .from('query_log')
      .select('question, answer, cost_usd, cost_eur, ip_hash, chatbot_id')
      .eq('organization_id', ORG as string)
      .eq('question', QUESTION);
    if (error) throw new Error('teruglezen faalde: ' + error.message);
    if (!rows || rows.length !== 1) throw new Error(`verwachtte 1 rij, kreeg ${rows?.length ?? 0}`);
    const row = rows[0] as {
      question: string;
      answer: string;
      cost_usd: number;
      cost_eur: number;
      ip_hash: string | null;
      chatbot_id: string;
    };

    // (1) cost_eur
    const costEur = Number(row.cost_eur);
    if (!(costEur > 0)) throw new Error(`cost_eur niet > 0: ${row.cost_eur}`);
    if (Math.abs(costEur - expectedEur) > 1e-6) {
      throw new Error(`cost_eur ${costEur} ≠ verwacht ${expectedEur} (cost_usd ${row.cost_usd} * 0.92)`);
    }
    console.log(`✅ (1) cost_eur=${costEur} ≈ cost_usd ${row.cost_usd} * 0.92`);

    // (2) ip_hash
    if (!row.ip_hash || row.ip_hash.length !== 16) throw new Error(`ip_hash niet 16 chars: ${row.ip_hash}`);
    if (row.ip_hash !== expectedIpHash) throw new Error(`ip_hash ${row.ip_hash} ≠ hashIp(${TEST_IP})`);
    console.log(`✅ (2) ip_hash=${row.ip_hash} (16 hex, gepseudonimiseerd, geen plain IP)`);

    // (3) PII-redactie
    if (row.question.includes(FAKE_EMAIL) || row.answer.includes(FAKE_EMAIL)) {
      throw new Error('PII-LEK: plain e-mail staat nog in query_log');
    }
    if (!row.answer.includes('[email]')) throw new Error(`answer bevat geen [email]-masker: ${row.answer}`);
    console.log(`✅ (3) PII geredacteerd: answer="${row.answer}"`);

    console.log('\n✅ M-A telemetrie BEWEZEN: cost_eur + ip_hash + PII-redactie via logRagQuery.');
  } finally {
    await svc.from('query_log').delete().eq('organization_id', ORG as string).like('question', `test ${TOKEN}%`);
    console.log('✓ testrij opgeruimd.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ M-A LOG-PROEF FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
