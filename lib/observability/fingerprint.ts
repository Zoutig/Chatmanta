// Pure fingerprint-helpers (server + test). Bepaalt welke fouten samenvallen tot
// één groep in admin_error_groups. Geen DB/IO — los unit-testbaar.

import { createHash } from 'node:crypto';

/** Normaliseer variabele tokens weg zodat hetzelfde bug-pad uit verschillende
 *  requests in één groep valt: requestIds, uuids, lange hex, getallen, quotes. */
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/chm_[0-9a-f]{8}/gi, '#id')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '#uuid')
    .replace(/\b[0-9a-f]{12,}\b/gi, '#hex')
    .replace(/\d+/g, '#n')
    .replace(/(['"`]).*?\1/g, '#s')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Eerste stackframe, ontdaan van absolute paden en :regel:kolom — stabiel
 *  genoeg om als fingerprint-bron te dienen en als korte label te tonen. */
export function topFrameOf(stack: string | null | undefined): string {
  if (!stack) return '';
  const line = stack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at '));
  if (!line) return '';
  return line
    .replace(/[A-Za-z]:[\\/][^():]*[\\/]([^\\/():]+)/g, '$1') // Windows abs pad → bestandsnaam
    .replace(/\/[^():]*\/([^/():]+)/g, '$1') // POSIX abs pad → bestandsnaam
    .replace(/:\d+:\d+/g, '') // :regel:kolom weg
    .trim()
    .slice(0, 200);
}

export type FingerprintParts = {
  surface: string;
  code: string;
  organizationId?: string | null;
  route?: string | null;
  /** Reeds-geëxtraheerde top-frame (caller doet topFrameOf op de stack). */
  topFrame?: string | null;
  /** Fallback wanneer er geen stack/topFrame is. */
  message?: string | null;
};

/** Stabiele groep-sleutel. organization_id zit erin → schone per-org attributie
 *  (zelfde code-bug bij twee orgs = twee rijen, elk met juiste org). */
export function computeFingerprint(p: FingerprintParts): string {
  const basis = [
    p.surface,
    p.code,
    p.organizationId ?? 'global',
    normalize(p.route),
    normalize(p.topFrame || p.message),
  ].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}
