import 'server-only';

import OpenAI from 'openai';
import type { RagConfig as BotConfig, RagPersona as OrgPersona } from '@/lib/rag/types';
import {
  parseReclassifyOutput,
  ReclassifyResult,
  RECLASSIFY_SYSTEM,
  DOMAIN_ALLOWLIST,
  buildReclassifySystem,
} from './reclassify-pure';

// V0.5 — tweede-stage classifier voor het zero-hit-pad in runRagQueryStreaming.
//
// Flow (zie spec Item 1 "definitieve flow"):
//   preProcess → SEARCH chosen → retrieve → IF aboveThreshold.length === 0
//                                          AND bot.generalKnowledgeEnabled
//                                          → reclassifyAfterZeroHits(...)
//                                          → 'general' | 'off_topic' | 'fallback'
//
// Eén LLM-call, bot.chatModel (gpt-4o-mini default) — ~$0.0001.
// Bij parse-error of API-error: 'fallback' (= huidige FALLBACK_MESSAGE pad).
// Dat is een conservatieve degradation: bij twijfel weigeren we ipv riskeren
// dat een verzonnen "general"-antwoord een echte zoekvraag was.

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export type ReclassifyOutput = {
  category: ReclassifyResult;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * Tweede-stage classifier. Niet aan te roepen vanuit de pre-processor zelf
 * (die heeft geen retrieval-info); alleen vanuit runRagQueryStreaming bij
 * zero-hit retrieval EN bot.generalKnowledgeEnabled.
 *
 * Cost: één LLM-call met bot.chatModel (gpt-4o-mini default) ~$0.0001.
 * Faalt veilig: bij API/parse-error retourneert 'fallback' zodat de bestaande
 * FALLBACK_MESSAGE-flow draait (= geen LLM-call voor het antwoord).
 */
export async function reclassifyAfterZeroHits(
  question: string,
  bot: BotConfig,
  persona?: OrgPersona,
): Promise<ReclassifyOutput> {
  const fallbackResult: ReclassifyOutput = {
    category: 'fallback',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  // Per-org domain. Geen persona → DEV_ORG defaults via buildReclassifySystem.
  // Reden voor de keuze: voor Initech (accountancy) is "wat is btw?" een GENERAL
  // vraag binnen hun domein — met de oude hard-coded MKB/SaaS/AI/RAG-keyword-
  // lijst werd dat als OFF_TOPIC geclassificeerd en kreeg de gebruiker een
  // beleefde refusal voor een legitieme domein-vraag.
  const systemPrompt = persona
    ? buildReclassifySystem(persona.domainKeywords, persona.company)
    : RECLASSIFY_SYSTEM;
  try {
    const resp = await openai().chat.completions.create({
      model: bot.chatModel,
      temperature: 0.0,
      max_tokens: 10,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? '';
    const inputTokens = resp.usage?.prompt_tokens ?? 0;
    const outputTokens = resp.usage?.completion_tokens ?? 0;

    // OpenAI gpt-4o-mini pricing (as of May 2026)
    const CHAT_INPUT_PER_M_USD = 0.15;
    const CHAT_OUTPUT_PER_M_USD = 0.6;
    const costUsd =
      (inputTokens / 1_000_000) * CHAT_INPUT_PER_M_USD +
      (outputTokens / 1_000_000) * CHAT_OUTPUT_PER_M_USD;

    const parsed = parseReclassifyOutput(text);
    if (!parsed) {
      console.warn(`[reclassify] parse-error op output: ${text.slice(0, 80)}`);
      return { ...fallbackResult, inputTokens, outputTokens, costUsd };
    }
    return { category: parsed, inputTokens, outputTokens, costUsd };
  } catch (err) {
    console.warn(
      '[reclassify] API error:',
      err instanceof Error ? err.message : err,
    );
    return fallbackResult;
  }
}

// Test-helpers — exporteer voor tsx smoke-test.
export const __test = { parseReclassifyOutput, RECLASSIFY_SYSTEM, DOMAIN_ALLOWLIST };
