// LLM provider abstraction — every AI call in the app goes through here.
// Switching between Claude and OpenAI happens by changing one config value,
// not by rewriting code (blueprint sectie 18).
//
// V1 default model: claude-haiku-4-5. OpenAI is the technical fallback
// (not customer-visible). Real implementation lands in Fase 4; this file
// only declares the interface and cost lookup.

export type LLMProvider = 'anthropic' | 'openai';

export type LLMMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LLMUsage = {
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
};

export type CallLLMOptions = {
  provider: LLMProvider;
  model: string;
  system: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens?: number;
};

/**
 * Per-million-token costs in USD — pure provider-rate tabel. Gebruikt door V0
 * waar token-kosten in USD opgeteld worden (query_log.cost_usd is USD).
 *
 * Houd in sync met provider pricing pages. Bij prijswijziging: pas hier aan
 * en de wijziging propageert automatisch naar elke aanroeper. NIET hardcoden
 * in callsites.
 *
 * Alle callers (V0 én V1) rekenen in USD via costForModelUsd; EUR ontstaat
 * alleen via costUsdToEur.
 */
export const MODEL_COSTS_USD = {
  'claude-haiku-4-5':   { input_per_m: 1.0,  output_per_m: 5.0 },
  'claude-sonnet-4-6':  { input_per_m: 3.0,  output_per_m: 15.0 },
  'gpt-4o-mini':        { input_per_m: 0.15, output_per_m: 0.60 },
  'gpt-4o':             { input_per_m: 2.50, output_per_m: 10.0 },
  // GPT-6-familie (release 2026-09-22; prijzen van developers.openai.com/api/docs/models).
  'gpt-6-luna':         { input_per_m: 0.10, output_per_m: 0.50 },
  'gpt-6-sol':          { input_per_m: 2.0,  output_per_m: 10.0 },
} as const satisfies Record<string, { input_per_m: number; output_per_m: number }>;

export type SupportedModelUsd = keyof typeof MODEL_COSTS_USD;

/**
 * Chat-Completions-parameters per OpenAI-model. GPT-6 (redeneermodellen) weigert
 * `max_tokens` (400: gebruik `max_completion_tokens`) en redeneert standaard
 * (verborgen reasoning-tokens: extra kosten + latency). Voor onze korte
 * RAG-antwoorden zetten we redeneren uit via `reasoning_effort: 'none'`;
 * `temperature` blijft dan gewoon werken (gemeten 2026-10). Niet-GPT-6 modellen
 * krijgen exact de oude parameters — byte-identiek gedrag voor v0.10 en ouder.
 */
export function openaiChatParams(
  model: string,
  opts: { temperature: number; maxTokens: number },
):
  | ({ temperature: number; max_tokens: number } & { service_tier?: 'priority' })
  | ({ temperature: number; max_completion_tokens: number; reasoning_effort: 'none' } & {
      service_tier?: 'priority';
    }) {
  // Meet-hefboom (Luna-onderzoek): OPENAI_SERVICE_TIER=priority → snellere, ~2× duurdere
  // verwerking op ALLE calls. Alleen voor metingen; een klant-tier wordt later per org.
  // Genegeerd op Vercel-productie: costForModelUsd kent geen priority-tarief, dus de
  // per-org dag-budget-cap zou ~2× onderschatten als de env daar per ongeluk aan staat.
  const tier =
    process.env.OPENAI_SERVICE_TIER === 'priority' && process.env.VERCEL_ENV !== 'production'
      ? { service_tier: 'priority' as const }
      : {};
  if (model.startsWith('gpt-6')) {
    return {
      temperature: opts.temperature,
      max_completion_tokens: opts.maxTokens,
      reasoning_effort: 'none',
      ...tier,
    };
  }
  return { temperature: opts.temperature, max_tokens: opts.maxTokens, ...tier };
}

/** Model voor hulpstappen van de RAG-pipeline: bot.auxModel, anders bot.chatModel. */
export function auxModelOf(bot: { chatModel: string; auxModel?: string }): string {
  return bot.auxModel ?? bot.chatModel;
}

/**
 * Lookup-helper. Onbekend model → 0/0 (neutrale fallback ipv crash). Cost-
 * onderschatting bij een onbekend model is acceptabel voor V0; we loggen
 * de hit via console.warn zodat de mismatch zichtbaar wordt.
 */
export function costForModelUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = (MODEL_COSTS_USD as Record<string, { input_per_m: number; output_per_m: number }>)[model];
  if (!rates) {
    console.warn(`[MODEL_COSTS_USD] onbekend model: ${model} — cost berekend als 0`);
    return 0;
  }
  return (
    (inputTokens / 1_000_000) * rates.input_per_m +
    (outputTokens / 1_000_000) * rates.output_per_m
  );
}

/**
 * USD→EUR conversie voor query_log.cost_eur. De engine sommeert kosten in USD
 * (costForModelUsd); de EUR-cap (M-C) en EUR-billing willen EUR.
 * ponytail: vaste FX-constante (env-override USD_EUR_RATE). Dit is een
 * budget-backstop, geen factuur. Upgrade-pad (V2): live FX of een echte
 * EUR-tarieventabel zodra er een V2-billing-caller is.
 */
const USD_EUR_RATE = Number(process.env.USD_EUR_RATE) || 0.92;
export function costUsdToEur(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * USD_EUR_RATE * 1e6) / 1e6; // 6 decimalen, matcht kolom
}

/**
 * Generate a complete LLM response. Real implementation in Fase 4.
 * Until then this throws to prevent silent misuse.
 */
export async function callLLM(_opts: CallLLMOptions): Promise<{ text: string; usage: LLMUsage }> {
  throw new Error('callLLM not implemented yet — see Bouwplan Fase 4');
}

/** Stream an LLM response. Real implementation in Fase 4. */
export function streamLLM(_opts: CallLLMOptions): ReadableStream {
  throw new Error('streamLLM not implemented yet — see Bouwplan Fase 4');
}
