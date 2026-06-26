// Smoke-test voor needsHistoryResolution() in rag-decision.ts (V0.6.2 PR-B).
// Run: npx tsx scripts/test-v06-history-resolution.ts

import { strict as assert } from 'node:assert';
import { needsHistoryResolution } from '../lib/rag/rag-decision';

function show(label: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// True-cases: vraag heeft history-context nodig
show('aanwijzend voornaamwoord "dat" → true', () => {
  assert.equal(needsHistoryResolution('Wat kost dat?'), true);
});

show('aanwijzend voornaamwoord "die" → true', () => {
  assert.equal(needsHistoryResolution('Hoe werkt die precies?'), true);
});

show('aanwijzend voornaamwoord "deze" → true', () => {
  assert.equal(needsHistoryResolution('Hoe verschilt deze van anderen?'), true);
});

show('persoonlijk voornaamwoord "hij" zonder antecedent → true', () => {
  assert.equal(needsHistoryResolution('Werkt hij ook offline?'), true);
});

show('beginnen met conjunctie "En..." → true', () => {
  assert.equal(needsHistoryResolution('En de prijs?'), true);
});

show('beginnen met conjunctie "Ook..." → true', () => {
  assert.equal(needsHistoryResolution('Ook in het Engels?'), true);
});

show('beginnen met conjunctie "Maar..." → true', () => {
  assert.equal(needsHistoryResolution('Maar werkt dat dan wel?'), true);
});

show('korte vervolg-vraag zonder onderwerp "hoeveel?" → true', () => {
  assert.equal(needsHistoryResolution('hoeveel?'), true);
  assert.equal(needsHistoryResolution('Hoeveel?'), true);
});

show('korte vervolg-vraag "wanneer?" → true', () => {
  assert.equal(needsHistoryResolution('wanneer?'), true);
});

// False-cases: zelfstandige vraag, geen history nodig
show('zelfstandige feitelijke vraag → false', () => {
  assert.equal(needsHistoryResolution('Wat doet ChatManta?'), false);
});

show('zelfstandige prijsvraag → false', () => {
  assert.equal(needsHistoryResolution('Wat kost ChatManta per maand?'), false);
});

show('zelfstandige stack-vraag → false', () => {
  assert.equal(needsHistoryResolution('Welke database gebruikt ChatManta?'), false);
});

show('zelfstandige how-vraag (geen kale "hoe?") → false', () => {
  assert.equal(needsHistoryResolution('Hoe werkt RAG?'), false);
});

show('smalltalk-greeting → false', () => {
  assert.equal(needsHistoryResolution('Hoi, kan jij me helpen?'), false);
});

// Edge cases
show('lege string → false', () => {
  assert.equal(needsHistoryResolution(''), false);
});

show('alleen whitespace → false', () => {
  assert.equal(needsHistoryResolution('   '), false);
});

show('niet-string input → false (defensief)', () => {
  // @ts-expect-error testing defensive guard
  assert.equal(needsHistoryResolution(null), false);
  // @ts-expect-error testing defensive guard
  assert.equal(needsHistoryResolution(undefined), false);
});

show('"hij" in productnaam-context → true (false-positive geaccepteerd)', () => {
  // Known false-positive: "Hij is een product van..." waar "hij" een
  // benoemd subject is. Accepteren want recall > precision: bij twijfel
  // de addon meesturen geeft alleen iets langer prompt, geen functioneel
  // probleem.
  assert.equal(needsHistoryResolution('Hij is een product van Jorion'), true);
});

console.log('\n✓ All needsHistoryResolution smoke tests passed.');
