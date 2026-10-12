// Bot-kant van de eval-suite: draait vragen over exact het V1-widget-pad
// (app/v1/app/widget-chat.ts) en schrijft per antwoord één JSONL-regel. Hervatbaar:
// bestaande sleutels (case#run) worden overgeslagen. Infra-fouten gaan naar errors.jsonl,
// nooit als "antwoord". Geen writes naar de DB: cache uit (afgedwongen op het eval-pad),
// geen logRagQuery, geen transcript, org-gates overgeslagen.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatResponse } from '@/lib/rag/run-rag-query';
import { foldV1FinalResponse, prepareV1WidgetChat, v1InjectionBlock } from '@/app/v1/app/widget-chat';
import { sha256 } from './text';

export type EvalCase = {
  id: string;
  organizationId: string;
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /**
   * Eerdere bezoekersberichten (testset `priorTurns`): de runner speelt ze eerst door de
   * bot, zodat de laatste vraag een échte gespreksgeschiedenis heeft.
   */
  priorTurns?: string[];
};

export type AnswerRecord = {
  key: string;
  caseId: string;
  run: number;
  botVersion: string;
  /** Effectieve config op het moment van de run (model/tier kunnen per org verschillen). */
  config: { chatModel: string; chatServiceTier: string | null; auxModel: string; versionLabel: string; embeddingModel: string };
  /** 'answer' | 'fallback' | 'smalltalk' | 'injection' | 'paused' | 'gated' */
  kind: string;
  answer: string;
  sources: string[];
  /** Volledige gespreksgeschiedenis vóór de laatste vraag (incl. de door de bot gespeelde beurten). */
  history: { role: 'user' | 'assistant'; content: string }[];
  /** Exacte CONTEXT van de antwoord-call; null als er geen antwoord-call was. */
  context: string | null;
  systemPromptSha: string | null;
  ttftMs: number | null;
  totalMs: number;
  costUsd: number;
  ts: string;
};

const keyOf = (caseId: string, run: number) => `${caseId}#${run}`;

function readKeys(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const keys = new Set<string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    keys.add((JSON.parse(line) as { key: string }).key);
  }
  return keys;
}

export async function runV1Answers(
  svc: SupabaseClient,
  opts: {
    cases: EvalCase[];
    botVersion: string;
    runs: number;
    outDir: string;
    log?: (s: string) => void;
  },
): Promise<{ written: number; skipped: number; errors: number }> {
  const log = opts.log ?? console.log;
  mkdirSync(opts.outDir, { recursive: true });
  const answersPath = join(opts.outDir, 'answers.jsonl');
  const errorsPath = join(opts.outDir, 'errors.jsonl');
  const done = readKeys(answersPath);
  let written = 0;
  let skipped = 0;
  let errors = 0;

  // Runs door elkaar (run 0 van alle cases, dan run 1 …) zodat tijdstip-effecten op
  // latency/kosten niet met één case samenvallen.
  for (let run = 0; run < opts.runs; run++) {
    for (const c of opts.cases) {
      const key = keyOf(c.id, run);
      if (done.has(key)) {
        skipped++;
        continue;
      }
      const t0 = performance.now();
      try {
        const rec = await answerOne(svc, c, run, opts.botVersion, t0);
        appendFileSync(answersPath, JSON.stringify(rec) + '\n');
        written++;
        log(`✓ ${key} ${rec.kind} $${rec.costUsd.toFixed(4)}`);
      } catch (e) {
        errors++;
        appendFileSync(
          errorsPath,
          JSON.stringify({ key, stage: 'bot', error: e instanceof Error ? e.message : String(e), ts: new Date().toISOString() }) + '\n',
        );
        log(`✗ ${key} ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return { written, skipped, errors };
}

async function answerOne(
  svc: SupabaseClient,
  c: EvalCase,
  run: number,
  botVersion: string,
  t0: number,
): Promise<AnswerRecord> {
  const history = [...(c.history ?? [])];
  let priorCost = 0;
  for (const [i, turn] of (c.priorTurns ?? []).entries()) {
    const r = await answerTurn(svc, { ...c, id: `${c.id}~${i}`, question: turn, history: [...history], priorTurns: [] }, run, botVersion, performance.now());
    history.push({ role: 'user', content: turn }, { role: 'assistant', content: r.answer });
    priorCost += r.costUsd;
  }
  // Latency telt alleen de laatste beurt; kosten tellen het hele gesprek.
  const rec = await answerTurn(svc, { ...c, history }, run, botVersion, c.priorTurns?.length ? performance.now() : t0);
  return { ...rec, costUsd: rec.costUsd + priorCost };
}

async function answerTurn(
  svc: SupabaseClient,
  c: EvalCase,
  run: number,
  botVersion: string,
  t0: number,
): Promise<AnswerRecord> {
  const base = { key: keyOf(c.id, run), caseId: c.id, run, botVersion, ts: new Date().toISOString() };
  const history = c.history ?? [];

  const injection = v1InjectionBlock(c.question);
  if (injection) {
    return {
      ...base,
      config: { chatModel: '-', chatServiceTier: null, auxModel: '-', versionLabel: '-', embeddingModel: '-' },
      kind: 'injection',
      answer: injection.response.answer,
      sources: [],
      history,
      context: null,
      systemPromptSha: null,
      ttftMs: null,
      totalMs: performance.now() - t0,
      costUsd: 0,
    };
  }

  let prompt: { context: string; systemPrompt: string } | null = null;
  const chat = await prepareV1WidgetChat(svc, {
    organizationId: c.organizationId,
    question: c.question,
    history,
    orgGates: 'skip',
    botVersion,
    evalOptions: {
      includeFullParentContent: true,
      onAnswerPrompt: (p) => {
        prompt = { context: p.context, systemPrompt: p.systemPrompt };
      },
    },
  });
  if (chat.kind === 'no-chatbot') throw new Error(`geen chatbot voor org ${c.organizationId}`);
  if (chat.kind === 'terminal') {
    // Met orgGates 'skip' kan alleen 'paused' hier komen — dat is een opzetfout.
    throw new Error(`terminal ${chat.reason} voor org ${c.organizationId}`);
  }

  const cfg = chat.config;
  let final: ChatResponse | null = null;
  let ttftMs: number | null = null;
  for await (const ev of chat.generator) {
    if (ev.kind === 'error') throw new Error(`engine-error ${'code' in ev ? ev.code : ''}`);
    if (ttftMs === null && ev.kind === 'answer-delta') ttftMs = performance.now() - t0;
    final = foldV1FinalResponse(final, ev);
  }
  if (!final) throw new Error('geen eind-response');
  const captured = prompt as { context: string; systemPrompt: string } | null;
  return {
    ...base,
    config: {
      chatModel: cfg.chatModel,
      chatServiceTier: cfg.chatServiceTier ?? null,
      auxModel: cfg.auxModel ?? cfg.chatModel,
      versionLabel: cfg.version,
      embeddingModel: cfg.embeddingModel ?? 'text-embedding-3-small',
    },
    kind: final.kind,
    answer: final.answer,
    history,
    sources: 'sources' in final ? final.sources.map((s) => s.filename ?? 'bron') : [],
    context: captured?.context ?? null,
    systemPromptSha: captured ? sha256(captured.systemPrompt).slice(0, 12) : null,
    ttftMs,
    totalMs: performance.now() - t0,
    costUsd: Number(final.totalCostUsd) || 0,
  };
}
