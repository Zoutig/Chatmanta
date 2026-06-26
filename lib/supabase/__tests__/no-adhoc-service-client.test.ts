// Grep-gate: dwingt de V0/V1-namespace-split af op de SA-5-grens (lib/ + app/).
//
// Geen enkele runtime-module mag ad-hoc de service-role-key naar een Supabase-
// client schrijven — dat moet via de centrale factories:
//   - V0 → getServiceRoleClient() in lib/supabase/service-role.ts (V0_*-env)
//   - V1 → getV1ServiceRoleClient() in lib/supabase/v1/service-role.ts (V1_*-env)
// Scope is bewust lib/+app/ (de runtime/SA-5-grens); scripts/ blijven buiten
// scope (die draaien buiten Next.js met --conditions=react-server en zijn geen
// onderdeel van de runtime-grens).
//
// Heuristiek: een bestand is een overtreder als het ZOWEL de key-string ÁLS de
// substring `createClient` bevat. Dat vangt de realistische regressie (iemand
// plakt het oude `createClient(url, SERVICE_ROLE_KEY, …)`-patroon terug) ÉN de
// aliased-import-ontwijking (`import { createClient as x }` — die import-regel
// bevat `createClient`). We eisen `createClient` (geen kale key-needle) zodat een
// bestand dat de key alléén in een COMMENT noemt géén false-positive geeft.
// Bewust geaccepteerde grens: een client bouwen zonder ergens `createClient` te
// noemen (volledig geïndirecteerde constructor) ontwijkt deze tripwire — perfecte
// statische detectie is onbeslisbaar; de echte vangrail is dit + tsc.
//
// Run: node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vanaf lib/supabase/__tests__/<dit-bestand> is ../../.. de repo-root.
// LET OP: fileURLToPath kan hier een trailing separator teruggeven (de URL
// eindigt op '/'), dus bereken `rel` met path.relative i.p.v. een fragiele
// slice(length+1) — anders verliest de eerste padletter en faalt de
// allowlist-match (cross-platform correct: relative + join geven dezelfde
// separator-stijl).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '__tests__'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

// V0 = de bestaande factory; V1 = de nieuwe namespaced factories.
const V0_NEEDLE = 'V0_SUPABASE_SERVICE_ROLE_' + 'KEY';
const V1_NEEDLE = 'V1_SUPABASE_SERVICE_ROLE_' + 'KEY';

const V0_SERVICE_ROLE = join('lib', 'supabase', 'service-role.ts');
const V1_SERVICE_ROLE = join('lib', 'supabase', 'v1', 'service-role.ts');

const V0_KEY_ALLOWED = new Set([V0_SERVICE_ROLE]);
const V1_KEY_ALLOWED = new Set([V1_SERVICE_ROLE]);

function allFiles(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  for (const root of ['lib', 'app']) {
    for (const file of walk(join(repoRoot, root))) {
      out.push({ rel: relative(repoRoot, file), src: readFileSync(file, 'utf8') });
    }
  }
  return out;
}

// Red→green-driver: faalt zolang de V0-factory de KALE legacy-key leest (vóór A5),
// slaagt zodra hij de V0-geprefixte naam gebruikt. Dit is de test die A4 rood maakt.
test('V0-factory leest de V0-geprefixte service-role-key', () => {
  const src = readFileSync(join(repoRoot, 'lib', 'supabase', 'service-role.ts'), 'utf8');
  assert.ok(
    src.includes('V0_SUPABASE_SERVICE_ROLE_' + 'KEY'),
    'lib/supabase/service-role.ts moet V0_SUPABASE_SERVICE_ROLE_KEY lezen (V0/V1-split)',
  );
});

test('V0 service-role key alleen in de V0-factory', () => {
  const offenders = allFiles()
    .filter((f) => !V0_KEY_ALLOWED.has(f.rel) && f.src.includes(V0_NEEDLE) && f.src.includes('createClient'))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V0 service-role-key buiten lib/supabase/service-role.ts:\n${offenders.join('\n')}`);
});

test('V1 service-role key alleen in de V1-factory', () => {
  const offenders = allFiles()
    .filter((f) => !V1_KEY_ALLOWED.has(f.rel) && f.src.includes(V1_NEEDLE) && f.src.includes('createClient'))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V1 service-role-key buiten lib/supabase/v1/service-role.ts:\n${offenders.join('\n')}`);
});

test('alleen de V1-allowlist mag lib/supabase/v1/* importeren', () => {
  const v1Import = /from ['"]@\/lib\/supabase\/v1\//;
  // Wie LEGITIEM een V1-client mag importeren. Alles daarbuiten dat v1 importeert
  // = potentieel cross-DB-lek (V0-code die per ongeluk het V1-prod-project raakt).
  // V1-oppervlak: de auth-laag, de V1-route-group app/v1/**, de admin-wrappers en
  // de v1-namespace zelf. (proxy.ts staat in de repo-root en valt buiten deze
  // lib/+app/-scan; die importeert de V1-middleware bewust.)
  const V1_IMPORT_ALLOWED = (rel: string) =>
    rel === join('lib', 'auth.ts') ||
    rel === join('lib', 'supabase', 'admin.ts') ||
    rel.startsWith(join('lib', 'supabase', 'v1') + sep) ||
    rel.startsWith(join('app', 'v1') + sep);
  const offenders = allFiles()
    .filter((f) => v1Import.test(f.src) && !V1_IMPORT_ALLOWED(f.rel))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `Niet-toegestane import van lib/supabase/v1/*:\n${offenders.join('\n')}`);
});

test('V1-auth-laag importeert niet de V0 service-role-factory', () => {
  const v0Import = /from ['"]@\/lib\/supabase\/service-role['"]/;
  // lib/auth.ts is V1; admin.ts mag wél (getSystemJobClient blijft V0) → uitgezonderd.
  const offenders = allFiles()
    .filter((f) => f.rel === join('lib', 'auth.ts') && v0Import.test(f.src))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V1-auth importeert de V0 service-role-factory:\n${offenders.join('\n')}`);
});

test('lib/rag is neutraal — importeert niets uit lib/v0', () => {
  const v0Import = /from ['"]@\/lib\/v0\//;
  const offenders: string[] = [];
  for (const file of walk(join(repoRoot, 'lib', 'rag'))) {
    const src = readFileSync(file, 'utf8');
    if (v0Import.test(src)) offenders.push(relative(repoRoot, file));
  }
  assert.deepEqual(offenders, [], `lib/rag importeert uit lib/v0 (graduatie-lek):\n${offenders.join('\n')}`);
});

test('lib/rag gebruikt geen service-role-factory direct (client wordt geinjecteerd)', () => {
  const factoryImport = /from ['"]@\/lib\/supabase\/(service-role|v1\/service-role)['"]/;
  const offenders: string[] = [];
  for (const file of walk(join(repoRoot, 'lib', 'rag'))) {
    const src = readFileSync(file, 'utf8');
    if (factoryImport.test(src)) offenders.push(relative(repoRoot, file));
  }
  assert.deepEqual(offenders, [], `lib/rag pakt zelf een client i.p.v. injectie:\n${offenders.join('\n')}`);
});
