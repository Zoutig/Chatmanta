// AAL2-step-up-beslissing voor requireJorionAdmin (security-audit 2026-10, #6).
//
// Waarom een eigen functie: supabase.auth.mfa.getAuthenticatorAssuranceLevel() zonder
// jwt-argument haalt `user.factors` uit de sessie-COOKIE. Alleen het access_token
// daarin is ondertekend, het user-object niet. Wie het wachtwoord heeft, kan dus zijn
// eigen cookie bewerken (factors leeg) en zo langs de 2FA-gate. Daarom bepalen we:
//   - "heeft MFA"   uit de user van getUser() (door de Auth-server geverifieerd);
//   - "is nu aal2"  uit de `aal`-claim van een geverifieerd JWT (getClaims()).
// Puur en zonder Supabase-import, zodat de beslissing los te testen is.

type FactorLike = { status?: string | null };

/** Aantal geverifieerde MFA-factoren op een (door de server geverifieerde) user. */
export function countVerifiedFactors(factors: readonly FactorLike[] | null | undefined): number {
  return (factors ?? []).filter((f) => f?.status === 'verified').length;
}

/**
 * true = blokkeren (2FA vereist). Alleen als de user een geverifieerde factor HEEFT
 * en deze sessie nog geen aal2 is. Geen MFA ingesteld → nooit blokkeren (zelfde
 * gedrag als vóór deze fix: niemand wordt buitengesloten tot hij MFA instelt).
 */
export function requiresAal2StepUp(input: {
  verifiedFactorCount: number;
  currentLevel: string | null | undefined;
}): boolean {
  return input.verifiedFactorCount > 0 && input.currentLevel !== 'aal2';
}
