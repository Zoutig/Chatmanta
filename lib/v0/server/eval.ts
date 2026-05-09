// V0 eval framework — judge + orchestrator.
//
// Scope: zelfstandige LLM-as-judge laag bovenop runRagQueryStreaming uit ./rag.ts.
// Server-only (importeert OpenAI met service-role-stijl client). Wordt
// aangeroepen vanuit scripts/v0-eval-run.mjs (CLI) en — voor de detail-view —
// niet vanuit Next.js server actions (eval-runs lopen offline).
//
// Cost-bewust: judge draait op gpt-4o (sterker dan de bot, andere blind spots).
// Voor 15 vragen × 3 versies → ~45 judge-calls × ~$0.005 = ~$0.25 per run.

import 'server-only';

import OpenAI from 'openai';
import { performance } from 'node:perf_hooks';

import {
  runRagQueryStreaming,
  type ChatResponse,
  type ChatSource,
} from './rag';
import { resolveBot, type BotConfig } from './bots';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const JUDGE_MODEL = 'gpt-4o';
const JUDGE_TEMPERATURE = 0.0;
const JUDGE_MAX_TOKENS = 600;
// gpt-4o pricing (USD per 1M tokens) — hardcoded, judge is altijd gpt-4o.
const JUDGE_INPUT_PER_M_USD = 2.5;
const JUDGE_OUTPUT_PER_M_USD = 10.0;

// ---------------------------------------------------------------------------
// Lazy OpenAI client
// ---------------------------------------------------------------------------
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type EvalQuestion = {
  id: string;
  slug: string;
  question: string;
  gold_answer: string;
  gold_facts: string[];
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
};

export type JudgeScores = {
  correctness: number | null;
  completeness: number | null;
  grounding: number | null;
  reasoning: string;
  parseError: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type EvalRunRow = {
  organization_id: string;
  question_id: string;
  bot_version: string;
  judge_model: string;
  bot_kind: 'answer' | 'fallback' | 'smalltalk';
  bot_answer: string;
  bot_sources: { filename: string | null; similarity: number; excerpt: string }[];
  bot_cost_usd: number;
  bot_latency_ms: number;
  score_correctness: number | null;
  score_completeness: number | null;
  score_grounding: number | null;
  judge_reasoning: string;
  judge_parse_error: boolean;
  judge_cost_usd: number;
  judge_latency_ms: number;
};

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------
const JUDGE_SYSTEM = `Je bent een onafhankelijke evaluator van een Nederlandse RAG-chatbot voor MKB-klanten. Je geeft drie scores van 0-5 en een korte motivatie.

DRIE DIMENSIES:

1. correctness (0-5): klopt het bot-antwoord met het gold_answer?
   - 5: feitelijk volledig correct, geen tegenspraak.
   - 3: grotendeels correct, klein detail af.
   - 1: deels correct, belangrijke fout aanwezig.
   - 0: feitelijk fout, misleidend, of (bij out-of-corpus vragen) een verzonnen specifiek antwoord ipv een eerlijke refusal.

2. completeness (0-5): zitten de gold_facts in het bot-antwoord?
   - Als gold_facts leeg is: score op basis van of het antwoord de strekking van het gold_answer raakt (5 = volledig, 0 = compleet anders onderwerp).
   - Anders proportioneel: 5 = alle facts terug te vinden, 4 = één mist, 3 = twee missen, 2 = drie missen, 1 = vier+ missen, 0 = geen enkele fact terug.

3. grounding (0-5): worden alleen feiten genoemd die uit de bot-sources volgen?
   - 5: elk feit traceerbaar naar een source, geen hallucinatie, geen meta-talk ("uit de context blijkt", "in de documenten staat" etc).
   - 3: één klein feit niet in sources of subtiele meta-talk.
   - 1: meerdere niet-onderbouwde feiten.
   - 0: hallucinatie van specifieke claims (bedragen, namen, percentages, datums).
   - SPECIAAL — smalltalk-antwoord (bot_kind="smalltalk", geen sources): grounding=5 (geen feiten te onderbouwen).
   - SPECIAAL — fallback-antwoord (bot_kind="fallback"): grounding=5 (refusal = geen claims om ungroundedly te asserten).

OUTPUT — STRIKT JSON, geen markdown, geen prose buiten het JSON-object:
{
  "correctness": <int 0-5>,
  "completeness": <int 0-5>,
  "grounding": <int 0-5>,
  "reasoning": "<2-4 zinnen Nederlands — noem specifiek welke gold_facts ontbraken of welke claims niet in de sources te vinden waren>"
}`;

function buildJudgeUserPrompt(args: {
  question: EvalQuestion;
  response: ChatResponse;
}): string {
  const { question, response } = args;

  let botKind: string;
  let botAnswer: string;
  let sources: ChatSource[] = [];

  if (response.kind === 'smalltalk') {
    botKind = 'smalltalk';
    botAnswer = response.answer;
  } else {
    botKind = response.kind;
    botAnswer = response.answer;
    sources = response.sources;
  }

  const sourceLines = sources.length === 0
    ? '(geen sources — bot deed geen retrieval)'
    : sources
        .map((s, i) => `[${i + 1}] ${s.filename ?? 'onbekend'}: ${s.contentExcerpt}`)
        .join('\n');

  const factsBlock = question.gold_facts.length === 0
    ? '(leeg — score completeness puur op de strekking van gold_answer)'
    : question.gold_facts.map((f) => `- ${f}`).join('\n');

  return `VRAAG (difficulty=${question.difficulty}):
${question.question}

GOLD_ANSWER:
${question.gold_answer}

GOLD_FACTS:
${factsBlock}

BOT_KIND: ${botKind}

BOT_SOURCES:
${sourceLines}

BOT_ANSWER:
${botAnswer}

Beoordeel volgens de drie dimensies. Geef alleen JSON terug.`;
}

function clampScore(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 5) return null;
  return r;
}

// ---------------------------------------------------------------------------
// Judge call
// ---------------------------------------------------------------------------
export async function runJudge(args: {
  question: EvalQuestion;
  response: ChatResponse;
}): Promise<JudgeScores> {
  const userPrompt = buildJudgeUserPrompt(args);
  const start = performance.now();

  let raw = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const resp = await openai().chat.completions.create({
      model: JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      max_tokens: JUDGE_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });
    raw = resp.choices[0]?.message?.content ?? '';
    inputTokens = resp.usage?.prompt_tokens ?? 0;
    outputTokens = resp.usage?.completion_tokens ?? 0;
  } catch (err) {
    return {
      correctness: null,
      completeness: null,
      grounding: null,
      reasoning: `judge API error: ${err instanceof Error ? err.message : 'unknown'}`,
      parseError: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  const latencyMs = Math.round(performance.now() - start);
  const costUsd =
    (inputTokens / 1_000_000) * JUDGE_INPUT_PER_M_USD +
    (outputTokens / 1_000_000) * JUDGE_OUTPUT_PER_M_USD;

  // Parse JSON. response_format=json_object garandeert het basis-format,
  // maar score-velden kunnen nog steeds van type afwijken.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      correctness: null,
      completeness: null,
      grounding: null,
      reasoning: `judge parse error — raw: ${raw.slice(0, 300)}`,
      parseError: true,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const correctness = clampScore(obj.correctness);
  const completeness = clampScore(obj.completeness);
  const grounding = clampScore(obj.grounding);
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

  if (correctness === null || completeness === null || grounding === null) {
    return {
      correctness,
      completeness,
      grounding,
      reasoning: reasoning || `judge produced invalid scores in JSON: ${raw.slice(0, 300)}`,
      parseError: true,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  return {
    correctness,
    completeness,
    grounding,
    reasoning,
    parseError: false,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Single (question × version) run
// ---------------------------------------------------------------------------
export async function runEvalRow(args: {
  organizationId: string;
  question: EvalQuestion;
  bot: BotConfig;
}): Promise<EvalRunRow> {
  const { organizationId, question, bot } = args;

  // Cache uit tijdens eval — anders cached v0.3 antwoord 1 en hergebruikt
  // dat voor identieke vragen in een herhaalde run, wat de eval onbetrouwbaar
  // maakt voor de RAG-pipeline zelf.
  const evalBot: BotConfig = bot.cacheEnabled ? { ...bot, cacheEnabled: false } : bot;

  // Drijf de eval door dezelfde streaming pipeline die de UI gebruikt — anders
  // mist v0.3 zijn cache/decompose/HyDE/hybrid/rerank/cascade/follow-ups en
  // meten we niet wat de eindgebruiker krijgt. De streaming-versie doet ook
  // zelf de v0.3 structured-output parse (parseV03Output) zodat het
  // eind-antwoord clean is.
  const botStart = performance.now();
  let response: ChatResponse | null = null;
  let streamErr: string | null = null;
  try {
    for await (const ev of runRagQueryStreaming({
      question: question.question,
      threshold: evalBot.similarityThreshold,
      enableRewrite: evalBot.enableRewriteByDefault,
      bot: evalBot,
    })) {
      if (ev.kind === 'smalltalk' || ev.kind === 'fallback' || ev.kind === 'answer-done') {
        response = ev.response;
      } else if (ev.kind === 'error') {
        streamErr = ev.message;
      }
    }
  } catch (err) {
    streamErr = err instanceof Error ? err.message : 'unknown';
  }

  const botLatencyMs = Math.round(performance.now() - botStart);

  if (!response) {
    // Stream eindigde zonder smalltalk/fallback/answer-done — synthetic
    // fallback-rij zodat de run niet hangt en regressies zichtbaar blijven.
    return {
      organization_id: organizationId,
      question_id: question.id,
      bot_version: bot.version,
      judge_model: JUDGE_MODEL,
      bot_kind: 'fallback',
      bot_answer: `[bot error] ${streamErr ?? 'stream ended without terminal event'}`,
      bot_sources: [],
      bot_cost_usd: 0,
      bot_latency_ms: botLatencyMs,
      score_correctness: 0,
      score_completeness: 0,
      score_grounding: 0,
      judge_reasoning: 'bot threw exception — niet beoordeeld door judge',
      judge_parse_error: true,
      judge_cost_usd: 0,
      judge_latency_ms: 0,
    };
  }

  // Judge call.
  const judge = await runJudge({ question, response });

  // Sources snapshot (compact, geen embedding/uuid noise).
  const botSources =
    response.kind === 'smalltalk'
      ? []
      : response.sources.map((s) => ({
          filename: s.filename,
          similarity: s.similarity,
          excerpt: s.contentExcerpt,
        }));

  return {
    organization_id: organizationId,
    question_id: question.id,
    bot_version: bot.version,
    judge_model: JUDGE_MODEL,
    bot_kind: response.kind,
    bot_answer: response.answer,
    bot_sources: botSources,
    bot_cost_usd: response.totalCostUsd,
    bot_latency_ms: botLatencyMs,
    score_correctness: judge.correctness,
    score_completeness: judge.completeness,
    score_grounding: judge.grounding,
    judge_reasoning: judge.reasoning,
    judge_parse_error: judge.parseError,
    judge_cost_usd: judge.costUsd,
    judge_latency_ms: judge.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper — simpele semaforie zonder externe dep.
// ---------------------------------------------------------------------------
export async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Bot-version helper — leest BOTS registry zonder side effects.
// ---------------------------------------------------------------------------
export function getBotsForEval(versions?: string[]): BotConfig[] {
  if (!versions || versions.length === 0) {
    // Geen filter → alle versies in registry.
    // Import dynamisch om circular-import te vermijden in CLI-context.
    // (BOTS is een gewoon object — direct import via bots.ts is ok.)
    // Hier voor symmetrie via resolveBot per versie als de caller een
    // expliciete lijst wil.
    return [];
  }
  return versions.map((v) => resolveBot(v));
}
