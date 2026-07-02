# Plan 001: Laat álle unit-tests draaien (glob-runner) + één `verify`-commando

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- package.json tests/ scripts/dev/ lib/rag/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (dit plan ontgrendelt 005 en 007)
- **Category**: tests
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

`test:unit` in `package.json` is een **handmatig opgesomde lijst van 21 files**. Acht bestaande unit-tests staan daar niet in en draaien dus nergens — niet lokaal, niet in CI. Daaronder: de SSRF-crawlerguard-test, de widget-origin-allowlist-test en de embed-token-HMAC-test (allemaal security-vangrails). Elke nieuwe test die iemand toevoegt is dood totdat de package.json-string handmatig wordt bijgewerkt. Zes van de acht wezen staan bovendien onder `tests/` — Playwright's `testDir` — waar de default `testMatch` ze als spec opraapt terwijl het node:test-files zijn. Dit plan vervangt de lijst door een runner die `__tests__`-files automatisch vindt, verhuist de wezen naar hun modules, en voegt een `verify`-aggregaatscript toe.

## Current state

- `package.json:12` — `"test:unit": "node --import tsx --test lib/observability/__tests__/fingerprint.test.ts ... lib/v1/limits/__tests__/usage-limits.test.ts"` (21 files letterlijk opgesomd).
- `.github/workflows/build.yml:41-42` — CI draait `npm run test:unit`; alles buiten de lijst gate't dus geen merge. (De workflow draait bewust geen lint — zie backlog; lint heeft momenteel 36 pre-existing errors, dus lint hoort NIET in dit plan.)
- `playwright.config.ts:26` — `testDir: './tests'`; het chromium-project heeft géén `testMatch`-beperking, dus `tests/**/*.test.ts` wordt door Playwright opgeraapt.
- De 8 wees-tests (geverifieerd 2026-07-02) en hun imports:

| Wees | Importeert uit | Doel-locatie |
|---|---|---|
| `lib/rag/__tests__/rag-config-type.test.ts` | (staat al goed) | blijft — wordt door runner opgepikt |
| `scripts/dev/embed-token.test.ts` | `../../lib/v0/server/embed-token` | `lib/v0/server/__tests__/embed-token.test.ts` |
| `tests/v0/crawl-ssrf.test.ts` | `../../lib/v0/crawler/validateCrawlUrl` | `lib/v0/crawler/__tests__/crawl-ssrf.test.ts` |
| `tests/v0/history-entities.test.ts` | `../../lib/rag/history-entities` | `lib/rag/__tests__/history-entities.test.ts` |
| `tests/v0/source-links.test.ts` | `../../lib/rag/source-links` | `lib/rag/__tests__/source-links.test.ts` |
| `tests/v0/style.test.ts` | `../../lib/rag/style` | `lib/rag/__tests__/style.test.ts` |
| `tests/widget/origin-allowlist.test.ts` | `../../lib/widget/origin-allowlist` | `lib/widget/__tests__/origin-allowlist.test.ts` |
| `tests/widget/render-markdown-lite.test.tsx` | react-dom/server + (lees de imports) | `lib/widget/__tests__/render-markdown-lite.test.tsx` |

- Conventie: bestaande colocated tests (bv. `lib/rag/__tests__/ingest-chunker.test.ts`) importeren hun module relatief als `../<module>`. Match dat na de verhuizing.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Unit-tests| `npm run test:unit` | alle groen, ≥29 testfiles |
| E2E-collectie-check | `npx playwright test --list` | geen node:test-files meer in de lijst |

## Scope

**In scope**:
- `package.json` (scripts `test:unit` + nieuw `verify`)
- Nieuw: `scripts/run-unit-tests.mjs`
- De 7 te verhuizen testfiles (git mv + import-paden)

**Out of scope** (NIET aanraken):
- `.github/workflows/build.yml` — die roept `npm run test:unit` aan en profiteert automatisch
- `playwright.config.ts` en alle `*.spec.ts` e2e-tests
- Lint-configuratie of het opruimen van de 36 bestaande lint-errors (aparte backlog)
- Productiecode — behalve als een ontwaakte test een echte bug blootlegt: dan STOP + rapporteren, niet zelf fixen

## Git workflow

- Branch: `git checkout -b feat/seb/unit-test-runner`
- Commits per logische stap; stijl: `test(runner): glob-runner voor __tests__ + verhuis 7 wees-tests`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Maak de runner

Nieuw bestand `scripts/run-unit-tests.mjs` (stdlib-only; `fs.readdirSync(..., { recursive: true })` vereist Node ≥20.1 — CI draait Node 22):

```js
// Draait alle unit-tests: elk bestand onder een __tests__-map in lib/ of app/
// dat op .test.ts of .test.tsx eindigt. Vervangt de handmatige filelijst die
// wees-tests stil liet vallen. Faalt óók als er een .test.-file BUITEN een
// __tests__-map wordt gevonden (nieuwe wezen voorkomen).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOTS = ['lib', 'app'];
const STRAY_ROOTS = ['scripts', 'tests'];
const isTest = (p) => /\.test\.(ts|tsx)$/.test(p);
const inTestsDir = (p) => /(^|[\\/])__tests__[\\/]/.test(p);

const files = [];
for (const root of ROOTS) {
  for (const f of readdirSync(root, { recursive: true })) {
    const p = `${root}/${String(f).replaceAll('\\', '/')}`;
    if (isTest(p) && inTestsDir(p)) files.push(p);
  }
}
const strays = [];
for (const root of [...ROOTS, ...STRAY_ROOTS]) {
  for (const f of readdirSync(root, { recursive: true })) {
    const p = `${root}/${String(f).replaceAll('\\', '/')}`;
    if (isTest(p) && !inTestsDir(p)) strays.push(p);
  }
}
if (strays.length) {
  console.error('Unit-testfiles buiten een __tests__-map (worden NIET gedraaid):');
  for (const s of strays) console.error(`  - ${s}`);
  process.exit(1);
}
console.log(`Running ${files.length} test files...`);
const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files.sort()], { stdio: 'inherit' });
process.exit(r.status ?? 1);
```

**Verify**: `node scripts/run-unit-tests.mjs` → faalt nu met de 7 strays in de lijst (dat is de bedoeling — de guard werkt).

### Step 2: Verhuis de 7 wezen

`git mv` elk bestand naar zijn doel-locatie uit de tabel hierboven en werk de relatieve imports bij naar `../<module>` (zelfde stijl als `lib/rag/__tests__/ingest-chunker.test.ts`). Voor `render-markdown-lite.test.tsx`: lees eerst de volledige imports en verhuis naar de map naast de module die hij test (verwacht `lib/widget/`); pas de paden dienovereenkomstig aan. Update in `scripts/dev/embed-token.test.ts` ook de header-comment die het oude handmatige run-commando documenteert.

**Verify**: `node scripts/run-unit-tests.mjs` → geen strays meer; runner start de suite.

### Step 3: Laat de ontwaakte tests slagen

Deze 8 tests hebben mogelijk maanden niet gedraaid. Draai de suite en triageer failures per file:
- Faalt door **drift in de test zelf** (hernoemde export, gewijzigde signature): pas de test minimaal aan zodat hij het huidige, correcte gedrag asserteert.
- Faalt door een **echte bug in productiecode**: STOP, rapporteer welke test + welk gedrag.
- Faalt met een `server-only`-importfout: voeg `'--conditions=react-server'` toe aan de spawnSync-args in de runner en draai de héle suite opnieuw; breekt er dan iets anders → STOP.

**Verify**: `node scripts/run-unit-tests.mjs` → exit 0, ≥29 files, alle tests pass.

### Step 4: Wire package.json

Vervang in `package.json` de `test:unit`-regel door `"test:unit": "node scripts/run-unit-tests.mjs"` en voeg toe: `"verify": "npm run typecheck && npm run test:unit"`.

**Verify**: `npm run verify` → exit 0.

### Step 5: Playwright-collectie check

**Verify**: `npx playwright test --list 2>&1 | grep -c "\.test\."` → 0 (alleen `*.spec.ts` blijft onder `tests/`); de mappen `tests/v0`/`tests/widget` bevatten geen `.test.`-files meer.

## Test plan

Dit plan ís testinfrastructuur. Bewijs: (a) de runner draait ≥29 files (was 21); (b) de stray-guard faalt aantoonbaar als je tijdelijk een `foo.test.ts` in `lib/` (buiten `__tests__`) zet — probeer dat één keer en ruim 'm weer op; (c) `npm run verify` is de nieuwe één-commando-baseline.

## Done criteria

- [ ] `npm run test:unit` draait ≥29 testfiles, exit 0
- [ ] `git grep -c "node --import tsx --test lib/" package.json` → 0 (geen handmatige lijst meer)
- [ ] Geen `.test.`-files meer onder `tests/`, `scripts/dev/`
- [ ] `npm run verify` bestaat en exit 0
- [ ] `npx playwright test --list` raapt geen node:test-files meer op
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- Een ontwaakte test legt een echte productiecode-bug bloot (vooral: crawl-ssrf, origin-allowlist, embed-token) — rapporteer de bug; die krijgt zijn eigen fix-traject.
- De `--conditions=react-server`-toevoeging laat eerder-groene tests falen.
- `readdirSync(..., {recursive: true})` blijkt niet beschikbaar (Node < 20.1 lokaal) — rapporteer de Node-versie i.p.v. een glob-dependency toe te voegen.

## Maintenance notes

- Nieuwe unit-tests: altijd in een `__tests__`-map onder `lib/` of `app/` — de runner vindt ze vanzelf; daarbuiten faalt de suite luid (bewust).
- Als lint-schuld (36 errors) ooit is opgeruimd: voeg `npm run lint` toe aan `verify` én als CI-stap — dat is de tweede helft van audit-bevinding tests-05.
- Plannen 005 en 007 voegen nieuwe testfiles toe en rekenen op deze runner.
