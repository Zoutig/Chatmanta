import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from '@anthropic-ai/sdk/resources/messages/messages';
import { judge, type JudgeCall, type Transport } from '../judge-client';

const call: JudgeCall<{ ok: boolean }> = {
  system: 's',
  user: 'u',
  schema: { type: 'object' },
  effort: 'medium',
  maxTokens: 1000,
  validate: (d) => (d.ok ? [] : ['niet ok']),
};

const msg = (over: Record<string, unknown> & { text?: string }): Message =>
  ({
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    content: [{ type: 'text', text: over.text ?? '{"ok":true}', citations: null }],
    ...over,
  }) as unknown as Message;

const fake = (seq: Message[]): Transport & { params: unknown[] } => {
  const params: unknown[] = [];
  return {
    params,
    create: async (p) => {
      params.push(p);
      return seq.shift()!;
    },
  };
};

test('succes: kosten geteld, effort + schema in output_config, system gecachet', async () => {
  const t = fake([msg({})]);
  let usd = 0;
  const r = await judge(t, call, (u) => (usd += u));
  assert.ok(r.ok);
  assert.ok(Math.abs(usd - (1000 * 4 + 100 * 20) / 1e6) < 1e-12);
  const p = t.params[0] as {
    output_config: { effort: string; format: { type: string } };
    system: { cache_control?: unknown }[];
  };
  assert.equal(p.output_config.effort, 'medium');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.ok(p.system[0].cache_control);
});

test('weigering en verkeerd model → fout, nooit "ok"', async () => {
  const r1 = await judge(fake([msg({ stop_reason: 'refusal' })]), call, () => {});
  assert.ok(!r1.ok && r1.kind === 'refusal');
  const r2 = await judge(fake([msg({ model: 'claude-sonnet-5-5' })]), call, () => {});
  assert.ok(!r2.ok && r2.kind === 'model_mismatch');
});

test('max_tokens → opnieuw met dubbele limiet', async () => {
  const t = fake([msg({ stop_reason: 'max_tokens' }), msg({})]);
  const r = await judge(t, call, () => {});
  assert.ok(r.ok);
  assert.equal((t.params[1] as { max_tokens: number }).max_tokens, 2000);
});

test('ongeldig oordeel → één herkansing, daarna fout', async () => {
  const r = await judge(fake([msg({ text: '{"ok":false}' }), msg({ text: '{"ok":false}' })]), call, () => {});
  assert.ok(!r.ok && r.kind === 'invalid');
  const r2 = await judge(fake([msg({ text: 'geen json' }), msg({})]), call, () => {});
  assert.ok(r2.ok);
});
