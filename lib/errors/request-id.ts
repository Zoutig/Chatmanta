// Genereer een korte, voor mensen scanbare correlation-ID per API-request.
//
// Format: `chm_` + 8 hex chars = 12 chars totaal. Kort genoeg om in een
// widget-tooltip te tonen en om door te telefoneren ("Hoi, ik kreeg ID
// chm_a1b2c3d4"). Niet cryptografisch uniek, maar collisie-risico binnen één
// org over de levensduur van V0 is verwaarloosbaar.

export function newRequestId(): string {
  const hex = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `chm_${hex}`;
}
