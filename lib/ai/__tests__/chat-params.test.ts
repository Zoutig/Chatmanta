import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auxModelOf, costForModelUsd, openaiChatParams } from '../llm';

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
