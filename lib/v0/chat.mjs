// V0 chat-helper — OpenAI chat completions via gpt-4o-mini.
//
// Bewust apart van lib/ai/llm.ts (de canonical V1 entrypoint die in Fase 4
// Anthropic + OpenAI + streaming krijgt). V0 mag wegwerp zijn; deze helper
// verdwijnt zodra callLLM() ingevuld is.

import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';
// Per-1M-token kosten in USD (OpenAI prijslijst, peildatum 2026-05).
// Houd in sync met lib/ai/llm.ts MODEL_COSTS — die is V1 bron-van-waarheid
// in EUR. V0 logt in USD voor directe match met OpenAI dashboard.
const COST_INPUT_PER_M = 0.15;
const COST_OUTPUT_PER_M = 0.60;

let _client = null;
function client() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing in env');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/**
 * Generate a non-streaming chat completion.
 *
 * @param {object} opts
 * @param {string} opts.system        system prompt
 * @param {string} opts.userMessage   user's question (single-turn for V0)
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.maxTokens=500]
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, costUsd: number}>}
 */
export async function chatV0({ system, userMessage, temperature = 0.2, maxTokens = 500 }) {
  if (typeof system !== 'string' || system.length === 0) {
    throw new TypeError('chatV0 requires a non-empty system prompt');
  }
  if (typeof userMessage !== 'string' || userMessage.length === 0) {
    throw new TypeError('chatV0 requires a non-empty userMessage');
  }

  const resp = await client().chat.completions.create({
    model: MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
  });

  const choice = resp.choices?.[0];
  const text = choice?.message?.content ?? '';
  const inputTokens = resp.usage?.prompt_tokens ?? 0;
  const outputTokens = resp.usage?.completion_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * COST_INPUT_PER_M +
    (outputTokens / 1_000_000) * COST_OUTPUT_PER_M;

  return { text, inputTokens, outputTokens, costUsd };
}

export const V0_CHAT_CONFIG = { MODEL, COST_INPUT_PER_M, COST_OUTPUT_PER_M };
