import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  amsterdamHour,
  computeSignals,
  isCurrentMonth,
  lastCompleteMonth,
  monthRangeIso,
  parsePeriodMonth,
  periodMonthKey,
  worstSeverity,
  type RecapSignal,
  type RecapStats,
} from '@/lib/controlroom/recap-logic';

function stats(overrides: Partial<RecapStats> = {}): RecapStats {
  return {
    totalConversations: 100,
    uniqueVisitors: 40,
    avgDurationSeconds: 90,
    avgMessagesPerConversation: 3,
    unansweredCount: 5,
    totalTurns: 100,
    peakHour: 14,
    ...overrides,
  };
}

// --- computeSignals ---------------------------------------------------------

test('computeSignals: 0 gesprekken → alleen geen_gebruik (actie_vereist), rest kortgesloten', () => {
  const s = computeSignals(stats({ totalConversations: 0, totalTurns: 0, unansweredCount: 0, peakHour: null }), []);
  assert.equal(s.length, 1);
  assert.equal(s[0].type, 'geen_gebruik');
  assert.equal(s[0].severity, 'actie_vereist');
  assert.equal(s[0].status, 'nieuw');
});

test('computeSignals: fallback > 20% → kennisbank_incompleet (waarschuwing)', () => {
  const s = computeSignals(stats({ totalTurns: 100, unansweredCount: 25 }), []);
  assert.ok(s.some((x) => x.type === 'kennisbank_incompleet' && x.severity === 'waarschuwing'));
});

test('computeSignals: fallback exact 20% → geen kennisbank_incompleet (strikt >)', () => {
  const s = computeSignals(stats({ totalTurns: 100, unansweredCount: 20 }), []);
  assert.ok(!s.some((x) => x.type === 'kennisbank_incompleet'));
});

test('computeSignals: vraag ≥15× onbeantwoord → ontbrekende_info met vraag + telling', () => {
  const s = computeSignals(stats(), [{ question: 'wat kost een behandeling?', count: 21 }]);
  const sig = s.find((x) => x.type === 'ontbrekende_info');
  assert.ok(sig);
  assert.match(sig!.message, /21×/);
  assert.match(sig!.message, /behandeling/);
});

test('computeSignals: vraag <15× → geen ontbrekende_info', () => {
  const s = computeSignals(stats(), [{ question: 'iets', count: 14 }]);
  assert.ok(!s.some((x) => x.type === 'ontbrekende_info'));
});

test('computeSignals: piekuur buiten 08:00–18:00 → gebruik_buiten_kantooruren (inzicht)', () => {
  for (const h of [21, 7, 18, 0, 23]) {
    assert.ok(
      computeSignals(stats({ peakHour: h }), []).some(
        (x) => x.type === 'gebruik_buiten_kantooruren' && x.severity === 'inzicht',
      ),
      `piekuur ${h} hoort buiten kantooruren te vallen`,
    );
  }
});

test('computeSignals: piekuur binnen kantooruren (8..17) → geen buiten-kantooruren-signaal', () => {
  for (const h of [8, 12, 17]) {
    assert.ok(
      !computeSignals(stats({ peakHour: h }), []).some((x) => x.type === 'gebruik_buiten_kantooruren'),
      `piekuur ${h} hoort binnen kantooruren te vallen`,
    );
  }
});

test('computeSignals: levert UITSLUITEND de 4 toegestane types (korte_gesprekken/lage_engagement bestaan niet)', () => {
  const allowed = new Set(['kennisbank_incompleet', 'ontbrekende_info', 'gebruik_buiten_kantooruren', 'geen_gebruik']);
  const s = computeSignals(
    stats({ avgDurationSeconds: 5, avgMessagesPerConversation: 1, peakHour: 21, totalTurns: 100, unansweredCount: 50 }),
    [{ question: 'x', count: 30 }],
  );
  for (const sig of s) assert.ok(allowed.has(sig.type), `onverwacht type: ${sig.type}`);
});

// --- worstSeverity ----------------------------------------------------------

test('worstSeverity: kiest de zwaarste ernst', () => {
  const mk = (severity: RecapSignal['severity']): RecapSignal => ({
    type: 'kennisbank_incompleet',
    severity,
    message: '',
    status: 'nieuw',
  });
  assert.equal(worstSeverity([]), null);
  assert.equal(worstSeverity([mk('inzicht')]), 'inzicht');
  assert.equal(worstSeverity([mk('inzicht'), mk('waarschuwing')]), 'waarschuwing');
  assert.equal(worstSeverity([mk('waarschuwing'), mk('actie_vereist')]), 'actie_vereist');
});

// --- maand-utilities --------------------------------------------------------

test('maand-utils: periodMonthKey + parsePeriodMonth', () => {
  assert.equal(periodMonthKey(2026, 5), '2026-05');
  assert.equal(periodMonthKey(2026, 12), '2026-12');
  assert.deepEqual(parsePeriodMonth('2026-05'), { year: 2026, month: 5 });
  assert.equal(parsePeriodMonth('2026-13'), null);
  assert.equal(parsePeriodMonth('2026-00'), null);
  assert.equal(parsePeriodMonth('onzin'), null);
});

test('maand-utils: monthRangeIso respecteert de jaargrens (dec → jan volgend jaar)', () => {
  const { sinceIso, untilIso } = monthRangeIso(2026, 12);
  assert.equal(new Date(sinceIso).getTime(), new Date(2026, 11, 1).getTime());
  assert.equal(new Date(untilIso).getTime(), new Date(2027, 0, 1).getTime());
});

test('maand-utils: lastCompleteMonth = vorige kalendermaand', () => {
  assert.deepEqual(lastCompleteMonth(new Date(2026, 0, 15)), { year: 2025, month: 12 });
  assert.deepEqual(lastCompleteMonth(new Date(2026, 5, 3)), { year: 2026, month: 5 });
});

test('maand-utils: isCurrentMonth', () => {
  const now = new Date(2026, 5, 10); // juni 2026 (month index 5 = juni)
  assert.equal(isCurrentMonth(2026, 6, now), true);
  assert.equal(isCurrentMonth(2026, 5, now), false);
});

test('amsterdamHour: zomer/winter offset', () => {
  assert.equal(amsterdamHour('2026-01-15T12:00:00Z'), 13); // winter: UTC+1
  assert.equal(amsterdamHour('2026-07-15T12:00:00Z'), 14); // zomer: UTC+2
});
