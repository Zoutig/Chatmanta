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

import { embedTexts } from './rag';

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
};

export type ClaimVerificationResult = {
  claims: ClaimVerification[];
  /** Aggregate: verified count / total count. NaN als geen claims. */
  confidence: number;
  /** Cost van de extra embed-call. */
  costUsd: number;
  /** Embed-tokens voor de extra call. */
  embedTokens: number;
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
 */
export async function verifyClaims(args: {
  answerText: string;
  chunks: { id: string; text: string }[];
  threshold: number;
}): Promise<ClaimVerificationResult> {
  const claims = splitIntoClaims(args.answerText);

  if (claims.length === 0) {
    return { claims: [], confidence: NaN, costUsd: 0, embedTokens: 0 };
  }

  if (args.chunks.length === 0) {
    // Geen chunks → niets te verifiëren tegen. Markeer alles als unverified
    // met sim=0. Confidence 0.
    return {
      claims: claims.map((text, index) => ({
        index,
        text,
        verified: false,
        bestSimilarity: 0,
        bestChunkId: null,
      })),
      confidence: 0,
      costUsd: 0,
      embedTokens: 0,
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
    verifications.push({
      index: i,
      text: claims[i],
      verified,
      bestSimilarity: Math.max(0, bestSim),
      bestChunkId: bestIdx >= 0 ? args.chunks[bestIdx].id : null,
    });
  }

  return {
    claims: verifications,
    confidence: verifications.length === 0 ? NaN : verifiedCount / verifications.length,
    costUsd: embed.costUsd,
    embedTokens: embed.tokens,
  };
}
