// Smoke-test voor lib/v0/server/rag-decision.ts (V0.6.2 PR-B).
// Run: npx tsx scripts/test-v06-decision.ts

import { strict as assert } from 'node:assert';
import { decideRagStrategy } from '../lib/v0/server/rag-decision';
import { BOTS } from '../lib/v0/server/bots';

const v05 = BOTS['v0.5']; // adaptiveRag undefined → standard pad
const v062 = BOTS['v0.6.2']; // adaptiveRag=true

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

// Helper voor verkorte input — vult alleen verschil-makende fields in.
function input(overrides: {
  bot?: typeof v062;
  top1Sim?: number | null;
  top2Sim?: number | null;
  aboveThresholdCount?: number;
  subQueryCount?: number;
  elapsedMs?: number;
}) {
  // Gebruik `=== undefined` ipv `??` zodat null als override-waarde
  // niet ongewild teruggevallen wordt naar de default 0.5.
  return {
    bot: overrides.bot ?? v062,
    originalQuestion: 'Wat doet ChatManta?',
    rewrittenQuestion: 'Wat doet ChatManta?',
    top1Sim: overrides.top1Sim === undefined ? 0.5 : overrides.top1Sim,
    top2Sim: overrides.top2Sim === undefined ? 0.4 : overrides.top2Sim,
    aboveThresholdCount: overrides.aboveThresholdCount ?? 3,
    subQueryCount: overrides.subQueryCount ?? 1,
    historyLength: 0,
    elapsedMs: overrides.elapsedMs ?? 1000,
  };
}

// ---------------------------------------------------------------------------
// adaptiveRag uit → standard pass-through
// ---------------------------------------------------------------------------

show('v0.5 (adaptiveRag undefined) → standard pad, alle stages aan', () => {
  const d = decideRagStrategy(input({ bot: v05, top1Sim: 0.65 }));
  assert.equal(d.path, 'standard');
  assert.equal(d.shouldUseHyDE, true);
  assert.equal(d.shouldRerank, true);
  assert.equal(d.shouldVerifyClaims, true);
  assert.equal(d.shouldRegenerateClaims, true);
  assert.equal(d.shouldCascade, true);
  assert.equal(d.shouldGenerateFollowupsInline, true);
  assert.ok(d.reasonCodes.includes('adaptiveRag-off'));
});

// ---------------------------------------------------------------------------
// retrievalStrength classification
// ---------------------------------------------------------------------------

show('strength: aboveThresholdCount=0 → none', () => {
  const d = decideRagStrategy(input({ aboveThresholdCount: 0, top1Sim: null }));
  assert.equal(d.retrievalStrength, 'none');
  assert.equal(d.path, 'careful');
});

show('strength: top1=0.40 (< weak 0.45) → weak → careful pad', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.40, aboveThresholdCount: 1 }));
  assert.equal(d.retrievalStrength, 'weak');
  assert.equal(d.path, 'careful');
  // Cascade NIET bij weak — geen grond voor sterker model
  assert.equal(d.shouldCascade, false);
  assert.ok(d.reasonCodes.some((r) => r.includes('careful:weak')));
});

show('strength: top1=0.55 (medium) → medium retrievalStrength', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.55, top2Sim: 0.50 }));
  assert.equal(d.retrievalStrength, 'medium');
  assert.equal(d.path, 'standard');
});

show('strength: top1=0.70 (>= strong 0.62) → strong', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.70, top2Sim: 0.55 }));
  assert.equal(d.retrievalStrength, 'strong');
});

// ---------------------------------------------------------------------------
// fast path
// ---------------------------------------------------------------------------

show('fast: strong top1 + clear winner + single-query → fast', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.70,
    top2Sim: 0.55, // gap = 0.15 >= 0.08
    subQueryCount: 1,
  }));
  assert.equal(d.path, 'fast');
  assert.equal(d.shouldUseHyDE, false);
  assert.equal(d.shouldRerank, false);
  assert.equal(d.shouldVerifyClaims, false);
  assert.equal(d.shouldCascade, false);
  assert.equal(d.shouldGenerateFollowupsInline, false);
  assert.ok(d.reasonCodes.some((r) => r.startsWith('fast:')));
});

show('fast: strong top1 + single chunk (no top2) → fast (clear winner)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.75,
    top2Sim: null,
    aboveThresholdCount: 1,
    subQueryCount: 1,
  }));
  assert.equal(d.path, 'fast');
});

show('NOT fast: strong top1 maar gap < margin → standard (ambigu)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.70,
    top2Sim: 0.65, // gap = 0.05 < 0.08
    subQueryCount: 1,
  }));
  assert.equal(d.path, 'standard');
  assert.equal(d.shouldRerank, true);
  assert.ok(d.reasonCodes.some((r) => r.includes('standard:strong-but-ambiguous')));
});

// ---------------------------------------------------------------------------
// careful path
// ---------------------------------------------------------------------------

show('careful: samengestelde vraag (subQueryCount>1) → careful zelfs bij sterke retrieval', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.75,
    top2Sim: 0.50,
    subQueryCount: 3, // decompose splitsing
  }));
  assert.equal(d.path, 'careful');
  assert.ok(d.reasonCodes.some((r) => r.includes('composite-query')));
});

show('careful: weak retrievalStrength gateet shouldCascade=false', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.30,
    aboveThresholdCount: 1,
  }));
  assert.equal(d.path, 'careful');
  assert.equal(d.shouldCascade, false);
});

show('careful: medium-range retrieval staat cascade toe (mits aboveThresholdCount >= 2)', () => {
  // subQueryCount=2 forceer careful, retrievalStrength=medium
  const d = decideRagStrategy(input({
    top1Sim: 0.55,
    top2Sim: 0.50,
    aboveThresholdCount: 3,
    subQueryCount: 2,
  }));
  assert.equal(d.path, 'careful');
  assert.equal(d.shouldCascade, true);
});

// ---------------------------------------------------------------------------
// HyDE budget-gate
// ---------------------------------------------------------------------------

show('HyDE: weak retrieval + ruim budget → shouldUseHyDE=true', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.35,
    aboveThresholdCount: 1,
    elapsedMs: 1000,
  }));
  assert.equal(d.shouldUseHyDE, true);
});

show('HyDE: weak retrieval maar budget krap → shouldUseHyDE=false', () => {
  // latencyBudgetMs=8000 (geerfd van v0.5); elapsedMs+1500 >= 8000 → skip
  // evalBudgetMs (5500 op v0.6.2) is iets anders — geldt alleen voor eval-runner.
  const d = decideRagStrategy(input({
    top1Sim: 0.35,
    aboveThresholdCount: 1,
    elapsedMs: 7000, // 7000 + 1500 = 8500 >= 8000 → skip
  }));
  assert.equal(d.shouldUseHyDE, false);
  assert.ok(d.reasonCodes.some((r) => r.includes('hyde-skip:budget')));
});

show('HyDE: top1 boven trigger 0.5 → skip ongeacht budget', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.55,
    top2Sim: 0.50,
    elapsedMs: 500,
  }));
  assert.equal(d.shouldUseHyDE, false);
  assert.ok(d.reasonCodes.some((r) => r.includes('hyde-skip:top1>=trigger')));
});

// ---------------------------------------------------------------------------
// Boundary-cases
// ---------------------------------------------------------------------------

show('top1Sim=null → weak retrievalStrength → careful pad', () => {
  const d = decideRagStrategy(input({
    top1Sim: null,
    aboveThresholdCount: 1,
  }));
  assert.equal(d.retrievalStrength, 'weak');
  assert.equal(d.path, 'careful');
});

show('elke decision heeft minimaal 1 reasonCode', () => {
  const d1 = decideRagStrategy(input({ top1Sim: 0.70, top2Sim: 0.55 }));
  const d2 = decideRagStrategy(input({ top1Sim: 0.30, aboveThresholdCount: 1 }));
  const d3 = decideRagStrategy(input({ top1Sim: 0.55, top2Sim: 0.50 }));
  assert.ok(d1.reasonCodes.length > 0);
  assert.ok(d2.reasonCodes.length > 0);
  assert.ok(d3.reasonCodes.length > 0);
});

console.log('\n✓ All rag-decision smoke tests passed.');
