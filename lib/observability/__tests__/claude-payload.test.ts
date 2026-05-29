import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildClaudePayload } from '../claude-payload';
import type { ErrorGroup } from '../sink';

const group: ErrorGroup = {
  id: 'g1',
  fingerprint: 'fp',
  organizationId: 'org-uuid',
  surface: 'chatbot',
  severity: 'error',
  code: 'LLM_TIMEOUT',
  title: 'OpenAI timeout',
  message: 'stream gaf geen output',
  count: 12,
  firstSeenAt: '2026-05-29T14:03:00Z',
  lastSeenAt: '2026-05-29T15:41:00Z',
  status: 'open',
  resolvedAt: null,
  context: {
    requestId: 'chm_a1b2c3d4',
    stack: 'Error: boom\n  at rag.ts',
    topFrame: 'at rag.ts',
    route: '/api/v0/chat',
    method: 'POST',
    commit: 'df681ea',
    env: 'production',
    inputRedacted: 'wat is [email]?',
  },
};

test('payload bevat de sleutel-context voor Claude Code', () => {
  const md = buildClaudePayload(group, { orgName: 'acme-corp' });
  assert.match(md, /## ChatManta foutrapport — LLM_TIMEOUT op chatbot/);
  assert.match(md, /chm_a1b2c3d4/);
  assert.match(md, /acme-corp/);
  assert.match(md, /12×/);
  assert.match(md, /```text/);
  assert.match(md, /at rag\.ts/);
  assert.match(md, /\[email\]/);
  assert.match(md, /### Vraag aan Claude Code/);
});

test('payload lekt geen rauwe PII (gebruikt alleen het geredigeerde veld)', () => {
  const md = buildClaudePayload(group);
  assert.doesNotMatch(md, /@/);
});
