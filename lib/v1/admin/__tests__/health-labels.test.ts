// Run: node --import tsx --test lib/v1/admin/__tests__/health-labels.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHealth, type OrgSignals } from '@/lib/controlroom/server/health';
import { v1HealthReasonLabel } from '../health-labels';

const base: OrgSignals = {
  hasActiveSources: true,
  sourceCount: 3,
  widgetStatus: 'detected',
  crawlLatestStatus: 'completed',
  crawlAnyFailed: false,
  fallbackPct: null,
  conversationsThisMonth: 0,
  conversationsThisWeek: 0,
  recentCriticalErrorCount: 0,
};

test("V1 vertaalt de gedeelde V0-reden voor 'detected' (vangt een gewijzigde V0-tekst)", () => {
  const { reasons } = deriveHealth(base, 'live', 'trial');
  const labels = reasons.map(v1HealthReasonLabel);
  assert.ok(labels.includes('Widget ingesteld of gepauzeerd, nog niet live gezien'), labels.join(' | '));
  assert.ok(!labels.some((l) => /gevonden/.test(l)), labels.join(' | '));
});

test('onbekende redenen blijven ongewijzigd', () => {
  assert.equal(v1HealthReasonLabel('Laatste crawl gefaald'), 'Laatste crawl gefaald');
});
