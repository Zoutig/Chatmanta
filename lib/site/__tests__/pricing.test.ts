import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FEATURES,
  PRICING,
  SITE_COMPANY,
  TIERS,
  billedLine,
  dayFraming,
  formatEuro,
  formatNumber,
  getTier,
  monthlyPrice,
  perDayCeil,
  roundTo,
  staffCostPerMonth,
  yearlyTotal,
} from '../pricing';

const start = getTier('start');
const groei = getTier('groei');
const compleet = getTier('compleet');

test('introductieprijzen kloppen met de mockup (jaarlijks + maandelijks)', () => {
  assert.deepEqual(TIERS.map((t) => monthlyPrice(t, 'yearly')), [29, 57, 149]);
  assert.deepEqual(TIERS.map((t) => monthlyPrice(t, 'monthly')), [35, 69, 179]);
});

test('normale (doorgestreepte) prijzen kloppen', () => {
  assert.deepEqual(TIERS.map((t) => monthlyPrice(t, 'yearly', 'normal')), [39, 79, 199]);
  assert.deepEqual(TIERS.map((t) => monthlyPrice(t, 'monthly', 'normal')), [49, 99, 249]);
});

test('jaartotaal: €348 / €684 / €1.788', () => {
  assert.deepEqual(TIERS.map((t) => yearlyTotal(t)), [348, 684, 1788]);
  assert.deepEqual(TIERS.map((t) => formatEuro(yearlyTotal(t))), ['€348', '€684', '€1.788']);
});

test('billedLine per toggle-stand', () => {
  assert.equal(billedLine(start, 'yearly'), 'p/m, jaarlijks gefactureerd (€348 per jaar)');
  assert.equal(billedLine(groei, 'yearly'), 'p/m, jaarlijks gefactureerd (€684 per jaar)');
  assert.equal(billedLine(compleet, 'yearly'), 'p/m, jaarlijks gefactureerd (€1.788 per jaar)');
  assert.equal(billedLine(groei, 'monthly'), 'maandelijks gefactureerd');
});

test('dagframing Groei: <€2 jaarlijks, <€3 maandelijks', () => {
  assert.equal(perDayCeil(57), 2);
  assert.equal(perDayCeil(69), 3);
  assert.equal(dayFraming(groei, 'yearly'), 'Minder dan €2 per dag');
  assert.equal(dayFraming(groei, 'monthly'), 'Minder dan €3 per dag');
});

test('formattering nl-NL', () => {
  assert.equal(formatEuro(29), '€29');
  assert.equal(formatEuro(1788), '€1.788');
  assert.equal(formatEuro(24.95, { cents: true }), '€24,95');
  assert.equal(formatEuro(-140), '-€140');
  assert.equal(formatNumber(2000), '2.000');
  assert.equal(formatNumber(7500), '7.500');
  assert.equal(formatNumber(500), '500');
});

test('kostenvergelijking medewerker ≈ €650 p/m', () => {
  assert.equal(Math.round(staffCostPerMonth()), 651);
  assert.equal(roundTo(staffCostPerMonth(), 50), 650);
});

test('limieten, features en support per pakket', () => {
  assert.deepEqual(TIERS.map((t) => t.limits.questionsPerMonth), [500, 2000, 7500]);
  assert.deepEqual(TIERS.map((t) => t.limits.pagesLabel), ['25', '50', 'Hele site — op maat, in overleg']);
  assert.deepEqual(TIERS.map((t) => t.limits.documentsLabel), ['10', '50', 'Onbeperkt (redelijk gebruik)']);
  assert.equal(start.features.leads, false, 'Start is bewust kaal (decoy): geen leads');
  assert.equal(groei.features.leads, true);
  assert.equal(groei.features.unbrand, false);
  assert.equal(compleet.features.onboarding, true);
  for (const t of TIERS) {
    assert.equal(FEATURES.every((f) => typeof t.features[f.id] === 'boolean'), true);
    assert.ok(t.support.length > 0);
  }
});

test('vlaggen en bedrijfsgegevens', () => {
  assert.equal(PRICING.defaultCycle, 'yearly');
  assert.equal(PRICING.showSpotsCounter, false);
  assert.equal(PRICING.introSpots, 25);
  assert.equal(PRICING.setupValue, 199);
  assert.equal(TIERS.filter((t) => t.featured).length, 1);
  assert.equal(groei.badge, 'Aanbevolen');
  assert.equal(SITE_COMPANY.email, 'info@chatmanta.com');
  assert.equal(SITE_COMPANY.kvk, null);
});
