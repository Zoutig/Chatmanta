// V0.6.2 adaptive decision-layer — pure functies die per query beslissen
// welke optionele pipeline-stages (HyDE, rerank, cascade, claim-verify,
// followups) wel/niet draaien. Bedoeling: simpele vragen mogen het 'fast'-
// pad nemen (skip de zware stages), moeilijke vragen krijgen 'careful'
// (alle stages aan), de rest blijft 'standard' = v0.6.1-pad.
//
// Geen 'server-only' import — pure functies, tsx-testable. Geen imports
// uit rag.ts (zou een cycle veroorzaken); BotConfig is type-only.
//
// Decision wordt ÉÉNMAAL aangeroepen na het threshold-filter (Stage 7 in
// runRagQueryStreaming). Post-answer beslissingen (regenerate trigger op
// claimConfidence/hardFactSupported) blijven in hun bestaande Stage-15
// logica — de decision.shouldRegenerateClaims is een hint of het pad
// het überhaupt toestaat (= path !== 'fast'), geen "must-trigger".

import type { BotConfig } from './bots';

export type RetrievalStrength = 'none' | 'weak' | 'medium' | 'strong';
export type DecisionPath = 'fast' | 'standard' | 'careful';

export type RagDecision = {
  /** Eindkeuze: 'fast' = skip zware stages, 'careful' = alles aan,
   *  'standard' = v0.6.1-pad behouden. */
  path: DecisionPath;
  /** Retrieval-kwaliteit volgens top-1 sim + threshold-pool. */
  retrievalStrength: RetrievalStrength;
  shouldUseHyDE: boolean;
  shouldRerank: boolean;
  shouldVerifyClaims: boolean;
  /** Hint: pad ondersteunt regenerate. Werkelijke trigger blijft in
   *  Stage 15 op claimConfidence < threshold OR hardFactSupported=false. */
  shouldRegenerateClaims: boolean;
  shouldCascade: boolean;
  /** V0.6.2: standaard false — followups draaien niet in kritiek pad.
   *  UI krijgt empty followups-done event om stream-contract intact te houden. */
  shouldGenerateFollowupsInline: boolean;
  /** Korte tags die uitleggen waarom dit pad gekozen werd. Voor logging/eval. */
  reasonCodes: string[];
};

export type DecisionInput = {
  bot: BotConfig;
  originalQuestion: string;
  rewrittenQuestion: string;
  top1Sim: number | null;
  top2Sim: number | null;
  aboveThresholdCount: number;
  subQueryCount: number;
  historyLength: number;
  /** Cumulative elapsed time sinds pipeline-start in ms. */
  elapsedMs: number;
  /** Post-answer; nog niet bekend bij eerste decideRagStrategy-call. */
  confidence?: number | null;
  answerText?: string;
  claimConfidence?: number | null;
  sourceCount?: number;
};

// ---------------------------------------------------------------------------
// retrievalStrength
// ---------------------------------------------------------------------------

function classifyStrength(
  top1Sim: number | null,
  aboveThresholdCount: number,
  weakThreshold: number,
  strongThreshold: number,
): RetrievalStrength {
  if (aboveThresholdCount === 0) return 'none';
  if (top1Sim === null) return 'weak';
  if (top1Sim < weakThreshold) return 'weak';
  if (top1Sim >= strongThreshold) return 'strong';
  return 'medium';
}

// ---------------------------------------------------------------------------
// needsHistoryResolution — keyword-heuristic voor multi-turn rewrite
// ---------------------------------------------------------------------------

// Aanwijzende voornaamwoorden, persoonlijke voornaamwoorden zonder antecedent,
// verbindingswoorden die voortborduren. Word-boundary om "dit" niet te matchen
// in bv "ditermijn". Bewust kleine set — false-negative > false-positive want
// niet-matchen = v0.6.1-pad (gewoon addon prepend).
const HISTORY_REFERENCE_RE =
  /\b(?:dat|die|dit|deze|daar|daarvan|daarmee|daarop|hij|zij|het|ze|hen|hem|haar|zijn|hun)\b/i;

// Conjunctie aan begin = "vervolg" op iets eerders.
const LEADING_CONJUNCTION_RE = /^(?:en|maar|of|ook|verder|nog|dan|toch)\b[\s,?!]/i;

// Korte zelfstandige vervolg-vragen zonder onderwerp.
const SHORT_FOLLOWUP_RE =
  /^\s*(?:hoeveel|wanneer|waarom|hoe|waar|wat)\s*\?\s*$/i;

/** Pure helper: returnt true als de huidige vraag waarschijnlijk
 *  context uit chat-history nodig heeft om begrijpelijk te zijn.
 *
 *  Heuristiek (bewust simpel, ~80% recall):
 *   - één van de referentie-voornaamwoorden aanwezig
 *   - vraag begint met conjunctie (en/maar/ook/verder)
 *   - heel korte vervolg-vraag zonder subject ("hoeveel?", "wanneer?")
 *
 *  False-positives mogelijk op bv "dit product kost X" — die krijgt de
 *  multi-turn addon onnodig, maar dat is geen functionele regressie
 *  (alleen iets langer prompt). False-negatives mogelijk op
 *  "vertel meer" of "leg uit" — die missen we, maar dan valt v0.6.2
 *  terug op het v0.6.1-gedrag van zelfstandige rewrite. Acceptabel. */
export function needsHistoryResolution(question: string): boolean {
  if (!question || typeof question !== 'string') return false;
  const trimmed = question.trim();
  if (trimmed.length === 0) return false;
  if (LEADING_CONJUNCTION_RE.test(trimmed)) return true;
  if (SHORT_FOLLOWUP_RE.test(trimmed)) return true;
  if (HISTORY_REFERENCE_RE.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// decideRagStrategy
// ---------------------------------------------------------------------------

/** Pure functie: gegeven retrieval-state + bot-config, kies path en flags.
 *
 *  fast    — strong retrieval + single sub-query + duidelijke top1-top2 gap
 *  careful — weak retrieval OF samengestelde vraag OF (post-answer) harde feiten
 *  standard — anders (= v0.6.1-pad, alle bestaande conditie-checks gelden)
 *
 *  Bij bot.adaptiveRag !== true → altijd 'standard' met alle shouldX=true
 *  zodat de bestaande pipeline-condities leidend blijven. */
export function decideRagStrategy(input: DecisionInput): RagDecision {
  const {
    bot,
    top1Sim,
    top2Sim,
    aboveThresholdCount,
    subQueryCount,
    elapsedMs,
  } = input;

  const reasonCodes: string[] = [];

  // Adaptive-flag uit: pass-through naar v0.6.1-pad. Alle stage-gates
  // returnen true (= "decision laat het toe"; bestaande condities in rag.ts
  // beslissen verder).
  if (bot.adaptiveRag !== true) {
    return {
      path: 'standard',
      retrievalStrength: classifyStrength(top1Sim, aboveThresholdCount, 0.45, 0.62),
      shouldUseHyDE: true,
      shouldRerank: true,
      shouldVerifyClaims: true,
      shouldRegenerateClaims: true,
      shouldCascade: true,
      shouldGenerateFollowupsInline: true,
      reasonCodes: ['adaptiveRag-off'],
    };
  }

  const weakThreshold = bot.adaptiveWeakTopSim ?? 0.45;
  const strongThreshold = bot.adaptiveStrongTopSim ?? 0.62;
  const rerankMargin = bot.adaptiveRerankMargin ?? 0.08;
  const latencyBudgetMs = bot.latencyBudgetMs ?? 8000;

  const retrievalStrength = classifyStrength(
    top1Sim,
    aboveThresholdCount,
    weakThreshold,
    strongThreshold,
  );

  // Top1-top2 gap — alleen relevant als beide aanwezig zijn. Bij maar 1 chunk
  // boven threshold: 'duidelijk verschil' = ja (er is geen rivaal).
  const top1Top2Gap =
    top1Sim !== null && top2Sim !== null
      ? top1Sim - top2Sim
      : top1Sim !== null
        ? rerankMargin // single chunk telt als clear winner
        : null;
  const hasClearWinner =
    top1Top2Gap !== null && top1Top2Gap >= rerankMargin;

  // ---- careful path: weak retrieval OF samengesteld OF harde feiten ----
  const hasComposite = subQueryCount > 1;
  const isCareful =
    retrievalStrength === 'weak' ||
    retrievalStrength === 'none' ||
    hasComposite;
  if (isCareful) {
    if (retrievalStrength === 'weak') reasonCodes.push('careful:weak-retrieval');
    if (retrievalStrength === 'none') reasonCodes.push('careful:no-retrieval');
    if (hasComposite) reasonCodes.push('careful:composite-query');
    // careful: alle kwaliteitslagen aan, behalve cascade bij weak (zou priors invullen)
    const cascadeSafe =
      retrievalStrength === 'medium' || retrievalStrength === 'strong';
    return {
      path: 'careful',
      retrievalStrength,
      shouldUseHyDE: hydeDecision(top1Sim, bot, elapsedMs, latencyBudgetMs, reasonCodes),
      shouldRerank: true,
      shouldVerifyClaims: true,
      shouldRegenerateClaims: true,
      shouldCascade: cascadeSafe && aboveThresholdCount >= 2,
      shouldGenerateFollowupsInline: false,
      reasonCodes,
    };
  }

  // ---- fast path: strong retrieval + clear winner + single query ----
  const isFast =
    retrievalStrength === 'strong' && hasClearWinner && !hasComposite;
  if (isFast) {
    reasonCodes.push('fast:strong-retrieval', 'fast:clear-winner', 'fast:single-query');
    return {
      path: 'fast',
      retrievalStrength,
      shouldUseHyDE: false, // strong retrieval heeft geen HyDE nodig
      shouldRerank: false, // duidelijke top1 — rerank zou marginaal helpen
      shouldVerifyClaims: false, // skip claim-verify; hard-fact alleen via regenerate-trigger
      shouldRegenerateClaims: false,
      shouldCascade: false, // skip cascade; sterke chunks vragen niet om sterker model
      shouldGenerateFollowupsInline: false,
      reasonCodes,
    };
  }

  // ---- standard path: medium retrieval, of strong-zonder-clear-winner ----
  reasonCodes.push(
    retrievalStrength === 'strong' && !hasClearWinner
      ? 'standard:strong-but-ambiguous'
      : `standard:${retrievalStrength}`,
  );
  return {
    path: 'standard',
    retrievalStrength,
    shouldUseHyDE: hydeDecision(top1Sim, bot, elapsedMs, latencyBudgetMs, reasonCodes),
    shouldRerank: true,
    shouldVerifyClaims: true,
    shouldRegenerateClaims: true,
    shouldCascade: aboveThresholdCount >= 2,
    shouldGenerateFollowupsInline: false,
    reasonCodes,
  };
}

// ---------------------------------------------------------------------------
// HyDE-decision: alleen bij zwakke retrieval EN voldoende budget
// ---------------------------------------------------------------------------

function hydeDecision(
  top1Sim: number | null,
  bot: BotConfig,
  elapsedMs: number,
  latencyBudgetMs: number,
  reasonCodes: string[],
): boolean {
  const trigger = bot.selectiveHyDETrigger ?? 0.5;
  if (top1Sim !== null && top1Sim >= trigger) {
    reasonCodes.push(`hyde-skip:top1>=trigger(${trigger})`);
    return false;
  }
  // ~1500ms reserved voor HyDE: generate + embed + retrieve
  if (elapsedMs + 1500 >= latencyBudgetMs) {
    reasonCodes.push('hyde-skip:budget-tight');
    return false;
  }
  reasonCodes.push('hyde:weak-retrieval');
  return true;
}
