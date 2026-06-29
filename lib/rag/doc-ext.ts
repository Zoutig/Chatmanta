// Document-extensie-allowlist — pure data (geen `server-only`, geen deps) zodat
// zowel server-code (extractDocText, ingest-pad) ÁLS client-code (de upload-UI z'n
// `accept`-hint + UX-pre-check) één bron van waarheid delen zonder de zware
// pdf-parse/mammoth-laag (die wél server-only is) in de client-bundle te trekken.
// doc-parse.ts re-exporteert deze symbolen voor backwards-compat.

/** Ondersteunde extensies (kleine letters, zonder punt). */
export const ALLOWED_DOC_EXT = ['pdf', 'docx', 'txt', 'md'] as const;
export type AllowedDocExt = (typeof ALLOWED_DOC_EXT)[number];

export function isAllowedDocExt(ext: string): ext is AllowedDocExt {
  return (ALLOWED_DOC_EXT as readonly string[]).includes(ext);
}
