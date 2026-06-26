// iter2 v0.9 — deterministische test voor de hard-fact-weiger-beslissing.
// Reproduceert de dominante out_of_corpus_overanswer-faalmodus (ongegronde
// hard-fact-hallucinatie bij ZWAKKE/MEDIUM retrieval) én de regressie-mitigatie
// (gegronde tiered-Vpb-calc bij STRONG retrieval mag NIET geweigerd worden).
// Empirisch onderbouwd (iter2-smoke): fabricatie=medium, gegronde calc=strong.
// Pure functie → deterministisch, geen LLM/DB.
//
// Run: node --import tsx scripts/test-iter2-fix.ts
import {
  shouldDeterministicallyRefuseHardFact,
  containsEmergencyHandoff,
  containsCodeOutput,
} from '../lib/rag/hard-facts';

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

// --- v0.9.1 safety-aware verfijning ---------------------------------------

// 9. KERN-REGRESSIE: zonder safetyAware (v0.9) weigert de gate ook al bevat de
//    draft een nood-doorverwijzing → de hh-globex-spoed-misfire.
check('v0.9 (safetyAware uit) → weigert ondanks handoff (regressie)', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  safetyAware: false, draftHasSafetyHandoff: true,
}), true);

// 10. v0.9.1: safetyAware AAN + draft bevat nood-doorverwijzing → NIET weigeren.
check('v0.9.1 safetyAware + handoff-draft → géén refuse (fix)', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  safetyAware: true, draftHasSafetyHandoff: true,
}), false);

// 11. v0.9.1: safetyAware AAN maar GEEN handoff in draft (echte prijs-fabricatie)
//     → upside blijft: nog steeds weigeren.
check('v0.9.1 safetyAware + fabricatie-draft → blijft weigeren (upside)', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  safetyAware: true, draftHasSafetyHandoff: false,
}), true);

// --- v0.10 (C11) fabricatie-klasse-lever -----------------------------------

// 12. Lever AAN + enige ontbrekende feit is een benign generiek getal → GÉÉN refuse
//     (over-refusal-relief: gegrond antwoord met "20 monteurs" weigert niet meer).
check('C11 lever + alleen number-missing → géén refuse', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  fabricationClassOnly: true, missingHardFacts: ['number:20'],
}), false);

// 13. Lever AAN + ontbrekend GELD-feit → blijft weigeren (fabricatie-klasse gegate).
check('C11 lever + money-missing → blijft weigeren', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  fabricationClassOnly: true, missingHardFacts: ['money:50'],
}), true);

// 14. Lever AAN + ontbrekend DATUM-feit → blijft weigeren.
check('C11 lever + date-missing → blijft weigeren', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'weak', adoptedHistoryEntity: false,
  fabricationClassOnly: true, missingHardFacts: ['date:2027'],
}), true);

// 15. Lever AAN + ontbrekend TELEFOON-feit → blijft weigeren (strikter dan spec-
//     letter: contactgegevens-fabricatie blijft mee-gegate, veiligheid eerst).
check('C11 lever + phone-missing → blijft weigeren', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  fabricationClassOnly: true, missingHardFacts: ['phone:0612345678'],
}), true);

// 16. Lever AAN + MIX (benign getal + geld) → weigeren (gevaarlijke klasse aanwezig).
check('C11 lever + mix number+money → blijft weigeren', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  fabricationClassOnly: true, missingHardFacts: ['number:20', 'money:50'],
}), true);

// 17. Lever UIT (v0.9.3) + alleen number-missing → weigeren (byte-identiek oud gedrag).
check('C11 lever UIT + number-missing → weigeren (v0.9.3-gedrag)', shouldDeterministicallyRefuseHardFact({
  enabled: true, hardFactSupported: false, retrievalStrength: 'medium', adoptedHistoryEntity: false,
  fabricationClassOnly: false, missingHardFacts: ['number:20'],
}), true);

// --- containsEmergencyHandoff detector ------------------------------------

check('detector: "bel onmiddellijk de huisarts" → handoff', containsEmergencyHandoff(
  'Bij acute pijn op de borst is het cruciaal om direct medische hulp in te schakelen. Bel onmiddellijk de huisarts of ga naar de spoedeisende hulp.',
), true);
check('detector: "112 moet bellen" → handoff', containsEmergencyHandoff(
  'Dit kan betekenen dat je 112 moet bellen of naar de dichtstbijzijnde spoedeisende hulp moet gaan.',
), true);
check('detector: "bel de hulpdiensten" → handoff', containsEmergencyHandoff(
  'Bel onmiddellijk de hulpdiensten of ga naar de dichtstbijzijnde spoedeisende hulp.',
), true);
// Negatief: een normaal prijs-/fabricatie-antwoord met "neem contact op" en een
// los getal mag NIET als handoff tellen (anders ontwapent het de upside).
check('detector: prijs-antwoord "€112 ... neem contact op" → géén handoff', containsEmergencyHandoff(
  'Een intake kost ongeveer €112. Voor een exacte prijs kunt u het beste contact met ons opnemen.',
), false);
check('detector: "bel ons gerust voor een offerte" → géén handoff', containsEmergencyHandoff(
  'Wij maken graag een offerte op maat. Bel ons gerust of vul het contactformulier in.',
), false);

// --- containsCodeOutput detector (v0.9.1 scope-guard) ----------------------

check('code-detector: python-functie met fence → code', containsCodeOutput(
  'Hier is een functie:\n```python\ndef is_priem(n):\n    if n <= 1:\n        return False\n    for i in range(2, n):\n        pass\n```',
), true);
check('code-detector: js function → code', containsCodeOutput(
  'function isPriem(n) { return true; }',
), true);
check('code-detector: normaal dakdekker-proza → géén code', containsCodeOutput(
  'Wij leggen pannendaken en EPDM-daken aan, met 10 jaar werkgarantie. Neem contact op voor een offerte.',
), false);
check('code-detector: prijs-antwoord met getallen → géén code', containsCodeOutput(
  'Een dakvervanging van 137 m² kost ongeveer € 17.000 – € 22.000 inclusief btw.',
), false);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\n✓ alle hard-fact-refuse-beslissing tests PASS');
