// Smoke-test voor lib/v0/server/rag-decision.ts.
// Run: npx tsx scripts/test-v06-decision.ts

import { strict as assert } from 'node:assert';
import { decideRagStrategy } from '../lib/v0/server/rag-decision';
import { BOTS } from '../lib/v0/server/bots';
import type { BotConfig } from '../lib/v0/server/bots';

const v05 = BOTS['v0.5']; // adaptiveRag undefined → standard pad
const v06 = BOTS['v0.6']; // adaptiveRag=true, strong=0.56, weak=0.50, composite='standard'

// Synthetic legacy variant: representeert het v0.6.2-experiment (strong=0.62,
// weak=0.45, composite='careful'). Bewaard om backwards-compat-paden in
// rag-decision.ts te testen, ook al staat die config niet in productie BOTS.
const legacyCompositeCareful: BotConfig = {
  ...v06,
  adaptiveStrongTopSim: 0.62,
  adaptiveWeakTopSim: 0.45,
  compositeQueryPath: 'careful',
};

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
  bot?: BotConfig;
  top1Sim?: number | null;
  top2Sim?: number | null;
  aboveThresholdCount?: number;
  subQueryCount?: number;
  elapsedMs?: number;
}) {
  // Gebruik `=== undefined` ipv `??` zodat null als override-waarde
  // niet ongewild teruggevallen wordt naar de default 0.5.
  return {
    bot: overrides.bot ?? v06,
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
// V0.6 — retrievalStrength classification met gekalibreerde thresholds
// ---------------------------------------------------------------------------

show('v0.6: aboveThresholdCount=0 → none → careful', () => {
  const d = decideRagStrategy(input({ aboveThresholdCount: 0, top1Sim: null }));
  assert.equal(d.retrievalStrength, 'none');
  assert.equal(d.path, 'careful');
});

show('v0.6: top1=0.45 (< weak 0.50) → weak → careful pad', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.45, aboveThresholdCount: 1 }));
  assert.equal(d.retrievalStrength, 'weak');
  assert.equal(d.path, 'careful');
  assert.equal(d.shouldCascade, false); // weak: geen cascade
  assert.ok(d.reasonCodes.some((r) => r.includes('careful:weak')));
});

show('v0.6: top1=0.53 (medium, tussen 0.50 en 0.56) → standard', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.53, top2Sim: 0.48 }));
  assert.equal(d.retrievalStrength, 'medium');
  assert.equal(d.path, 'standard');
});

show('v0.6: top1=0.58 (>= strong 0.56) → strong', () => {
  const d = decideRagStrategy(input({ top1Sim: 0.58, top2Sim: 0.48 }));
  assert.equal(d.retrievalStrength, 'strong');
});

// ---------------------------------------------------------------------------
// fast path
// ---------------------------------------------------------------------------

show('v0.6 fast: strong top1 + clear winner + single-query → fast', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.60,
    top2Sim: 0.45, // gap = 0.15 >= 0.08
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

show('v0.6 fast: strong top1 + single chunk (no top2) → fast (clear winner)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.65,
    top2Sim: null,
    aboveThresholdCount: 1,
    subQueryCount: 1,
  }));
  assert.equal(d.path, 'fast');
});

show('v0.6 NOT fast: strong top1 maar gap < margin → standard (ambigu)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.58,
    top2Sim: 0.55, // gap = 0.03 < 0.08
    subQueryCount: 1,
  }));
  assert.equal(d.path, 'standard');
  assert.equal(d.shouldRerank, true);
  assert.ok(d.reasonCodes.some((r) => r.includes('standard:strong-but-ambiguous')));
});

show('v0.6 fast: composite-query bij strong + clear winner → fast (compositePath=standard staat toe)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.60,
    top2Sim: 0.45,
    subQueryCount: 2,
  }));
  assert.equal(d.path, 'fast');
  assert.ok(d.reasonCodes.some((r) => r.includes('fast:composite-allowed')));
});

// ---------------------------------------------------------------------------
// careful path
// ---------------------------------------------------------------------------

show('v0.6 careful: weak retrievalStrength gateet shouldCascade=false', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.30,
    aboveThresholdCount: 1,
  }));
  assert.equal(d.path, 'careful');
  assert.equal(d.shouldCascade, false);
});

show('v0.6: composite-query bij medium retrieval → STANDARD (composite-redirected)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.53,
    top2Sim: 0.48,
    aboveThresholdCount: 3,
    subQueryCount: 3,
  }));
  assert.equal(d.path, 'standard');
  assert.ok(d.reasonCodes.some((r) => r.includes('standard:composite-redirected')));
  assert.ok(!d.reasonCodes.some((r) => r.includes('careful:composite')));
});

show('v0.6: composite-query bij WEAK retrieval → nog steeds careful (weak overschrijft)', () => {
  const d = decideRagStrategy(input({
    top1Sim: 0.40,
    aboveThresholdCount: 1,
    subQueryCount: 2,
  }));
  assert.equal(d.path, 'careful');
  assert.ok(d.reasonCodes.some((r) => r.includes('careful:weak-retrieval')));
});

// ---------------------------------------------------------------------------
// Legacy backwards-compat: bots met compositeQueryPath='careful' (oude v0.6.2)
// triggeren nog steeds composite→careful. Geen runtime-codepad in productie,
// maar de logica blijft testbaar.
// ---------------------------------------------------------------------------

show('legacy (composite=careful): composite-query → careful pad', () => {
  const d = decideRagStrategy(input({
    bot: legacyCompositeCareful,
    top1Sim: 0.55,
    top2Sim: 0.50,
    aboveThresholdCount: 3,
    subQueryCount: 2,
  }));
  assert.equal(d.path, 'careful');
  assert.ok(d.reasonCodes.some((r) => r.includes('careful:composite-query')));
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
  const d1 = decideRagStrategy(input({ top1Sim: 0.60, top2Sim: 0.45 }));
  const d2 = decideRagStrategy(input({ top1Sim: 0.30, aboveThresholdCount: 1 }));
  const d3 = decideRagStrategy(input({ top1Sim: 0.53, top2Sim: 0.48 }));
  assert.ok(d1.reasonCodes.length > 0);
  assert.ok(d2.reasonCodes.length > 0);
  assert.ok(d3.reasonCodes.length > 0);
});

console.log('\n✓ All rag-decision smoke tests passed.');
