// Run: node --import tsx --conditions=react-server --test lib/v1/admin/__tests__/klant-attention.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminAttentionItems, latestFailedCrawlError, type AdminAttentionInput } from '../klant-attention';
import { NO_SIGNALS } from '@/lib/v1/dashboard/attention';

const ORG = '00000000-0000-0000-0000-000000000001';

const calm: AdminAttentionInput = {
  suspended: false,
  hasChatbot: true,
  signals: NO_SIGNALS,
  dailyQuestionsReached: false,
  monthlyQuestionsReached: false,
  costCapReached: false,
  widgetEverSeen: true,
  allowedDomainsEmpty: false,
  crawlError: null,
  unansweredCount: 0,
  openIssues: 0,
};

test('niets aan de hand → geen regels', () => {
  assert.deepEqual(buildAdminAttentionItems(ORG, calm), []);
});

test('elk signaal geeft een regel met een link naar de oplosplek', () => {
  const items = buildAdminAttentionItems(ORG, {
    ...calm,
    suspended: true,
    monthlyQuestionsReached: true,
    costCapReached: true,
    signals: { ...NO_SIGNALS, widgetPaused: true, crawlFailed: 1, quizReady: true },
    crawlError: 'timeout',
    openIssues: 2,
    allowedDomainsEmpty: true,
    unansweredCount: 3,
  });
  const hrefs = items.map((i) => i.href);
  assert.ok(hrefs.includes(`/v1/admin/organizations/${ORG}?tab=beheer`));
  assert.ok(hrefs.includes(`/v1/admin/organizations/${ORG}?tab=widget`));
  assert.ok(hrefs.includes(`/v1/admin/jobs?org=${ORG}`));
  assert.ok(hrefs.includes(`/v1/admin/issues?org=${ORG}`));
  assert.ok(hrefs.includes(`/v1/admin/organizations/${ORG}?tab=gesprekken`));
  assert.ok(hrefs.includes(`/v1/admin/quiz/${ORG}`));
  assert.ok(items.some((i) => i.text.includes('timeout')));
  assert.ok(items.some((i) => i.text.includes('2 open fouten')));
  // Maandlimiet wint van daglimiet (één regel).
  assert.equal(items.filter((i) => /limiet voor vragen/.test(i.text)).length, 1);
});

test('ernst-volgorde: danger vóór warn vóór info', () => {
  const items = buildAdminAttentionItems(ORG, {
    ...calm,
    widgetEverSeen: false,
    unansweredCount: 1,
    signals: { ...NO_SIGNALS, widgetMissing: true },
  });
  const rank = { danger: 0, warn: 1, info: 2 } as const;
  const ranks = items.map((i) => rank[i.tone]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('gepauzeerd verbergt "weg"; opgeschort verbergt "nooit gezien"', () => {
  const paused = buildAdminAttentionItems(ORG, { ...calm, signals: { ...NO_SIGNALS, widgetPaused: true, widgetMissing: true } });
  assert.equal(paused.filter((i) => i.href.endsWith('tab=widget')).length, 1);
  const suspended = buildAdminAttentionItems(ORG, { ...calm, suspended: true, widgetEverSeen: false });
  assert.ok(!suspended.some((i) => /nog nooit gezien/.test(i.text)));
});

test('geen chatbot: geen domein-/widget-ruis', () => {
  const items = buildAdminAttentionItems(ORG, { ...calm, hasChatbot: false, allowedDomainsEmpty: true, widgetEverSeen: false });
  assert.equal(items.length, 1);
  assert.match(items[0].text, /geen chatbot/);
});

test('crawl-fout: alleen van een bron waarvan de nieuwste job mislukt is', () => {
  const jobs = [
    // nieuwste eerst
    { target_id: 'B', status: 'completed', error_message: null },
    { target_id: 'A', status: 'failed', error_message: 'A kapot' },
    { target_id: 'B', status: 'failed', error_message: 'B oude fout' },
    { target_id: 'X', status: 'failed', error_message: 'verwijderde bron' },
  ];
  assert.equal(latestFailedCrawlError(jobs, ['A', 'B']), 'A kapot');
  assert.equal(latestFailedCrawlError(jobs, ['B']), null);
  assert.equal(latestFailedCrawlError([], ['A']), null);
});

test('geen chatbot: link naar Beheer, niet naar de lege Botinstellingen', () => {
  const items = buildAdminAttentionItems(ORG, { ...calm, hasChatbot: false });
  assert.ok(items[0].href.endsWith('?tab=beheer'));
});
