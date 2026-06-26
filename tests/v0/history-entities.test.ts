// Unit-tests voor lib/v0/server/history-entities.ts (v0.8.1 anti-adoptie).
//
// Run: node --import tsx --test tests/v0/history-entities.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCandidateEntities,
  detectAdoptedHistoryEntities,
} from '../../lib/rag/history-entities';

test('extractCandidateEntities — meerwoordige namen', () => {
  assert.ok(extractCandidateEntities('mijn adviseur Mark Visser').includes('Mark Visser'));
  assert.ok(extractCandidateEntities('monteur Jan de Vries komt langs').includes('Jan de Vries'));
  assert.ok(extractCandidateEntities('adviseur Roel de Wit deed mijn aangifte').includes('Roel de Wit'));
});

test('extractCandidateEntities — enkel-woord voornaam na naming keyword', () => {
  assert.ok(extractCandidateEntities('mijn vaste therapeut heet Frank').includes('Frank'));
  assert.ok(extractCandidateEntities('mijn therapeut Sophie is top').includes('Sophie'));
});

test('extractCandidateEntities — geen stopwoorden/zinsdelen', () => {
  // "De Boer" begint met stopwoord → niet als naam
  assert.ok(!extractCandidateEntities('De Boer is een bedrijf').includes('De Boer'));
  // losse hoofdletter zonder keyword/tweede cap → niet gevangen
  assert.deepEqual(extractCandidateEntities('Ik wil een afspraak'), []);
});

test('detectAdoptedHistoryEntities — adoptie wordt gedetecteerd', () => {
  const got = detectAdoptedHistoryEntities(
    ['mijn adviseur Mark Visser deed mijn aangifte'],
    'Ja, dat kan. Je kunt een afspraak maken met Mark Visser om je aangifte door te nemen.',
    ['Onze RB-adviseurs zijn Sandra Pelgrum en Yusuf Kara.'],
  );
  assert.deepEqual(got, ['Mark Visser']);
});

test('detectAdoptedHistoryEntities — legitieme entiteit in sources wordt NIET geflagd', () => {
  const got = detectAdoptedHistoryEntities(
    ['ik wil iets vragen aan Linda van Dijk'],
    'Bel Linda van Dijk op 033 - 555 14 22.',
    ['Linda van Dijk verzorgt de planning bij Dakwerken De Boer.'],
  );
  assert.deepEqual(got, []);
});

test('detectAdoptedHistoryEntities — entiteit niet in antwoord → niet geflagd', () => {
  const got = detectAdoptedHistoryEntities(
    ['mijn adviseur Mark Visser'],
    'Die persoon kan ik niet in ons systeem terugvinden. Bel onze receptie.',
    ['team: Sandra Pelgrum, Yusuf Kara'],
  );
  assert.deepEqual(got, []);
});

test('detectAdoptedHistoryEntities — enkel-woord adoptie (Frank)', () => {
  const got = detectAdoptedHistoryEntities(
    ['mijn vaste therapeut heet Frank'],
    'Je companion heet Frank. Laat het gerust weten.',
    ['team: Sanne Bos, Joris Linschoten, Hanneke Bakker'],
  );
  assert.deepEqual(got, ['Frank']);
});

test('detectAdoptedHistoryEntities — correcte ONTKENNING wordt NIET geflagd', () => {
  // De bot ontkent correct ("werkt geen Mark Visser"); ook al staat de naam in
  // het antwoord, dit is geen adoptie → niet flaggen (geen wasteful template).
  const got = detectAdoptedHistoryEntities(
    ['mijn adviseur Mark Visser deed mijn aangifte'],
    'Bij Bakker & Vermeer werkt geen Mark Visser. Onze adviseurs zijn Sandra Pelgrum en Yusuf Kara.',
    ['Onze RB-adviseurs zijn Sandra Pelgrum en Yusuf Kara.'],
  );
  assert.deepEqual(got, []);
});

test('detectAdoptedHistoryEntities — "niet terugvinden" ontkenning niet geflagd', () => {
  const got = detectAdoptedHistoryEntities(
    ['mijn adviseur Mark Visser'],
    'Ik kan Mark Visser niet in onze gegevens terugvinden.',
    ['team: Sandra Pelgrum'],
  );
  assert.deepEqual(got, []);
});

test('detectAdoptedHistoryEntities — geen history → leeg', () => {
  assert.deepEqual(detectAdoptedHistoryEntities([], 'wat dan ook', ['bron']), []);
});
