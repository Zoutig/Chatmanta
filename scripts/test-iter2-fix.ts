// iter2 v0.9 — deterministische test voor de hard-fact-weiger-beslissing.
// Reproduceert de dominante out_of_corpus_overanswer-faalmodus (ongegronde
// hard-fact-hallucinatie bij ZWAKKE/MEDIUM retrieval) én de regressie-mitigatie
// (gegronde tiered-Vpb-calc bij STRONG retrieval mag NIET geweigerd worden).
// Empirisch onderbouwd (iter2-smoke): fabricatie=medium, gegronde calc=strong.
// Pure functie → deterministisch, geen LLM/DB.
//
// Run: node --import tsx scripts/test-iter2-fix.ts
import { shouldDeterministicallyRefuseHardFact } from '../lib/v0/server/hard-facts';

let failed = 0;
function check(name: string, got: boolean, want: boolean) {
  if (got !== want) {
    console.error(`✗ ${name}: got ${got}, want ${want}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

// 1. Dominante faalmodus: ongegronde fabricatie (hard-fact niet in bron) bij
//    MEDIUM retrieval → MOET deterministisch geweigerd worden.
check('fabricatie (false + medium retrieval) → refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
}), true);

// 2. Idem bij ZWAKKE retrieval → ook weigeren.
check('fabricatie (false + weak retrieval) → refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'weak', adoptedHistoryEntity: false,
}), true);

// 3. Regressie-mitigatie: gegronde tiered-Vpb-calc — hard-fact "unsupported"
//    (afgeleid getal) MAAR STRONG retrieval (directe brondekking) → NIET weigeren
//    (anders C=5→C=0 regressie op correcte rekenkunde).
check('gegronde calc (false + STRONG retrieval) → géén refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'strong', adoptedHistoryEntity: false,
}), false);

// 4. Hard-fact wél ondersteund → niets te weigeren.
check('supported hard-fact → géén refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: true, retrievalStrength: 'medium', adoptedHistoryEntity: false,
}), false);

// 5. Flag uit → v0.8.1 byte-identiek gedrag (geen weigering).
check('flag uit → géén refuse (append-only)', shouldDeterministicallyRefuseHardFact({
  enabled: false, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
}), false);

// 6. History-entiteit al deterministisch afgehandeld → niet dubbel weigeren.
check('history-entity al afgehandeld → géén dubbele refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: true,
}), false);

// 7. none = zero-hits (al afgehandeld door reclassifyAfterZeroHits) → géén refuse.
check('none retrieval (zero-hits) → géén refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'none', adoptedHistoryEntity: false,
}), false);

// 8. retrievalStrength undefined (geen adaptive decision) → géén refuse.
check('strength undefined → géén refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: undefined, adoptedHistoryEntity: false,
}), false);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\n✓ alle hard-fact-refuse-beslissing tests PASS');
