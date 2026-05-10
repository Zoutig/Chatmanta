// Display-helpers voor claim-verification UI.
//
// De server-side `verified`-flag is binair (sim ≥ threshold). Voor de UI
// vertalen we de continue best-similarity score naar een 3-staps schaal
// zodat de gebruiker onderscheid ziet tussen:
//   - verified  (groen): bron ondersteunt deze claim duidelijk
//   - partial   (oranje): bron komt in de buurt, maar haalt threshold niet
//   - unverified (rood): geen bron ondersteunt deze claim
//
// De partial-band is een venster van 20% onder threshold. Bij default
// threshold 0.7 → partial = 0.5..0.7. Bij lagere threshold schuift het venster
// mee zodat partial nooit overlapt met verified en altijd een visueel
// betekenisvolle range pakt.

import type { ClaimVerificationData } from './server/rag';

export type ClaimStatus = 'verified' | 'partial' | 'unverified';

const PARTIAL_BAND_WIDTH = 0.2;

export function classifyClaim(
  bestSimilarity: number,
  threshold: number,
): ClaimStatus {
  if (bestSimilarity >= threshold) return 'verified';
  const partialFloor = Math.max(0, threshold - PARTIAL_BAND_WIDTH);
  if (bestSimilarity >= partialFloor) return 'partial';
  return 'unverified';
}

/** Aggregate teller voor de header-chip. */
export type GroundedSummary = {
  total: number;
  verified: number;
  partial: number;
  unverified: number;
  /** Verhouding 0..1; NaN als total === 0. */
  ratio: number;
  /** Welke chip-tone past — gebaseerd op de verhouding. */
  tone: 'high' | 'mid' | 'low' | 'na';
};

export function summarizeClaims(
  claims: ClaimVerificationData[] | undefined,
  threshold: number,
): GroundedSummary {
  if (!claims || claims.length === 0) {
    return {
      total: 0,
      verified: 0,
      partial: 0,
      unverified: 0,
      ratio: NaN,
      tone: 'na',
    };
  }
  let verified = 0;
  let partial = 0;
  let unverified = 0;
  for (const c of claims) {
    const status = classifyClaim(c.bestSimilarity, threshold);
    if (status === 'verified') verified++;
    else if (status === 'partial') partial++;
    else unverified++;
  }
  const ratio = verified / claims.length;
  const tone: GroundedSummary['tone'] =
    ratio >= 0.8 ? 'high' : ratio >= 0.5 ? 'mid' : 'low';
  return {
    total: claims.length,
    verified,
    partial,
    unverified,
    ratio,
    tone,
  };
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  verified: 'Verified',
  partial: 'Deels',
  unverified: 'Geen bron',
};

/** Korte, scanbare label voor de header-chip. */
export function chipLabel(s: GroundedSummary): string {
  if (s.total === 0) return 'geen claims';
  return `${s.verified}/${s.total} grounded`;
}
