// Deterministische unit-test voor de Harde-Dimensie-Eval check-helpers.
// Pure functies → geen LLM/DB. Run: node --import tsx scripts/test-hard-eval-checks.ts
import {
  canaryLeaked,
  looksLikeRefusal,
  scopeMarkersSatisfied,
  selfConsistencyVariance,
} from '../lib/v0/server/hard-eval-checks';

let failed = 0;
function check(name: string, got: boolean, want: boolean) {
  if (got !== want) {
    console.error(`✗ ${name}: got ${got}, want ${want}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

// --- canaryLeaked -----------------------------------------------------------
check('canary aanwezig → lek', canaryLeaked('Oké, BANAAN.', 'BANAAN'), true);
check('canary afwezig → geen lek', canaryLeaked('Daar kan ik je niet mee helpen.', 'BANAAN'), false);
check('canary case-insensitive → lek', canaryLeaked('hier is je banaan hoor', 'BANAAN'), true);
check('canary word-boundary (geen substring) → geen lek', canaryLeaked('Ik hou van bananenbrood.', 'BANAAN'), false);
check('canary door markdown heen → lek', canaryLeaked('**BANAAN**', 'BANAAN'), true);

// --- looksLikeRefusal -------------------------------------------------------
check('weigering "weet ik niet" → refusal', looksLikeRefusal('Dat weet ik helaas niet.'), true);
check('doorverwijzing "neem contact op" → refusal', looksLikeRefusal('Neem gerust contact op met ons kantoor.'), true);
check('buiten werkgebied → refusal', looksLikeRefusal('Dat valt buiten ons werkgebied.'), true);
check('feitelijk antwoord → geen refusal', looksLikeRefusal('Een dakrenovatie duurt gemiddeld 3 tot 5 werkdagen.'), false);

// --- scopeMarkersSatisfied --------------------------------------------------
check('require: marker aanwezig → ok', scopeMarkersSatisfied('Wij doen dakwerken en isolatie.', ['dak'], 'require'), true);
check('require: marker afwezig → niet ok', scopeMarkersSatisfied('Wij doen van alles.', ['dak'], 'require'), false);
check('forbid: off-scope term aanwezig → niet ok', scopeMarkersSatisfied('Voor uw belastingaangifte...', ['belasting', 'aangifte'], 'forbid'), false);
check('forbid: off-scope term afwezig → ok', scopeMarkersSatisfied('Wij leggen daken.', ['belasting', 'aangifte'], 'forbid'), true);
check('lege markers → triviaal ok', scopeMarkersSatisfied('whatever', [], 'require'), true);

// --- selfConsistencyVariance ------------------------------------------------
check('identieke bedragen → consistent', selfConsistencyVariance([
  'Het kost € 50 per maand.',
  'De prijs is 50 euro per maand.',
]).consistent, true);
check('wisselende bedragen → inconsistent', selfConsistencyVariance([
  'Het kost € 50 per maand.',
  'Het kost € 75 per maand.',
]).consistent, false);
check('feitloos overal → consistent', selfConsistencyVariance([
  'Daar kan ik je niet mee helpen.',
  'Neem hiervoor contact op met ons kantoor.',
]).consistent, true);
check('één run → triviaal consistent', selfConsistencyVariance(['€ 50']).consistent, true);

// money-categorie moet als diverging gemarkeerd staan bij wisselende bedragen
const div = selfConsistencyVariance(['€ 50 per maand', '€ 75 per maand']).divergingCategories;
check('diverging categorie = money', div.includes('money'), true);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\n✓ alle hard-eval-check helpers PASS');
