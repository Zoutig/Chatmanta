// PR-2-guard: geen enkele runtime-module onder lib/ of app/ mag nog zelf de
// service-role-key naar een Supabase-client schrijven — alles moet via de
// centrale factory getServiceRoleClient() in lib/supabase/service-role.ts.
// Scope is bewust lib/+app/ (de runtime/SA-5-grens); scripts/ blijven buiten
// scope (die draaien buiten Next.js met --conditions=react-server en zijn geen
// onderdeel van de runtime-grens).
//
// Deze test is de scharnierpin-enabler voor de latere V0/V1-namespace-split:
// zolang er ÉÉN plek is die SUPABASE_SERVICE_ROLE_KEY naar een client schrijft,
// kan die in tweeën.
//
// Heuristiek: een bestand is een overtreder als het ZOWEL de key-string ÁLS de
// substring `createClient` bevat. Dat vangt de realistische regressie (iemand
// plakt het oude `createClient(url, SERVICE_ROLE_KEY, …)`-patroon terug) ÉN de
// aliased-import-ontwijking die de PR-2-review noemde
// (`import { createClient as x }` — die import-regel bevat `createClient`).
// We eisen `createClient` (geen kale key-needle) zodat een bestand dat de key
// alléén in een COMMENT noemt (bv. controlroom/server/db.ts dat de factory
// her-exporteert) géén false-positive geeft. Bewust geaccepteerde grens: een
// client bouwen zonder ergens `createClient` te noemen (volledig geïndirecteerde
// constructor) ontwijkt deze tripwire — perfecte statische detectie is
// onbeslisbaar; de echte vangrail tegen accidentele her-introductie is dit + tsc.
//
// Run: node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vanaf lib/supabase/__tests__/<dit-bestand> is ../../.. de repo-root.
// LET OP: fileURLToPath kan hier een trailing separator teruggeven (de URL
// eindigt op '/'), dus bereken `rel` met path.relative i.p.v. een fragiele
// slice(length+1) — anders verliest de eerste padletter en faalt de
// allowlist-match (cross-platform correct: relative + join geven dezelfde
// separator-stijl).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// Token gesplitst zodat dit testbestand zichzelf niet als overtreder telt.
const NEEDLE = 'SUPABASE_SERVICE_ROLE_' + 'KEY';

// Allowlist: het ENIGE bestand dat de key legitiem naar een client mag schrijven.
// (De read-only presence-check in app/admindashboard/instellingen/page.tsx en de
// her-export in lib/controlroom/server/db.ts hoeven hier NIET in: zij bevatten
// geen `createClient` en worden dus sowieso niet geflagd.)
const ALLOWED = new Set([
  join('lib', 'supabase', 'service-role.ts'),
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '__tests__'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

test('SUPABASE_SERVICE_ROLE_KEY alleen in de factory + allowlist, nergens ad-hoc', () => {
  const offenders: string[] = [];
  for (const root of ['lib', 'app']) {
    for (const file of walk(join(repoRoot, root))) {
      const rel = relative(repoRoot, file);
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (src.includes(NEEDLE) && src.includes('createClient')) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Service-role-key wordt buiten de factory/allowlist gelezen:\n${offenders.join('\n')}`,
  );
});
