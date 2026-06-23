// PR-2-guard: geen enkele runtime-module onder lib/ of app/ mag nog zelf een
// service-role-client bouwen — alles moet via lib/supabase/admin.ts. Scope is
// bewust lib/+app/ (de runtime/SA-5-grens); scripts/ blijven buiten scope (die
// draaien buiten Next.js met --conditions=react-server en zijn geen onderdeel
// van de runtime-grens — ze door admin.ts → @/lib/auth routeren riskeert
// import-keten-breuk voor weinig waarde).
//
// Deze test is de scharnierpin-enabler voor de latere V0/V1-namespace-split:
// zolang er ÉÉN plek is die SUPABASE_SERVICE_ROLE_KEY leest, kan die in tweeën.
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
// admin.ts-exclusie (cross-platform correct: relative + join geven dezelfde
// separator-stijl).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// Token gesplitst zodat dit testbestand zichzelf niet als overtreder telt.
const NEEDLE = 'SUPABASE_SERVICE_ROLE_' + 'KEY';
const ADMIN = join('lib', 'supabase', 'admin.ts');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '__tests__'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

test('geen ad-hoc service-role-client buiten lib/supabase/admin.ts', () => {
  const offenders: string[] = [];
  for (const root of ['lib', 'app']) {
    for (const file of walk(join(repoRoot, root))) {
      const rel = relative(repoRoot, file);
      if (rel === ADMIN) continue;
      if (readFileSync(file, 'utf8').includes(NEEDLE)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Service-role-key wordt nog buiten admin.ts gelezen:\n${offenders.join('\n')}`,
  );
});
