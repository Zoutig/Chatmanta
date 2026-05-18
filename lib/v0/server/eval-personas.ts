// V0 eval persona-loader — leest per-org persona-specs uit
// `eval-fixtures/personas/{slug}.md` voor injectie in zowel absolute als
// pairwise judge-prompts.
//
// Waarom file-based (en niet DB-driven): persona's wijzigen samen met de
// eval-corpus en horen daarom in dezelfde repo-versie als de seed-questions.
// Een DB-kolom zou een extra migration per persona-tweak vragen — files
// committen is goedkoper.
//
// Caller-contract:
//   const persona = getPersonaForOrgId(question.organization_id);
//   prompt += formatPersonaSection(persona);
//
// Voor DEV_ORG bestaat geen persona-file → null. De judge slaat tone_match
// dan over (returneert null) — caller moet daar tegen kunnen.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Hardcoded mapping spiegelt KNOWN_ORGS in lib/v0/server/active-org.ts. Niet
// importeren omdat active-org.ts `next/headers` binnentrekt en deze loader
// vanuit CLI-scripts (tsx) draait — daar is geen Next-runtime. UUIDs zijn
// V0-vaste constanten (zie CLAUDE.md).
const SLUG_BY_ORG_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});

const PERSONA_DIR = resolve(process.cwd(), 'eval-fixtures', 'personas');

// Module-scope cache. Persona-files zijn statisch tijdens een eval-run; bij
// een fixture-wijziging start je het script opnieuw, dus cache-invalidate is
// niet nodig.
const personaCache = new Map<string, string | null>();

/**
 * Lees de persona-spec voor een org-slug. Returneert de volledige markdown
 * (inclusief headers — de judge interpreteert het als een gestructureerde
 * spec). Null als er geen persona-file is voor deze slug.
 */
export function getPersonaForOrgSlug(slug: string): string | null {
  if (personaCache.has(slug)) return personaCache.get(slug) ?? null;

  const path = resolve(PERSONA_DIR, `${slug}.md`);
  if (!existsSync(path)) {
    personaCache.set(slug, null);
    return null;
  }

  const content = readFileSync(path, 'utf8').trim();
  personaCache.set(slug, content);
  return content;
}

/**
 * Persona voor een organization_id. Null bij DEV_ORG (geen persona-file) of
 * onbekende org. Caller moet null-graceful zijn — bij null wordt tone_match
 * niet ge-scored.
 */
export function getPersonaForOrgId(orgId: string): string | null {
  const slug = SLUG_BY_ORG_ID[orgId];
  if (!slug) return null;
  return getPersonaForOrgSlug(slug);
}

/**
 * Helper voor judge-prompt building: formatteer de persona-sectie als losse
 * blok dat in de user-prompt geïnjecteerd kan worden. Lege string als er
 * geen persona is — caller kan dit ongewijzigd in het template plakken.
 */
export function formatPersonaSection(persona: string | null): string {
  if (!persona) return '';
  return [
    '## Verwacht persona / register voor deze org',
    '',
    persona,
    '',
    '## Einde persona',
    '',
  ].join('\n');
}

/**
 * Of een org tone_match-scoring ondersteunt. False voor DEV_ORG (geen persona).
 * Caller gebruikt dit om de judge-prompt te vragen tone_match=null te returnen
 * voor org's zonder persona-spec.
 */
export function orgHasPersona(orgId: string): boolean {
  return getPersonaForOrgId(orgId) !== null;
}
