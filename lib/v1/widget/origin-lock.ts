// Origin-lock voor de V1-publieke widget-routes (token-mint + chat). Port van het
// V0-helpertje in app/api/v0/widget/token/route.ts. Gedeeld door beide routes zodat
// ze dezelfde herkomst-grens hanteren (geen drift).
//
// Bewust GÉÉN 'server-only' → unit-testbaar in node:test. Geen import van lib/v0.

/**
 * True iff de request van onze eigen ChatManta-host komt: de Origin- (of als
 * fallback Referer-) host moet gelijk zijn aan de request-host. Ontbrekende
 * header of onparseerbare URL → false (fail-closed). De widget-chat draait in
 * onze eigen /embed-v1-iframe, dus z'n fetches hebben de app-host als Origin.
 */
export function sameOrigin(req: { headers: { get(name: string): string | null } }): boolean {
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}
