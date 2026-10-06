import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUnsupportedPremises, extractPremiseCandidates } from '../premise-check';

const CTX = 'Ons team: Karel Pronk (zink), Bas Jansen, Linda van Dijk (planning). Bel 033 - 555 14 22. Inspectie € 95.';

test('geplante volledige naam wordt gemeld', () => {
  assert.deepEqual(findUnsupportedPremises(['Heeft Jan de Vries vandaag tijd?'], CTX), ['Jan de Vries']);
});
test('bestaande naam wordt niet gemeld', () => {
  assert.deepEqual(findUnsupportedPremises(['Kan Linda van Dijk mij bellen?'], CTX), []);
});
test('rol + voornaam', () => {
  assert.deepEqual(findUnsupportedPremises(['Is therapeut Frank vrijdag beschikbaar?'], CTX), ['Frank']);
});
test('bedrag en telefoon uit de vraag', () => {
  const m = findUnsupportedPremises(['Klopt het dat inspectie € 49 kost? Ik belde 0900-1234567.'], CTX);
  assert.ok(m.includes('€ 49'));
  assert.ok(m.includes('09001234567'));
});
test('bedrijfsnaam en zinsbegin geen naam', () => {
  const c = extractPremiseCandidates(['Wat kost een dak bij Dakwerken De Boer?']);
  assert.deepEqual(findUnsupportedPremises(['Wat kost een dak bij Dakwerken De Boer?'], CTX, ['Dakwerken De Boer']), [], JSON.stringify(c));
});
