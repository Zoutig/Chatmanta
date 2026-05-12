// Smoke-test voor lib/ai/llm.ts::costForModelUsd().
// Run: npx tsx scripts/test-cost-lookup.ts

import { strict as assert } from 'node:assert';
import { costForModelUsd, MODEL_COSTS_USD } from '../lib/ai/llm';

const gpt4o = costForModelUsd('gpt-4o', 1_000_000, 1_000_000);
assert.equal(gpt4o.toFixed(2), '12.50', `gpt-4o cost wrong: ${gpt4o}`);

const zeroCost = costForModelUsd('gpt-4o-mini', 0, 0);
assert.equal(zeroCost, 0, `zero-token cost wrong: ${zeroCost}`);

const unknownCost = costForModelUsd('not-a-real-model', 1000, 1000);
assert.equal(unknownCost, 0, `unknown model cost wrong: ${unknownCost}`);

assert.ok(MODEL_COSTS_USD['gpt-4o'].input_per_m === 2.5);
assert.ok(MODEL_COSTS_USD['gpt-4o-mini'].output_per_m === 0.6);

console.log('✓ costForModelUsd(gpt-4o, 1M, 1M) = $12.50');
console.log('✓ costForModelUsd(gpt-4o-mini, 0, 0) = $0');
console.log('✓ costForModelUsd(onbekend) = $0 + warn');
console.log('✓ MODEL_COSTS_USD-tabel bevat gpt-4o + gpt-4o-mini');
