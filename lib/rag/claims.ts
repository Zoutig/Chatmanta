// V0.4 claim verification — split antwoord in claims, embed alles in één
// batch, cosine-sim per (claim × chunk), verified = max ≥ threshold.
//
// Kost: één extra embed-call (batched). Latency: ~200-400ms. Geen LLM-call
// nodig — puur vector-vergelijking.
//
// Niet-doel: LLM-judge of fact-checking. Dat doet het eval-framework
// offline. Claim verification draait inline op elke query als bot.claimVerification
// aan staat.

import 'server-only';

import { embedTexts } from './embeddings';
import {
  extractHardFacts,
  hardFactsSupportedBySources,
  type ExtractedHardFacts,
} from './hard-facts';

export type ClaimVerification = {
  /** 0-based positie in het antwoord. */
  index: number;
  /** De zin / claim, na inline-citation strip. */
  text: string;
  /** Max sim ≥ threshold? */
  verified: boolean;
  /** Hoogste cosine-sim die deze claim haalde tegen één van de chunks. */
  bestSimilarity: number;
  /** Welke chunk haalde de hoogste sim? null als geen chunks beschikbaar. */
  bestChunkId: string | null;
  /**
   * v0.6.1: harde feiten in deze claim (geld/percentages/datums/aantallen/
   * email/url/telefoon). Alleen gezet als verifyClaims met
   * hardFactCheck=true werd aangeroepen EN de claim minstens één hard fact
   * bevat. Undefined = check niet gedraaid OF geen harde feiten in claim.
   */
  hardFacts?: ExtractedHardFacts;
  /**
   * v0.6.1: lijst hard-fact strings die NIET in de chunks teruggevonden
   * konden worden (categorie-prefixed: "money:500", "phone:0699999999").
   * Lege array = alles ondersteund. Undefined = check niet gedraaid.
   */
  missingHardFacts?: string[];
  /**
   * v0.6.1: aggregate boolean per claim. true = alle harde feiten in deze
   * claim teruggevonden in chunks (genormaliseerd). false = minstens één
   * fact ontbreekt. Undefined = check niet gedraaid OF claim bevat geen
   * harde feiten (dan is hardFactSupported irrelevant).
   */
  hardFactSupported?: boolean;
};

export type ClaimVerificationResult = {
  claims: ClaimVerification[];
  /** Aggregate: verified count / total count. NaN als geen claims. */
  confidence: number;
  /** Cost van de extra embed-call. */
  costUsd: number;
  /** Embed-tokens voor de extra call. */
  embedTokens: number;
  /**
   * v0.6.1: aggregate hard-fact ondersteuning over alle claims. true = elke
   * claim met harde feiten heeft hardFactSupported=true (of bevat geen harde
   * feiten). false = minstens één claim heeft missende harde feiten.
   * Undefined wanneer hardFactCheck niet aanstond.
   */
  hardFactSupported?: boolean;
  /**
   * v0.6.1: alle missing hard-facts geünificeerd (categorie-prefixed).
   * Dedupt over claims. Undefined wanneer hardFactCheck niet aanstond.
   */
  missingHardFacts?: string[];
};

// Min lengte na strip-citations om als "echte claim" te tellen. Onder dit
// nummer = waarschijnlijk filler ("Bedankt!", "Ja.", "[1][2]").
const MIN_CLAIM_LEN = 25;

// Inline citation patroon: [1], [2], [1,2], [1, 2 ,3]. Strippen voor lengte-
// check + voor de embed-tekst zodat citation-noise de embedding niet vervormt.
const CITATION_RE = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

// Sentence splitter — split op . ! ? gevolgd door whitespace + hoofdletter
// (lookbehind/lookahead). Heuristisch maar werkt goed voor Nederlands.
// Niet perfect (afkortingen zoals "bv." of "etc." worden split-points) maar
// good-enough voor V0; chunk-similarity kan kleine fragments verdragen.
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[A-ZÀ-Ý])/;

/**
 * Split een antwoordtekst in claims. Filtert te korte/filler zinnen weg.
 * Geeft de geschoonde claim-tekst terug (zonder inline citations).
 */
export function splitIntoClaims(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const sentences = trimmed.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter(Boolean);

  const claims: string[] = [];
  for (const s of sentences) {
    const stripped = s.replace(CITATION_RE, '').replace(/\s+/g, ' ').trim();
    if (stripped.length < MIN_CLAIM_LEN) continue;
    claims.push(stripped);
  }
  return claims;
}

/** Cosine similarity tussen twee gelijke-lengte vectoren. */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Verifieer claims tegen chunks via embedding-similarity. Eén batched
 * embed-call voor alle claims + chunks samen — single round-trip naar OpenAI.
 *
 * @param threshold default 0.7. Configureerbaar via bot.claimVerificationThreshold.
 * @param hardFactCheck v0.6.1 — als true, run ook per-claim hard-fact extractie
 *   (regex op geld/percentages/datums/etc.) en check of die letterlijk of
 *   genormaliseerd in de chunks staan. Aanvulling op embedding-similarity die
 *   wel vector-shape matcht maar verkeerde getallen niet onderscheidt.
 * @param hardFactNumericFallback v0.6.3 — bepaalt of de hard-fact verifier
 *   money/percent cross-categorie mag matchen tegen generieke numbers in
 *   source. Default true (v0.6.1/v0.6.2 gedrag). v0.6.3 zet false om
 *   €249-class hallucinaties te vangen.
 */
export async function verifyClaims(args: {
  answerText: string;
  chunks: { id: string; text: string }[];
  threshold: number;
  hardFactCheck?: boolean;
  hardFactNumericFallback?: boolean;
}): Promise<ClaimVerificationResult> {
  const claims = splitIntoClaims(args.answerText);
  const hardFactCheck = args.hardFactCheck === true;
  const hardFactNumericFallback = args.hardFactNumericFallback !== false;

  if (claims.length === 0) {
    return {
      claims: [],
      confidence: NaN,
      costUsd: 0,
      embedTokens: 0,
      ...(hardFactCheck ? { hardFactSupported: true, missingHardFacts: [] } : {}),
    };
  }

  // Helper: voeg hard-fact data toe aan een claim-object indien check actief
  // is en de claim minstens één hard fact bevat.
  const sourceTexts = args.chunks.map((c) => c.text);
  const enrichWithHardFacts = (
    claim: ClaimVerification,
  ): ClaimVerification => {
    if (!hardFactCheck) return claim;
    const facts = extractHardFacts(claim.text);
    const hasAnyFact =
      facts.money.length +
        facts.percentages.length +
        facts.datesOrYears.length +
        facts.numbers.length +
        facts.emails.length +
        facts.urls.length +
        facts.phones.length >
      0;
    if (!hasAnyFact) return claim;
    const support = hardFactsSupportedBySources(facts, sourceTexts, {
      numericFallback: hardFactNumericFallback,
    });
    return {
      ...claim,
      hardFacts: facts,
      missingHardFacts: support.missing,
      hardFactSupported: support.supported,
    };
  };

  if (args.chunks.length === 0) {
    // Geen chunks → niets te verifiëren tegen. Markeer alles als unverified
    // met sim=0. Confidence 0.
    const noChunksClaims = claims.map<ClaimVerification>((text, index) =>
      enrichWithHardFacts({
        index,
        text,
        verified: false,
        bestSimilarity: 0,
        bestChunkId: null,
      }),
    );
    const aggregated = aggregateHardFactSupport(noChunksClaims, hardFactCheck);
    return {
      claims: noChunksClaims,
      confidence: 0,
      costUsd: 0,
      embedTokens: 0,
      ...aggregated,
    };
  }

  // Eén batched embed call: claims eerst, dan chunks. Splits achteraf op offset.
  const embedInputs: string[] = [
    ...claims,
    ...args.chunks.map((c) => c.text),
  ];
  const embed = await embedTexts(embedInputs);
  const claimVecs = embed.vectors.slice(0, claims.length);
  const chunkVecs = embed.vectors.slice(claims.length);

  const verifications: ClaimVerification[] = [];
  let verifiedCount = 0;
  for (let i = 0; i < claims.length; i++) {
    let bestSim = -1;
    let bestIdx = -1;
    for (let j = 0; j < chunkVecs.length; j++) {
      const sim = cosineSim(claimVecs[i], chunkVecs[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    const verified = bestSim >= args.threshold;
    if (verified) verifiedCount++;
    verifications.push(
      enrichWithHardFacts({
        index: i,
        text: claims[i],
        verified,
        bestSimilarity: Math.max(0, bestSim),
        bestChunkId: bestIdx >= 0 ? args.chunks[bestIdx].id : null,
      }),
    );
  }

  const aggregated = aggregateHardFactSupport(verifications, hardFactCheck);
  return {
    claims: verifications,
    confidence: verifications.length === 0 ? NaN : verifiedCount / verifications.length,
    costUsd: embed.costUsd,
    embedTokens: embed.tokens,
    ...aggregated,
  };
}

/** v0.6.1 — aggregate hardFactSupported over alle claims. Een claim zonder
 *  hard-facts (hardFactSupported===undefined) telt als "geen probleem".
 *  Returnt undefined-fields als hardFactCheck uit stond zodat het response
 *  type schoon blijft. */
function aggregateHardFactSupport(
  claims: ClaimVerification[],
  enabled: boolean,
): Pick<ClaimVerificationResult, 'hardFactSupported' | 'missingHardFacts'> {
  if (!enabled) return {};
  const missing: string[] = [];
  let anyClaimUnsupported = false;
  for (const c of claims) {
    if (c.hardFactSupported === false) {
      anyClaimUnsupported = true;
      if (c.missingHardFacts) missing.push(...c.missingHardFacts);
    }
  }
  return {
    hardFactSupported: !anyClaimUnsupported,
    missingHardFacts: [...new Set(missing)],
  };
}
