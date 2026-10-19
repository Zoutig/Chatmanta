// Run: node --import tsx --test lib/v1/admin/__tests__/onboarding-derive.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_DOMAINS_KEY, deriveOnboarding, onboardingProgress, type OnboardingFacts } from '../onboarding-derive';
import { ONBOARDING_TEMPLATE } from '@/lib/controlroom/onboarding-template';
import type { OnboardingItem, OnboardingItemStatus } from '@/lib/controlroom/types';

const none: OnboardingFacts = {
  contactFilled: false,
  websiteSource: false,
  crawlStarted: false,
  crawlSucceeded: false,
  uploadedDocs: false,
  allowedDomains: false,
  widgetSeen: false,
  hasThreads: false,
};

const items = (over: Record<string, OnboardingItemStatus> = {}): OnboardingItem[] =>
  ONBOARDING_TEMPLATE.map((t, i) => ({
    id: `id-${t.key}`,
    organizationId: 'org',
    key: t.key,
    label: t.label,
    status: over[t.key] ?? 'todo',
    owner: null,
    notes: null,
    sortOrder: i,
    completedAt: null,
    createdAt: '',
    updatedAt: '',
  }));

test('virtuele stap Toegestane domeinen staat vóór Widget geplaatst', () => {
  const out = deriveOnboarding(items(), none);
  const i = out.findIndex((x) => x.key === ALLOWED_DOMAINS_KEY);
  assert.ok(i >= 0);
  assert.equal(out[i + 1].key, 'widget_installed');
  assert.equal(out[i].id, null);
  assert.equal(out[i].status, 'todo');
  assert.equal(out.length, ONBOARDING_TEMPLATE.length + 1);
});

test('afleidbare stappen tonen als klaar, met reden', () => {
  const out = deriveOnboarding(items(), {
    ...none,
    websiteSource: true,
    crawlSucceeded: true,
    allowedDomains: true,
    widgetSeen: true,
    hasThreads: true,
  });
  const by = new Map(out.map((x) => [x.key, x]));
  for (const k of [
    'customer_created',
    'website_url_added',
    'crawl_succeeded',
    'widget_installed',
    'first_real_conversations',
    ALLOWED_DOMAINS_KEY,
  ]) {
    assert.equal(by.get(k)?.status, 'done', k);
    assert.ok(by.get(k)?.autoReason, k);
  }
  // Niet afleidbaar of feit onwaar → blijft te doen.
  assert.equal(by.get('tone_of_voice_set')?.status, 'todo');
  assert.equal(by.get('first_crawl_started')?.status, 'todo');
});

test('een bewust gezette status wint van de afleiding', () => {
  const out = deriveOnboarding(items({ website_url_added: 'blocked', crawl_succeeded: 'not_applicable' }), {
    ...none,
    websiteSource: true,
    crawlSucceeded: true,
  });
  const by = new Map(out.map((x) => [x.key, x]));
  assert.equal(by.get('website_url_added')?.status, 'blocked');
  assert.equal(by.get('website_url_added')?.autoReason, null);
  assert.equal(by.get('crawl_succeeded')?.status, 'not_applicable');
});

test('lege checklist: alleen de virtuele stap', () => {
  const out = deriveOnboarding([], { ...none, allowedDomains: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'done');
});

test('voortgang telt n.v.t. niet mee', () => {
  const statuses: OnboardingItemStatus[] = ['done', 'not_applicable', 'todo', 'blocked'];
  assert.deepEqual(onboardingProgress(statuses.map((status) => ({ status }))), { done: 1, total: 3, blocked: 1 });
});
