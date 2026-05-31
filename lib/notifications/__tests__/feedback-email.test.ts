import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildOperatorEmail,
  buildSubmitterEmail,
  feedbackAdminUrl,
  isValidFeedbackEmail,
} from '@/lib/notifications/feedback-email';
import type { FeedbackItem } from '@/lib/controlroom/types';

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

test('isValidFeedbackEmail', () => {
  assert.equal(isValidFeedbackEmail('a@b.nl'), true);
  assert.equal(isValidFeedbackEmail('geen-email'), false);
  assert.equal(isValidFeedbackEmail(null), false);
  assert.equal(isValidFeedbackEmail(''), false);
  assert.equal(isValidFeedbackEmail('a@b'), false);
});

test('feedbackAdminUrl bevat het melding-id en het feedback-pad', () => {
  const url = feedbackAdminUrl('fb-1');
  assert.match(url, /^https?:\/\/.+\/admindashboard\/feedback\/fb-1$/);
});

test('operator-mail bevat type, org, beschrijving en deeplink', () => {
  const out = buildOperatorEmail(item({ description: 'Widget crasht.' }), {
    orgName: 'Acme BV',
    adminUrl: 'https://x.nl/admindashboard/feedback/fb-1',
  });
  assert.match(out.subject, /Nieuwe melding/);
  assert.match(out.subject, /Acme BV/);
  assert.match(out.text, /Widget crasht\./);
  assert.match(out.text, /admindashboard\/feedback\/fb-1/);
  assert.match(out.html, /admindashboard\/feedback\/fb-1/);
});

test('operator-mail escapet HTML in vrije tekst (geen injectie)', () => {
  const out = buildOperatorEmail(item({ description: '<script>alert(1)</script>' }), {
    orgName: 'Acme',
    adminUrl: 'https://x.nl/y',
  });
  assert.doesNotMatch(out.html, /<script>/);
  assert.match(out.html, /&lt;script&gt;/);
});

test('bevestigingsmail aan indiener: groet + samenvatting + onderwerp', () => {
  const out = buildSubmitterEmail(item({ submitterName: 'Jan', description: 'Mijn vraag werd fout beantwoord.' }));
  assert.match(out.text, /Hoi Jan,/);
  assert.match(out.text, /Mijn vraag werd fout beantwoord\./);
  assert.match(out.subject, /ontvangen/i);
});

test('bevestigingsmail zonder naam gebruikt neutrale groet', () => {
  const out = buildSubmitterEmail(item({ submitterName: null }));
  assert.match(out.text, /^Hoi,/);
});
