// Kosten van Claude-calls uit `usage` (plan 016 §7). USD per miljoen tokens; Batches = −50%.
// Bij een prijswijziging alleen deze tabel aanpassen. Onbekend model → throw: een eval
// mag nooit stil met $0 rekenen.

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

type Price = { input: number; output: number; cacheRead: number; cacheWrite5m: number };

const PRICES_PER_MTOK: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5 },
};

export function claudeCostUsd(model: string, usage: ClaudeUsage, opts: { batch?: boolean } = {}): number {
  const p = PRICES_PER_MTOK[model];
  if (!p) throw new Error(`Geen prijs bekend voor model ${model} (lib/evals/cost.ts)`);
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite5m) /
    1_000_000;
  return opts.batch ? usd / 2 : usd;
}
