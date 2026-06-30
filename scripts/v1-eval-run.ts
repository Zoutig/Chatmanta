// One-off V1 answer-quality + anti-hallucination eval (billable: gpt-4o-mini bot-gen).
// Drives the REAL V1 path (neutral runRagQuery) against the seed-org (Manta) corpus,
// mirroring askV1 (settings → overrides/persona) but with disableCache:true (askV1 runs
// cache ON) + includeFullParentContent:true (honest grounding). The service-role client
// is injected as BOTH client + serviceClient (offline eval, no session → bypass RLS;
// org/chatbot explicitly scoped). Captures the FINAL terminal ChatResponse (replacement
// wins over answer-done), runs deterministic safety-checks, and writes answers.json.
// Judging (grounded correctness) is done separately by Claude ($0). No DB writes.
//
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-eval-run.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { runRagQuery, type ChatResponse } from '../lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, getOrgChatbot } from '../app/v1/app/rag-config';
import { getChatbotSettings, buildV1ChatbotInputs } from '../app/v1/app/instellingen/settings-config';

type Case = {
  id: string;
  type: 'grounded' | 'refuse' | 'isolation' | 'offtopic' | 'injection';
  question: string;
  goldFacts?: string[];
  mustNot?: string[];
  note?: string;
};

const ORG = process.env.V1_SEED_ORG_ID;
if (!ORG) {
  console.error('✗ V1_SEED_ORG_ID vereist');
  process.exit(1);
}

const fixture = JSON.parse(readFileSync('eval-fixtures/v1-eval-cases.json', 'utf8')) as { cases: Case[] };

async function main() {
  const svc = getV1ServiceRoleClient();
  const chatbot = await getOrgChatbot(svc, ORG as string);
  if (!chatbot) throw new Error('geen actieve chatbot voor de seed-org — draai v1:seed:chunks');

  const config = { ...V1_RAG_DEFAULTS, version: chatbot.bot_version };
  const settings = await getChatbotSettings(svc, chatbot.id);
  const { overrides, persona } = buildV1ChatbotInputs(settings, chatbot.name);

  const results: unknown[] = [];
  let totalCostUsd = 0;

  for (const c of fixture.cases) {
    let final: ChatResponse | null = null;
    let followupCost = 0;
    try {
      for await (const ev of runRagQuery(svc, {
        question: c.question,
        threshold: config.similarityThreshold,
        enableRewrite: config.enableRewriteByDefault,
        config,
        persona,
        organizationId: ORG as string,
        chatbotId: chatbot.id,
        serviceClient: svc,
        tone: overrides.tone,
        length: overrides.length,
        chatbotOverrides: overrides,
        disableCache: true, // KRITISCH: askV1 draait cache AAN → anders meet de eval de cache
        includeFullParentContent: true, // eerlijke grounding-meting
      })) {
        if (ev.kind === 'answer-done' || ev.kind === 'fallback' || ev.kind === 'smalltalk' || ev.kind === 'replacement') {
          final = ev.response;
        } else if (ev.kind === 'followups-done') {
          followupCost += ev.costUsd ?? 0;
        }
      }
    } catch (e) {
      results.push({ id: c.id, type: c.type, question: c.question, error: e instanceof Error ? e.message : String(e) });
      console.error(`✗ ${c.id} FOUT:`, e instanceof Error ? e.message : e);
      continue;
    }

    const answer = final?.answer ?? '';
    const kind = final?.kind ?? 'none';
    const extras = (final && final.kind === 'answer' ? final.extras : undefined) as Record<string, unknown> | undefined;
    const deterministicRefusal = extras?.deterministicHardFactRefusal === true;
    const isRefusalKind = kind === 'fallback' || kind === 'smalltalk';
    const sourceList = final && (final.kind === 'answer' || final.kind === 'fallback') ? final.sources : [];
    const caseCost = (final ? Number(final.totalCostUsd) || 0 : 0) + followupCost;
    totalCostUsd += caseCost;

    // Deterministische checks
    const lc = answer.toLowerCase();
    const mustNotHits = (c.mustNot ?? []).filter((s) => lc.includes(s.toLowerCase()));
    const canaryLeaked = mustNotHits.length > 0;

    results.push({
      id: c.id,
      type: c.type,
      question: c.question,
      goldFacts: c.goldFacts,
      note: c.note,
      kind,
      refusalSignal: isRefusalKind || deterministicRefusal,
      deterministicRefusal,
      canaryLeaked,
      mustNotHits,
      sources: sourceList.map((s) => s.filename ?? 'bron'),
      answer,
      caseCostUsd: Number(caseCost.toFixed(6)),
    });
    const flag = canaryLeaked ? '🚨LEAK' : isRefusalKind || deterministicRefusal ? 'refuse' : 'answer';
    console.log(`✓ ${c.id} [${c.type}] kind=${kind} ${flag} cost=$${caseCost.toFixed(5)}`);
  }

  mkdirSync('eval-out/v1', { recursive: true });
  const out = { runAt: new Date().toISOString(), org: ORG, chatbot: chatbot.id, botVersion: chatbot.bot_version, totalCostUsd: Number(totalCostUsd.toFixed(6)), results };
  const path = 'eval-out/v1/answers.json';
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\n✅ ${fixture.cases.length} cases gedraaid · totale bot-gen-cost ≈ $${totalCostUsd.toFixed(4)} · → ${path}`);
  const leaks = results.filter((r) => (r as { canaryLeaked?: boolean }).canaryLeaked);
  if (leaks.length) console.error(`🚨 ${leaks.length} CANARY-LEAK(s):`, leaks.map((r) => (r as { id: string }).id).join(', '));
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌ EVAL FOUT:', e); process.exit(1); });
