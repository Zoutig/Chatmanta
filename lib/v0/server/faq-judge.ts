// V0 FAQ judge — uit een lijstje van ≤4 kandidaat-antwoorden voor dezelfde
// vraag-cluster kiest deze laag het beste antwoord. Wordt aangeroepen bij
// "Pre-cache top 5" om te beslissen welk antwoord per cluster naar
// answer_cache geschreven wordt.
//
// Model: gpt-4o-mini (kostbewust). De judge-taak is een 4-way pick — geen
// scoring of grounding-judgement zoals de eval-judge, dus mini is ruim
// voldoende. Bij meten van judge-kwaliteit op echte data kan dit later
// naar gpt-4o als de mini-kwaliteit onvoldoende blijkt.
//
// Fail-safe: parse fail of out-of-range index → returnt null, caller doet
// fallback naar most-recent answer.

import 'server-only';

import OpenAI from 'openai';
import { costForModelUsd } from '../../ai/llm';

const JUDGE_MODEL = 'gpt-4o-mini';
const JUDGE_TEMPERATURE = 0;
const JUDGE_MAX_TOKENS = 250;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export type JudgeResult = {
  winnerIndex: number;
  reasoning: string;
  costUsd: number;
};

const SYSTEM_PROMPT = `Je bent een kwaliteits-judge voor chatbot-antwoorden. Je krijgt één vraag en meerdere kandidaat-antwoorden die eerder door de bot gegeven zijn op vrijwel dezelfde vraag. Kies het antwoord dat de vraag het volledigst en duidelijkst beantwoordt.

Criteria (in volgorde):
1. Beantwoordt de vraag direct (geen ontwijking).
2. Klopt feitelijk en is intern consistent.
3. Voldoende detail zonder ruis of herhaling.
4. Heldere taal, geen vage zinsneden.

Geef je oordeel terug als JSON: {"winner_index": <0-based int>, "reasoning": "<korte zin in NL>"}. Geen andere keys, geen markdown.`;

function buildUserPrompt(question: string, answers: string[]): string {
  const numbered = answers
    .map((a, i) => `[${i}] ${a.trim()}`)
    .join('\n\n---\n\n');
  return `VRAAG:\n${question.trim()}\n\nKANDIDAAT-ANTWOORDEN:\n\n${numbered}\n\nKies de beste index.`;
}

/**
 * Kies het beste antwoord uit ≤4 kandidaten voor dezelfde vraag-cluster.
 *
 * @param question - representative-question voor de cluster
 * @param answers - kandidaat-antwoorden, max 4 (caller sampled bij meer)
 * @returns JudgeResult of null bij parse-fail / out-of-range
 */
export async function judgeBestAnswer(
  question: string,
  answers: string[],
): Promise<JudgeResult | null> {
  if (answers.length === 0) return null;
  if (answers.length === 1) {
    // Trivial case — geen LLM-call nodig, eerste (enige) wint.
    return { winnerIndex: 0, reasoning: 'enige kandidaat', costUsd: 0 };
  }

  const resp = await openai().chat.completions.create({
    model: JUDGE_MODEL,
    temperature: JUDGE_TEMPERATURE,
    max_tokens: JUDGE_MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(question, answers) },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? '';
  const inputTokens = resp.usage?.prompt_tokens ?? 0;
  const outputTokens = resp.usage?.completion_tokens ?? 0;
  const costUsd = costForModelUsd(JUDGE_MODEL, inputTokens, outputTokens);

  // Parse + validate. Bij elke fail returnen we null zodat de caller een
  // fallback kan kiezen (most-recent answer).
  let parsed: { winner_index?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn('[faq-judge] JSON parse fail, raw=', text.slice(0, 200));
    return null;
  }

  const winnerIndex = Number(parsed.winner_index);
  if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= answers.length) {
    console.warn(
      `[faq-judge] winner_index out of range: ${parsed.winner_index} (n=${answers.length})`,
    );
    return null;
  }

  const reasoning =
    typeof parsed.reasoning === 'string' && parsed.reasoning.length > 0
      ? parsed.reasoning
      : 'geen toelichting';

  return { winnerIndex, reasoning, costUsd };
}
