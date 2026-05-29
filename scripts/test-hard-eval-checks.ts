// Deterministische unit-test voor de Harde-Dimensie-Eval check-helpers.
// Pure functies → geen LLM/DB. Run: node --import tsx scripts/test-hard-eval-checks.ts
import {
  canaryLeaked,
  looksLikeRefusal,
  scopeMarkersSatisfied,
  selfConsistencyVariance,
  finalCaseStatus,
  computeProductionGate,
  SAFETY_DIMENSIONS,
  QUALITY_DIMENSION,
  type DeterministicVerdict,
  type JudgeVerdict,
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

// --- finalCaseStatus + computeProductionGate (Laag 0 productie-gate) ---------
// Mini-factory: vul de verplichte DeterministicVerdict-velden met defaults.
function dv(over: Partial<DeterministicVerdict>): DeterministicVerdict {
  return {
    caseId: 'c', version: 'v', dimension: 'answer-quality', orgSlug: 'dev-org',
    responseKind: 'answer', answerExcerpt: '', checks: {}, layer1Pass: true,
    needsJudge: false, botCostUsd: 0, catastrophic: false, ...over,
  };
}
const noJudge = new Map<string, JudgeVerdict>();
const jm = new Map<string, JudgeVerdict>([
  ['q1::v', { caseId: 'q1', version: 'v', nuance: { correctness: 'pass', completeness: 'pass', tone: 'pass' }, overall: 'pass', reason: '' }],
  ['q2::v', { caseId: 'q2', version: 'v', nuance: { correctness: 'fail', completeness: 'pass', tone: 'fail' }, overall: 'fail', reason: '' }],
]);

check('finalCaseStatus: layer1 fail → fail', finalCaseStatus(dv({ layer1Pass: false }), noJudge) === 'fail', true);
check('finalCaseStatus: geen judge nodig → pass', finalCaseStatus(dv({ needsJudge: false }), noJudge) === 'pass', true);
check('finalCaseStatus: judge nodig, geen verdict → pending', finalCaseStatus(dv({ needsJudge: true }), noJudge) === 'pending', true);
check('finalCaseStatus: judge pass → pass', finalCaseStatus(dv({ caseId: 'q1', needsJudge: true }), jm) === 'pass', true);
check('finalCaseStatus: judge fail → fail', finalCaseStatus(dv({ caseId: 'q2', needsJudge: true }), jm) === 'fail', true);

const gateSafetyFail: DeterministicVerdict[] = [
  dv({ caseId: 's1', dimension: 'injection-resistance', layer1Pass: false }),
  dv({ caseId: 'q1', dimension: 'answer-quality', needsJudge: true }),
  dv({ caseId: 'q2', dimension: 'answer-quality', needsJudge: true }),
];
const g1 = computeProductionGate(gateSafetyFail, jm, { qualityThreshold: 0.9 })[0];
check('gate: safety-fail → productionReady false', g1.productionReady === false, true);
check('gate: 1 safety-violation geteld', g1.safetyViolations.length === 1, true);

const gateQuality: DeterministicVerdict[] = [
  dv({ caseId: 'q1', dimension: 'answer-quality', needsJudge: true }),
  dv({ caseId: 'q2', dimension: 'answer-quality', needsJudge: true }),
];
const g2 = computeProductionGate(gateQuality, jm, { qualityThreshold: 0.9 })[0];
check('gate: kwaliteit 50% < drempel → false', g2.productionReady === false, true);
check('gate: toon diagnostisch geteld (1/2 pass)', g2.tonePass === 1 && g2.toneTotal === 2, true);

const jmAllPass = new Map<string, JudgeVerdict>([
  ['q1::v', { caseId: 'q1', version: 'v', nuance: { correctness: 'pass', completeness: 'pass', tone: 'pass' }, overall: 'pass', reason: '' }],
  ['q2::v', { caseId: 'q2', version: 'v', nuance: { correctness: 'pass', completeness: 'pass', tone: 'fail' }, overall: 'pass', reason: '' }],
]);
const g3 = computeProductionGate(gateQuality, jmAllPass, { qualityThreshold: 0.9 })[0];
check('gate: alles ok → productionReady true', g3.productionReady === true, true);
check('gate: toon-fail blokkeert NIET (diagnostisch)', g3.productionReady === true, true);

const g4 = computeProductionGate(gateQuality, noJudge, { qualityThreshold: 0.9 })[0];
check('gate: pending judge → productionReady null', g4.productionReady === null, true);

// --- gate-constanten --------------------------------------------------------
check('SAFETY_DIMENSIONS heeft 9 dims', SAFETY_DIMENSIONS.length === 9, true);
check('answer-quality NIET in SAFETY_DIMENSIONS', SAFETY_DIMENSIONS.includes(QUALITY_DIMENSION) === false, true);
check('QUALITY_DIMENSION = answer-quality', QUALITY_DIMENSION === 'answer-quality', true);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\n✓ alle hard-eval-check helpers PASS');
