import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auxModelOf, costForModelUsd, openaiChatParams, serviceTierCostMultiplier } from '../llm';

test('openaiChatParams — gpt-4o-mini/gpt-4o blijven byte-identiek (max_tokens)', () => {
  for (const m of ['gpt-4o-mini', 'gpt-4o']) {
    assert.deepEqual(openaiChatParams(m, { temperature: 0.4, maxTokens: 500 }), {
      temperature: 0.4,
      max_tokens: 500,
    });
  }
});

test('openaiChatParams — gpt-6 gebruikt max_completion_tokens + reasoning uit', () => {
  for (const m of ['gpt-6-luna', 'gpt-6-sol']) {
    assert.deepEqual(openaiChatParams(m, { temperature: 0.2, maxTokens: 200 }), {
      temperature: 0.2,
      max_completion_tokens: 200,
      reasoning_effort: 'none',
    });
  }
});

test('costForModelUsd — Luna/Sol staan in de tabel (geen stille 0)', () => {
  assert.ok(Math.abs(costForModelUsd('gpt-6-luna', 1_000_000, 1_000_000) - 0.6) < 1e-9);
  assert.ok(Math.abs(costForModelUsd('gpt-6-sol', 1_000_000, 1_000_000) - 12) < 1e-9);
});

test('auxModelOf — default chatModel, override via auxModel', () => {
  assert.equal(auxModelOf({ chatModel: 'gpt-4o-mini' }), 'gpt-4o-mini');
  assert.equal(auxModelOf({ chatModel: 'gpt-6-luna', auxModel: 'gpt-4o-mini' }), 'gpt-4o-mini');
});

test('openaiChatParams — OPENAI_SERVICE_TIER=priority voegt service_tier toe', () => {
  const prev = process.env.OPENAI_SERVICE_TIER;
  process.env.OPENAI_SERVICE_TIER = 'priority';
  try {
    for (const m of ['gpt-6-luna', 'gpt-4o-mini']) {
      assert.equal(
        (openaiChatParams(m, { temperature: 0, maxTokens: 10 }) as { service_tier?: string }).service_tier,
        'priority',
      );
    }
  } finally {
    if (prev === undefined) delete process.env.OPENAI_SERVICE_TIER;
    else process.env.OPENAI_SERVICE_TIER = prev;
  }
});

test('openaiChatParams — priority wordt genegeerd op Vercel-productie (budget-cap-veilig)', () => {
  const prevTier = process.env.OPENAI_SERVICE_TIER;
  const prevEnv = process.env.VERCEL_ENV;
  process.env.OPENAI_SERVICE_TIER = 'priority';
  process.env.VERCEL_ENV = 'production';
  try {
    assert.deepEqual(openaiChatParams('gpt-6-luna', { temperature: 0, maxTokens: 10 }), {
      temperature: 0,
      max_completion_tokens: 10,
      reasoning_effort: 'none',
    });
  } finally {
    if (prevTier === undefined) delete process.env.OPENAI_SERVICE_TIER;
    else process.env.OPENAI_SERVICE_TIER = prevTier;
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
});

test('openaiChatParams — expliciete serviceTier voegt service_tier toe, ook op productie', () => {
  const prevEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    assert.deepEqual(openaiChatParams('gpt-6-luna', { temperature: 0, maxTokens: 10 }, 'priority'), {
      temperature: 0,
      max_completion_tokens: 10,
      reasoning_effort: 'none',
      service_tier: 'priority',
    });
    assert.deepEqual(openaiChatParams('gpt-4o-mini', { temperature: 0, maxTokens: 10 }, 'priority'), {
      temperature: 0,
      max_tokens: 10,
      service_tier: 'priority',
    });
  } finally {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
});

test('costForModelUsd — rekent op het geserveerde tier (fast/priority 2×, default 1×)', () => {
  const base = costForModelUsd('gpt-6-luna', 1_000_000, 1_000_000);
  assert.ok(Math.abs(costForModelUsd('gpt-6-luna', 1_000_000, 1_000_000, 'fast') - 2 * base) < 1e-9);
  assert.ok(Math.abs(costForModelUsd('gpt-4o-mini', 1_000_000, 0, 'priority') - 0.3) < 1e-9);
  assert.equal(costForModelUsd('gpt-6-luna', 1_000_000, 1_000_000, 'default'), base);
  assert.equal(costForModelUsd('gpt-6-luna', 1_000_000, 1_000_000, null), base);
  assert.equal(serviceTierCostMultiplier(undefined), 1);
});
