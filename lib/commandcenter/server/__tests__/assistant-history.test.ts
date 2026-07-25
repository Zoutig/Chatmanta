// Unit-tests voor lib/commandcenter/server/assistant-history.ts.
//
// Run: node --import tsx --test lib/commandcenter/server/__tests__/assistant-history.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildChatHistory, type ChatMsg } from '../assistant-history';
import type { AssistantMessage, AssistantToolCall } from '../../types';

type ToolChatMsg = Extract<ChatMsg, { role: 'tool' }>;

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function toolCall(id: string, name = 'dummy_tool'): AssistantToolCall {
  return { id, type: 'function', function: { name, arguments: '{}' } };
}

function baseMsg(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: nextId('msg'),
    threadId: 'thread-1',
    role: 'user',
    content: null,
    toolCalls: null,
    toolCallId: null,
    toolName: null,
    toolResult: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function userMsg(content: string): AssistantMessage {
  return baseMsg({ role: 'user', content });
}

function assistantTextMsg(content: string): AssistantMessage {
  return baseMsg({ role: 'assistant', content });
}

function assistantToolMsg(calls: AssistantToolCall[]): AssistantMessage {
  return baseMsg({ role: 'assistant', content: null, toolCalls: calls });
}

function toolResultMsg(toolCallId: string, ok = true): AssistantMessage {
  return baseMsg({
    role: 'tool',
    toolCallId,
    toolName: 'dummy_tool',
    toolResult: ok ? { ok: true, item: { done: true } } : { ok: false, error: 'faal' },
  });
}

function toolMsgs(out: ChatMsg[]): ToolChatMsg[] {
  return out.filter((m): m is ToolChatMsg => m.role === 'tool');
}

// ---------------------------------------------------------------------------
// 1. Complete turn
// ---------------------------------------------------------------------------

test('complete turn — assistant met 1 tool_call + bijbehorende tool-message', () => {
  const call = toolCall('call-1');
  const history: AssistantMessage[] = [
    userMsg('doe iets'),
    assistantToolMsg([call]),
    toolResultMsg('call-1'),
  ];

  const out = buildChatHistory('system-prompt', history);

  assert.equal(out.length, 4); // system + user + assistant + 1 tool-message
  assert.equal(out[0].role, 'system');
  assert.equal(out[1].role, 'user');

  const assistantEntry = out[2];
  assert.equal(assistantEntry.role, 'assistant');
  if (assistantEntry.role === 'assistant') {
    assert.deepEqual(assistantEntry.tool_calls, [call]);
  }

  // Precies één tool-message, direct na de assistant-turn, geen placeholder.
  const tools = toolMsgs(out);
  assert.equal(tools.length, 1);
  assert.equal(out[3].role, 'tool');
  assert.equal(tools[0].tool_call_id, 'call-1');
  assert.ok(!tools[0].content.includes('tool-resultaat verloren gegaan'));
});

// ---------------------------------------------------------------------------
// 2. Gebrickte turn
// ---------------------------------------------------------------------------

test('gebrickte turn — assistant met 2 tool_calls maar 1 tool-message krijgt precies één placeholder', () => {
  const callA = toolCall('call-a');
  const callB = toolCall('call-b');
  const history: AssistantMessage[] = [
    userMsg('doe twee dingen'),
    assistantToolMsg([callA, callB]),
    toolResultMsg('call-a'), // resultaat van call-b ging verloren
  ];

  const out = buildChatHistory('system-prompt', history);

  const tools = toolMsgs(out);
  assert.equal(tools.length, 2);
  assert.deepEqual(
    tools.map((m) => m.tool_call_id).sort(),
    ['call-a', 'call-b'],
  );

  const placeholder = tools.find((m) => m.tool_call_id === 'call-b');
  assert.ok(placeholder, 'placeholder voor call-b ontbreekt');
  assert.ok(placeholder!.content.includes('tool-resultaat verloren gegaan'));

  const real = tools.find((m) => m.tool_call_id === 'call-a');
  assert.ok(real, 'echte tool-message voor call-a ontbreekt');
  assert.ok(!real!.content.includes('tool-resultaat verloren gegaan'));

  // Elke aangekondigde tool_call_id heeft nu een tool-message.
  for (const id of ['call-a', 'call-b']) {
    assert.ok(tools.some((m) => m.tool_call_id === id), `${id} mist een tool-message`);
  }
});

// ---------------------------------------------------------------------------
// 3. Tool-rij met null toolCallId
// ---------------------------------------------------------------------------

test('tool-rij met null toolCallId wordt niet als losse tool-message toegevoegd', () => {
  const history: AssistantMessage[] = [
    userMsg('hoi'),
    baseMsg({ role: 'tool', toolCallId: null, toolResult: { ok: true } }),
    assistantTextMsg('klaar'),
  ];

  const out = buildChatHistory('system-prompt', history);

  assert.equal(toolMsgs(out).length, 0);
  // Geen dangling call ontstaat: er is niets aangekondigd om te repareren.
  assert.deepEqual(
    out.map((m) => m.role),
    ['system', 'user', 'assistant'],
  );
});

// ---------------------------------------------------------------------------
// 4. Thread zonder tool-calls
// ---------------------------------------------------------------------------

test('thread zonder tool-calls blijft ongewijzigd', () => {
  const history: AssistantMessage[] = [
    userMsg('vraag 1'),
    assistantTextMsg('antwoord 1'),
    userMsg('vraag 2'),
    assistantTextMsg('antwoord 2'),
  ];

  const out = buildChatHistory('system-prompt', history);

  assert.equal(out.length, 5); // system + 4
  assert.deepEqual(
    out.map((m) => m.role),
    ['system', 'user', 'assistant', 'user', 'assistant'],
  );
  assert.equal(toolMsgs(out).length, 0);
});

// ---------------------------------------------------------------------------
// 5. Orphan-tool-rij
// ---------------------------------------------------------------------------

test('orphan-tool-rij (geen aankondigende assistant-turn) wordt gedropt', () => {
  const history: AssistantMessage[] = [
    userMsg('hoi'),
    toolResultMsg('nooit-aangekondigd'),
    assistantTextMsg('klaar'),
  ];

  const out = buildChatHistory('system-prompt', history);

  assert.equal(toolMsgs(out).length, 0);
  assert.deepEqual(
    out.map((m) => m.role),
    ['system', 'user', 'assistant'],
  );
});

// ---------------------------------------------------------------------------
// 6. Invariant
// ---------------------------------------------------------------------------

test('invariant: elk aangekondigd tool_call_id krijgt een tool-message, elke tool-message heeft een eerdere aankondiging', () => {
  const callA = toolCall('inv-a');
  const callB = toolCall('inv-b');
  const callC = toolCall('inv-c');
  const history: AssistantMessage[] = [
    userMsg('start'),
    assistantToolMsg([callA]),
    toolResultMsg('inv-a'),
    userMsg('nog een'),
    assistantToolMsg([callB, callC]), // resultaat van callC ging verloren
    toolResultMsg('inv-b'),
    toolResultMsg('nooit-aangekondigd'), // orphan — moet gedropt worden
    assistantTextMsg('klaar'),
  ];

  const out = buildChatHistory('system-prompt', history);

  const announced = new Set<string>();
  const answered = new Set<string>();

  out.forEach((m, idx) => {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const c of m.tool_calls) announced.add(c.id);
    }
    if (m.role === 'tool') {
      assert.ok(
        announced.has(m.tool_call_id),
        `tool-message ${m.tool_call_id} op index ${idx} heeft geen eerdere assistant-aankondiging`,
      );
      answered.add(m.tool_call_id);
    }
  });

  for (const id of ['inv-a', 'inv-b', 'inv-c']) {
    assert.ok(answered.has(id), `tool_call_id ${id} heeft geen tool-message in de output`);
  }
  // De orphan-id mag nergens als tool-message voorkomen.
  assert.ok(!out.some((m) => m.role === 'tool' && m.tool_call_id === 'nooit-aangekondigd'));
});

// ---------------------------------------------------------------------------
// 7. Duplicaat-tool-rij → first-wins dedupe
// ---------------------------------------------------------------------------

test('duplicaat-tool-rijen met hetzelfde toolCallId → precies één tool-message (first-wins)', () => {
  const call = toolCall('dup-1');
  const history: AssistantMessage[] = [
    userMsg('doe iets'),
    assistantToolMsg([call]),
    // Twee tool-rijen voor hetzelfde id (bv. echte succes-rij + latere fallback):
    baseMsg({
      role: 'tool',
      toolCallId: 'dup-1',
      toolName: 'dummy_tool',
      toolResult: { ok: true, item: { eerste: true } },
    }),
    baseMsg({
      role: 'tool',
      toolCallId: 'dup-1',
      toolName: 'dummy_tool',
      toolResult: { ok: false, error: 'tweede — moet weggededupt worden' },
    }),
  ];

  const out = buildChatHistory('system-prompt', history);

  const tools = toolMsgs(out);
  assert.equal(tools.length, 1, 'er mag precies één tool-message voor dup-1 zijn');
  assert.equal(tools[0].tool_call_id, 'dup-1');
  // First-wins: de eerste (succes-)rij overleeft, de tweede niet.
  assert.ok(tools[0].content.includes('eerste'));
  assert.ok(!tools[0].content.includes('weggededupt'));

  // Invariant blijft gelden: elke aangekondigde id heeft een tool-message en
  // elke tool-message heeft een eerdere aankondiging.
  const announced = new Set<string>();
  out.forEach((m) => {
    if (m.role === 'assistant' && m.tool_calls) for (const c of m.tool_calls) announced.add(c.id);
    if (m.role === 'tool') assert.ok(announced.has(m.tool_call_id), `${m.tool_call_id} zonder aankondiging`);
  });
  assert.ok(announced.has('dup-1') && tools.some((m) => m.tool_call_id === 'dup-1'));
});
