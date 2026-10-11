// Eval-kopie-orgs voor het ingest-onderzoek fase B (2026-10-11): dezelfde kennisbank
// als het origineel, maar anders geknipt/geëmbed. Persona en toon volgen het origineel.
// Geen UI/widget (bewust niet in KNOWN_ORGS). Pure module — veilig vanuit CLI-scripts.
const ORIGINALS = {
  1: '00000000-0000-0000-0000-0000000000a1',
  2: '00000000-0000-0000-0000-0000000000a2',
  3: '00000000-0000-0000-0000-0000000000a3',
  4: '00000000-0000-0000-0000-0000000000a6',
} as const;

const map: Record<string, string> = {};
for (const variant of ['b', 'c', 'e']) {
  for (const [n, orig] of Object.entries(ORIGINALS)) {
    map[`00000000-0000-0000-0000-0000000000${variant}${n}`] = orig;
  }
}
export const EVAL_COPY_ORG_ORIGINAL: Readonly<Record<string, string>> = Object.freeze(map);

/** Org-id van het origineel als dit een eval-kopie is, anders het id zelf. */
export function resolveEvalCopyOrg(orgId: string): string {
  return EVAL_COPY_ORG_ORIGINAL[orgId] ?? orgId;
}
