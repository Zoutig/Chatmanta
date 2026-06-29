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
 * Per-million-token costs in EUR for each supported model. Keep this in
 * sync with provider pricing pages — used for `usage_logs.cost_eur`.
 *
 * V1 actively-billed models: claude-haiku-4-5 + gpt-4o-mini. Sonnet and
 * GPT-4o are listed for use in V2 Pro/Business tiers.
 */
export const MODEL_COSTS = {
  'claude-haiku-4-5':   { input_per_m: 1.0,  output_per_m: 5.0 },
  'claude-sonnet-4-6':  { input_per_m: 3.0,  output_per_m: 15.0 },
  'gpt-4o-mini':        { input_per_m: 0.15, output_per_m: 0.60 },
  'gpt-4o':             { input_per_m: 2.50, output_per_m: 10.0 },
} as const satisfies Record<string, { input_per_m: number; output_per_m: number }>;

export type SupportedModel = keyof typeof MODEL_COSTS;

/** Convert input/output token counts to EUR cost for the given model. */
export function calculateCost(
  model: SupportedModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COSTS[model];
  return (inputTokens / 1_000_000) * rates.input_per_m
       + (outputTokens / 1_000_000) * rates.output_per_m;
}

/**
 * Per-million-token costs in USD — pure provider-rate tabel. Gebruikt door V0
 * waar token-kosten in USD opgeteld worden (query_log.cost_usd is USD).
 *
 * Houd in sync met provider pricing pages. Bij prijswijziging: pas hier aan
 * en de wijziging propageert automatisch naar elke aanroeper. NIET hardcoden
 * in callsites.
 *
 * V1 callers gebruiken MODEL_COSTS (EUR) voor billing; V0 callers gebruiken
 * MODEL_COSTS_USD voor cost-discipline-telemetrie.
 */
export const MODEL_COSTS_USD = {
  'claude-haiku-4-5':   { input_per_m: 1.0,  output_per_m: 5.0 },
  'claude-sonnet-4-6':  { input_per_m: 3.0,  output_per_m: 15.0 },
  'gpt-4o-mini':        { input_per_m: 0.15, output_per_m: 0.60 },
  'gpt-4o':             { input_per_m: 2.50, output_per_m: 10.0 },
} as const satisfies Record<string, { input_per_m: number; output_per_m: number }>;

export type SupportedModelUsd = keyof typeof MODEL_COSTS_USD;

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
 * budget-backstop, geen factuur. Upgrade-pad (V2): live FX of per-call EUR via
 * MODEL_COSTS — let op: MODEL_COSTS (EUR) spiegelt nu nog de USD-tabel, dus
 * her-summeren geeft GEEN echte EUR tot die tabel echte EUR-rates krijgt.
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
