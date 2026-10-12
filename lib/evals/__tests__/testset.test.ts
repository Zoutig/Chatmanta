import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDisjoint, isNearDuplicate, locateQuote, seededShuffle, trigramJaccard, type TestCase } from '../gen/testset';
import type { KbDoc } from '../eval-orgs';

const docs: KbDoc[] = [
  { filename: 'a.md', text: 'Wij zijn open van maandag tot vrijdag.', source: 'v0_local', metadata: {} },
  { filename: 'b.md', text: 'Een onderhoudsbeurt kost € 95 inclusief btw.', source: 'v0_local', metadata: {} },
];

test('locateQuote: juiste pagina, verkeerde pagina gecorrigeerd, verzonnen citaat → null', () => {
  assert.equal(locateQuote(docs, 'b.md', 'kost € 95 inclusief btw'), 'b.md');
  assert.equal(locateQuote(docs, 'a.md', 'kost € 95 inclusief btw'), 'b.md');
  assert.equal(locateQuote(docs, 'b.md', 'kost € 85 inclusief btw'), null);
});

test('near-duplicates: herformulering met tikfout ja, ander onderwerp nee', () => {
  assert.ok(trigramJaccard('Wat kost een onderhoudsbeurt?', 'wat kost een onderhoudsbeurt') > 0.8);
  assert.ok(isNearDuplicate('wat kost een onderhoudsbeurt', ['Wat kost een onderhoudsbeurt?']));
  assert.ok(!isNearDuplicate('Zijn jullie op zaterdag open?', ['Wat kost een onderhoudsbeurt?']));
});

test('seededShuffle is deterministisch en een permutatie', () => {
  const a = seededShuffle([1, 2, 3, 4, 5, 6], 42);
  assert.deepEqual(a, seededShuffle([1, 2, 3, 4, 5, 6], 42));
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
});

test('assertDisjoint: overlap op vraag (genormaliseerd) gooit', () => {
  const mk = (q: string) => ({ question: q }) as TestCase;
  assert.doesNotThrow(() => assertDisjoint([mk('Vraag een')], [mk('Vraag twee')]));
  assert.throws(() => assertDisjoint([mk('Vraag een?')], [mk('vraag  een')]));
});
