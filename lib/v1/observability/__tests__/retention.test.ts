import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contactRetentionCutoffIso, V1_CONTACT_RETENTION_DAYS } from '../retention';

// Het leeftijdsfilter is het enige risicovolle stukje van het delete-pad: een
// verkeerd teken of off-by-one zou álles of niets verwijderen. Deze checks pinnen de
// ~90-daagse grens tz-robuust (setHours(0,0,0,0) is lokale middernacht, dus we
// vermijden een exacte UTC-datum en toetsen relatieve eigenschappen met ruime marge).

const DAY_MS = 24 * 60 * 60 * 1000;

test('90-dagen-oude rij valt onder de delete; recente rij niet', () => {
  const now = new Date('2026-07-05T14:30:00.000Z');
  const cutoff = new Date(contactRetentionCutoffIso(V1_CONTACT_RETENTION_DAYS, now)).getTime();
  const daysAgo = (n: number) => now.getTime() - n * DAY_MS;

  assert.ok(daysAgo(100) < cutoff, '100 dagen oud → moet verwijderd worden');
  assert.ok(daysAgo(10) > cutoff, '10 dagen oud → moet behouden blijven');
});

test('cutoff ligt rond precies 90 dagen terug (±1 dag door middernacht-flooring)', () => {
  const now = new Date('2026-07-05T14:30:00.000Z');
  const cutoff = new Date(contactRetentionCutoffIso(90, now)).getTime();
  const daysAgo = (n: number) => now.getTime() - n * DAY_MS;

  assert.ok(cutoff <= daysAgo(89), 'grens niet jonger dan ~90 dagen');
  assert.ok(cutoff >= daysAgo(91), 'grens niet ouder dan ~90 dagen');
});

test('de retentietermijn is 90 dagen', () => {
  assert.equal(V1_CONTACT_RETENTION_DAYS, 90);
});
