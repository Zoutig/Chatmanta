// Smoke-test voor looksMultiHop() in rag-decision.ts (v0.9.2 decompose-gate).
// Run: npx tsx scripts/test-v092-multihop.ts
//
// Contract: liberaal multi-hop detecteren (bij twijfel TRUE → decompose blijft).
// FALSE alleen bij overtuigend single-hop. False-negatives zijn veilig: zonder
// oppervlak-splitsbare deelvragen geeft decompose tóch ~1 subquery terug.

import { strict as assert } from 'node:assert';
import { looksMultiHop } from '../lib/v0/server/rag-decision';

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

// ---- TRUE: multi-hop → decompose blijft draaien ----
show('twee vraagtekens → true', () => {
  assert.equal(looksMultiHop('Wat kost het? En hoe lang duurt het?'), true);
});
show('conjunctie + tweede vraagwoord ("en hoeveel") → true', () => {
  assert.equal(looksMultiHop('Wat kost een plat dak en hoeveel jaar garantie krijg ik?'), true);
});
show('conjunctie + "wanneer" → true', () => {
  assert.equal(looksMultiHop('Hoeveel kost onderhoud en wanneer komen jullie langs?'), true);
});
show('twee distincte vraagwoorden → true', () => {
  assert.equal(looksMultiHop('Welke garantie en wat is de prijs?'), true);
});
show('vergelijking "verschil tussen" → true', () => {
  assert.equal(looksMultiHop('Wat is het verschil tussen EPDM en bitumen?'), true);
});
show('vergelijking "vs" → true', () => {
  assert.equal(looksMultiHop('EPDM vs bitumen, wat raden jullie aan?'), true);
});
show('"vergelijk" → true', () => {
  assert.equal(looksMultiHop('Vergelijk jullie onderhoudscontracten voor mij.'), true);
});
show('"zowel ... als ..." → true', () => {
  assert.equal(looksMultiHop('Doen jullie zowel platte als hellende daken?'), true);
});
show('conjunctie + "ook" → true', () => {
  assert.equal(looksMultiHop('Leggen jullie daken en doen jullie ook onderhoud?'), true);
});

// ---- FALSE: overtuigend single-hop → decompose overslaan ----
show('enkele feitelijke prijsvraag → false', () => {
  assert.equal(looksMultiHop('Wat kost een plat bitumen-dak per m²?'), false);
});
show('enkele garantievraag → false', () => {
  assert.equal(looksMultiHop('Welke garantie geven jullie op een EPDM-dak?'), false);
});
show('enkele duur-vraag → false', () => {
  assert.equal(looksMultiHop('Hoe lang duurt een dakrenovatie?'), false);
});
show('enkele "ook"-vraag zonder conjunctie-ask → false', () => {
  assert.equal(looksMultiHop('Doen jullie ook onderhoud?'), false);
});
show('openingstijden → false', () => {
  assert.equal(looksMultiHop('Wat zijn jullie openingstijden?'), false);
});
show('offerte-aanvraag met locatie → false', () => {
  assert.equal(looksMultiHop('Kan ik een offerte aanvragen voor mijn dak in Amersfoort?'), false);
});
show('"hoeveel" telt niet dubbel als "hoe" → false', () => {
  // 1 vraagwoord (hoeveel), geen conjunctie-ask, geen vergelijking.
  assert.equal(looksMultiHop('Hoeveel kost een dakkapel?'), false);
});

// ---- Edge cases ----
show('lege string → false', () => {
  assert.equal(looksMultiHop(''), false);
});
show('alleen whitespace → false', () => {
  assert.equal(looksMultiHop('   '), false);
});
show('niet-string input → false (defensief)', () => {
  // @ts-expect-error testing defensive guard
  assert.equal(looksMultiHop(null), false);
  // @ts-expect-error testing defensive guard
  assert.equal(looksMultiHop(undefined), false);
});

console.log('\n✓ All looksMultiHop smoke tests passed.');
