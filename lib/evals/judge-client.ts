// Claude-judge-client voor de eval-suite (plan 016 §2). Eén item per call, structured
// output (JSON-schema), rubric in `system` met cache_control, onbetrouwbare tekst door de
// caller in nonce-tags. Fail-closed: elke afwijking (weigering, afgekapt, verkeerd model,
// schema- of citaatfout) wordt een JudgeFailure — nooit "geen fouten gevonden".
// Geen server-side fallbacks: die zouden stil van model wisselen.
//
// De key is user-scoped → header `anthropic-workspace-id` verplicht (ANTHROPIC_WORKSPACE_ID).

import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';
import { claudeCostUsd, type ClaudeUsage } from './cost';
import { sha256 } from './text';

export const JUDGE_MODEL = 'claude-opus-5-5';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type JudgeCall<T> = {
  /** Stabiel deel: rubric + ankers. Gecachet. */
  system: string;
  /** Het item (vraag, bronnen, antwoord in nonce-tags). */
  user: string;
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens: number;
  model?: string;
  /** Semantische controle ná de schema-parse (citaten e.d.); lege lijst = geldig. */
  validate: (data: T) => string[];
};

export type JudgeSuccess<T> = { ok: true; data: T; usage: ClaudeUsage; costUsd: number; model: string };
export type JudgeFailure = {
  ok: false;
  kind: 'refusal' | 'max_tokens' | 'model_mismatch' | 'parse' | 'invalid' | 'api' | 'stop_reason';
  detail: string;
  usage?: ClaudeUsage;
  costUsd: number;
};
export type JudgeResult<T> = JudgeSuccess<T> | JudgeFailure;

export type Transport = { create(params: MessageCreateParamsNonStreaming): Promise<Message> };

export function anthropicTransport(): Transport & { client: Anthropic } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ontbreekt');
  if (!workspace) throw new Error('ANTHROPIC_WORKSPACE_ID ontbreekt (user-scoped key → header verplicht)');
  const client = new Anthropic({ apiKey, defaultHeaders: { 'anthropic-workspace-id': workspace }, maxRetries: 4 });
  return { client, create: (params) => client.messages.create(params) };
}

/** Params voor één judge-call — gedeeld door het synchrone pad en Batches. */
export function buildParams<T>(call: JudgeCall<T>, maxTokens = call.maxTokens): MessageCreateParamsNonStreaming {
  return {
    model: call.model ?? JUDGE_MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: call.effort, format: { type: 'json_schema', schema: call.schema } },
    system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: call.user }],
  };
}

/** Interpreteer een response (sync of uit een batch) fail-closed. */
export function interpretMessage<T>(msg: Message, call: JudgeCall<T>, opts: { batch?: boolean } = {}): JudgeResult<T> {
  const expected = call.model ?? JUDGE_MODEL;
  const usage = msg.usage as ClaudeUsage;
  const costUsd = claudeCostUsd(expected, usage, opts);
  if (msg.model !== expected) {
    return { ok: false, kind: 'model_mismatch', detail: `verwacht ${expected}, kreeg ${msg.model}`, usage, costUsd };
  }
  if (msg.stop_reason === 'refusal') {
    return { ok: false, kind: 'refusal', detail: JSON.stringify(msg.stop_details ?? null), usage, costUsd };
  }
  if (msg.stop_reason === 'max_tokens') {
    return { ok: false, kind: 'max_tokens', detail: `max_tokens bereikt`, usage, costUsd };
  }
  if (msg.stop_reason !== 'end_turn') {
    return { ok: false, kind: 'stop_reason', detail: String(msg.stop_reason), usage, costUsd };
  }
  const text = msg.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch (e) {
    return { ok: false, kind: 'parse', detail: `${e instanceof Error ? e.message : e}: ${text.slice(0, 200)}`, usage, costUsd };
  }
  const problems = call.validate(data);
  if (problems.length > 0) return { ok: false, kind: 'invalid', detail: problems.join('; '), usage, costUsd };
  return { ok: true, data, usage, costUsd, model: msg.model };
}

/**
 * Synchrone judge-call. max_tokens → één keer opnieuw met het dubbele (max 64k);
 * ongeldig oordeel (citaat/schema) → één keer opnieuw. Alle kosten tellen mee via onCost.
 */
export async function judge<T>(
  transport: Transport,
  call: JudgeCall<T>,
  onCost: (usd: number, model: string) => void,
): Promise<JudgeResult<T>> {
  let maxTokens = call.maxTokens;
  let invalidRetries = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    let msg: Message;
    try {
      msg = await transport.create(buildParams(call, maxTokens));
    } catch (e) {
      return { ok: false, kind: 'api', detail: e instanceof Error ? e.message : String(e), costUsd: 0 };
    }
    const r = interpretMessage(msg, call);
    onCost(r.costUsd, call.model ?? JUDGE_MODEL);
    if (r.ok) return r;
    if (r.kind === 'max_tokens' && maxTokens < 64_000) {
      maxTokens = Math.min(64_000, maxTokens * 2);
      continue;
    }
    if ((r.kind === 'invalid' || r.kind === 'parse') && invalidRetries < 1) {
      invalidRetries++;
      continue;
    }
    return r;
  }
  return { ok: false, kind: 'max_tokens', detail: 'herhaald afgekapt', costUsd: 0 };
}

/**
 * judge_config_id: hash van alles wat een oordeel kan veranderen. Vergelijken mag alleen
 * binnen één id (plan 016 §2.7).
 */
export function judgeConfigId(parts: {
  rubric: string;
  schema: Record<string, unknown>;
  template: string;
  model: string;
  effort: Effort;
}): string {
  return sha256(JSON.stringify([parts.rubric, parts.schema, parts.template, parts.model, parts.effort])).slice(0, 12);
}
