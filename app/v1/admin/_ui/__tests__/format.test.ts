// Run: node --import tsx --test app/v1/admin/_ui/__tests__/format.test.ts
// TZ op UTC (zoals Vercel) vóór de import: bewijst dat de helpers niet op de
// tijdzone van de machine leunen. Dynamische import, want statische imports
// lopen vóór deze regel.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Per test geladen (geen top-level await in de cjs-transform van tsx).
const load = () => import('../format');

// nl-NL zet een harde spatie (U+00A0) tussen valuta en bedrag.
const nb = (s: string) => s.replace(/ /g, ' ');

test('formatEur: nl-NL, onder 1 tot 3 decimalen', async () => {
  const { formatEur } = await load();
  assert.equal(formatEur(0), nb('€ 0,00'));
  assert.equal(formatEur(0.004), nb('€ 0,004'));
  assert.equal(formatEur(0.5), nb('€ 0,50'));
  assert.equal(formatEur(12.5), nb('€ 12,50'));
  assert.equal(formatEur(1234.5), nb('€ 1.234,50'));
  assert.equal(formatEur(0.9996), nb('€ 1,00'));
});

test('formatEur: randwaarden', async () => {
  const { formatEur } = await load();
  assert.equal(formatEur(0.0004), `< ${nb('€ 0,001')}`);
  assert.equal(formatEur(-0), nb('€ 0,00'));
  assert.equal(formatEur(-2), nb('€ -2,00'));
  assert.equal(formatEur(null), 'Onbekend');
  assert.equal(formatEur(undefined), 'Onbekend');
  assert.equal(formatEur(Number.NaN), 'Onbekend');
  assert.equal(formatEur(Number.POSITIVE_INFINITY), 'Onbekend');
});

test('formatUsd: dollars, nl-NL', async () => {
  const { formatUsd } = await load();
  assert.equal(formatUsd(12.34), nb('US$ 12,34'));
});

test('datums: Amsterdamse tijd, ook over middernacht en in de zomer', async () => {
  const { formatDate, formatDateTime } = await load();
  assert.equal(new Date('2026-01-01T23:30:00Z').getHours(), 23, 'test draait niet in UTC');
  // 23:30 UTC op 1 jan = 00:30 op 2 jan in Amsterdam.
  assert.equal(formatDate('2026-01-01T23:30:00Z'), '2 jan 2026');
  assert.equal(formatDateTime('2026-01-01T23:30:00Z'), '2 jan 2026, 00:30');
  assert.equal(formatDateTime('2026-07-03T12:03:00Z'), '3 jul 2026, 14:03');
  assert.equal(formatDate(null), 'Onbekend');
  assert.equal(formatDateTime('onzin'), 'Onbekend');
});
