import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFeedbackClaudePayload } from '@/lib/controlroom/feedback-claude-payload';
import type { FeedbackEvent, FeedbackItem } from '@/lib/controlroom/types';

function item(over: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: 'fb-1',
    organizationId: 'org-uuid',
    source: 'klantendashboard',
    type: 'bug',
    urgency: 'high',
    priority: null,
    status: 'nieuw',
    description: 'De widget crasht bij het openen op mobiel.',
    submitterName: null,
    submitterEmail: null,
    chatId: null,
    question: null,
    attachmentPath: null,
    attachmentName: null,
    privacyAcceptedAt: null,
    context: {},
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    ...over,
  };
}

test('payload bevat kernvelden en de Claude-vraag', () => {
  const out = buildFeedbackClaudePayload(item({ priority: 'high', chatId: 'thread-9' }), [], { orgName: 'Acme BV' });
  assert.match(out, /## ChatManta melding — Technisch probleem/);
  assert.match(out, /\*\*Type:\*\* Technisch probleem \(bug\)/);
  assert.match(out, /\*\*Urgentie \(klant\):\*\* Hoog/);
  assert.match(out, /\*\*Prioriteit \(operator\):\*\* Hoog/);
  assert.match(out, /\*\*Status:\*\* Nieuw/);
  assert.match(out, /\*\*Org:\*\* Acme BV/);
  assert.match(out, /\*\*Chat-ID:\*\* thread-9/);
  assert.match(out, /De widget crasht bij het openen op mobiel\./);
  assert.match(out, /### Vraag aan Claude Code/);
});

test('PII in vrije tekst wordt gemaskeerd', () => {
  const out = buildFeedbackClaudePayload(
    item({ description: 'Mail mij op jan@firma.nl of bel 0612345678.', question: 'Klopt jan@firma.nl?' }),
  );
  assert.doesNotMatch(out, /jan@firma\.nl/);
  assert.doesNotMatch(out, /0612345678/);
  assert.match(out, /\[email\]/);
  assert.match(out, /\[telefoon\]/);
});

test('zonder context/vraag geen lege secties, payload blijft geldig', () => {
  const out = buildFeedbackClaudePayload(item());
  assert.doesNotMatch(out, /### Context/);
  assert.doesNotMatch(out, /### Gestelde vraag/);
  assert.doesNotMatch(out, /### Operator-notities/);
  assert.match(out, /### Beschrijving/);
});

test('context-velden en bijlage komen in de Context-sectie', () => {
  const out = buildFeedbackClaudePayload(
    item({ context: { requestId: 'req-42', botVersion: 'v0.9.1' }, attachmentName: 'screenshot.png' }),
  );
  assert.match(out, /### Context/);
  assert.match(out, /\*\*Request-ID:\*\* req-42/);
  assert.match(out, /\*\*Bot-versie:\*\* v0\.9\.1/);
  assert.match(out, /\*\*Bijlage:\*\* screenshot\.png/);
});

test('operator-notities/reacties worden meegenomen en geredigeerd', () => {
  const events: FeedbackEvent[] = [
    { id: 'e1', feedbackId: 'fb-1', kind: 'created', fromStatus: null, toStatus: 'nieuw', body: null, author: 'klant', createdAt: '2026-05-31T10:00:00.000Z' },
    { id: 'e2', feedbackId: 'fb-1', kind: 'internal_note', fromStatus: null, toStatus: null, body: 'Repro op iPhone, bel 0612345678', author: 'operator', createdAt: '2026-05-31T11:00:00.000Z' },
    { id: 'e3', feedbackId: 'fb-1', kind: 'status_change', fromStatus: 'nieuw', toStatus: 'in_behandeling', body: null, author: 'operator', createdAt: '2026-05-31T11:05:00.000Z' },
  ];
  const out = buildFeedbackClaudePayload(item(), events);
  assert.match(out, /### Operator-notities/);
  assert.match(out, /\*\*Interne notitie:\*\* Repro op iPhone, bel \[telefoon\]/);
  // status_change/created hebben geen body → niet als notitie opgenomen
  assert.doesNotMatch(out, /\*\*Reactie:\*\*/);
});
