# Plan 014: migrate.mjs ledger-hardening + backlog-hygiëne (TD-8 stale-close + 4 dubbele V0-volgnummers)

> **Executor-instructies**: Volg dit plan stap voor stap. Draai elk
> verify-commando en bevestig het verwachte resultaat vóór je verder gaat.
> Gebeurt er iets uit "STOP conditions", stop dan en rapporteer — improviseer
> niet. Als je klaar bent, werk je de statusrij voor plan 014 bij in
> `plans/README.md` (zie Step 6).
>
> **Taal**: commentaar, console-teksten en doc-teksten in het **Nederlands**
> (repo-conventie). Code-identifiers in het Engels waar de omringende code dat
> ook doet.
>
> **Drift check (draai eerst)**:
> ```
> git diff --stat 3437648..HEAD -- scripts/migrate.mjs package.json supabase/migrations supabase/migrations-v1 plans/README.md AGENTS.md
> ```
> **Verwacht**: `scripts/migrate.mjs`, `package.json`, `supabase/migrations`
> en `supabase/migrations-v1` geven **GEEN** output (ongewijzigd sinds de
> plan-SHA). `plans/README.md` en `AGENTS.md` **worden** getoond als gewijzigd
> — dat is **verwacht** (de ronde-2-consolidatie én de ledgernoot-correctie
> `d94c90a` raakten deze twee docs ná de plan-SHA; de "Current
> state"-excerpts hieronder komen uit die gecorrigeerde live-versie).
> **STOP** alleen als `scripts/migrate.mjs`, `package.json` of één van de
> migratie-mappen wél als gewijzigd verschijnt, óf als een excerpt hieronder
> niet meer één-op-één in het live-bestand staat.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (code-hardening + docs; geen schema-wijziging). De enige MED-risico-stap (prod-ledger-audit tegen V1-prod) is **menselijk gated** en valt buiten de executor-scope.
- **Depends on**: none
- **Category**: tech-debt / dx (+ één correctness-detail in de ledger-tooling)
- **Planned at**: commit `3437648`, 2026-07-06
- **⚠️ Menselijke gate**: dit plan bevat één stap die **alléén Sebastiaan** mag doen — het draaien van `npm run migrate:v1:audit` (nieuw) tegen het **V1-prod**-Supabase-project en het eventueel corrigeren van ledger-checksums. De executor bouwt en test de tooling offline, maar draait **geen** enkel `migrate*`-commando tegen een echte database. Zie "STOP conditions" en Step 7.

## Why this matters

De migratie-runner `scripts/migrate.mjs` heeft twee blinde vlekken die precies het scenario konden verbergen dat een handmatige audit later vond: (1) een ledger-rij die is toegepast maar géén lokaal `.sql`-bestand meer heeft, geeft alleen een `console.warn` en een **groene** exit — dus `migrate:status` meldt "alles oké" terwijl er een wees-rij in de ledger zit; en (2) een pre-hardening rij met `checksum == null` wordt stil ge-backfilld met de hash van het **huidige** bestand, zonder enig bewijs dat dat bestand gelijk is aan de SQL die destijds op de database draaide — waarna drift-detectie er nooit meer op kan afgaan. Dit is direct relevant voor de V1-admin-migraties 0017–0020, die out-of-band op V1-prod zijn toegepast en pas later (PR #236) als "getrouwe port" zijn gecommit: als die files ook maar één byte afwijken van de ad-hoc SQL, kan de eerstvolgende `migrate:v1` óf hard blokkeren op DRIFT, óf de divergentie permanent maskeren via backfill. Daarnaast is de backlog-tekst over 0017–0020 op twee plekken **verouderd** (de files bestaan nu wél), en dragen vier V0-migraties een dubbel volgnummer dat de "kies het volgende nummer"-check dubbelzinnig maakt. Na dit plan: wees-rijen en onbewezen backfills zijn zichtbaar (en met één flag fataal), er is een veilig read-only audit-commando voor Sebastiaan, en de docs kloppen weer.

## Achtergrond die je nodig hebt (de executor heeft de audit niet gezien)

- Er zijn **twee** migratie-stromen met **elk een eigen ledger** in hun eigen Supabase-project:
  - **V0**: `supabase/migrations/` → tabel `public._migrations` in het V0-project (`npm run migrate` / `migrate:status`).
  - **V1**: `supabase/migrations-v1/` → tabel `public._migrations` in het **aparte V1-prod-project** (`npm run migrate:v1` / `migrate:v1:status`). Zelfde script (`scripts/migrate.mjs`), geschakeld met de `--v1`-flag.
- De ledger-tabel `public._migrations` heeft kolommen `id text primary key` (= bestandsnaam zonder `.sql`), `applied_at`, en `checksum text` (toegevoegd door een eerdere hardening — plan 009). RLS staat aan zonder policy; de runner draait als owner/service-role en bypasst RLS.
- **TD-8-premisse is STALE.** Een oudere backlog-notitie beweerde dat de V1-admin-migraties `0017`–`0020` "nooit gecommit" waren en gereconstrueerd moesten worden. In deze repo bestaan alle vier files (`0017_v1_admin_overlay.sql`, `0018_v1_admin_config.sql`, `0019_v1_admin_error_groups.sql`, `0020_v1_admin_recap.sql`), volledig en consistent met de admin-code — gecommit door PR #236 (`b9f4d71`), ná het aanmaken van TD-8. **Reconstructie is dus niet nodig**; wat rest is (a) de docs bijwerken en (b) de **prod-ledger** tegen die al-gecommite files verifiëren (alleen Sebastiaan, prod-toegang).
- **De vier dubbele V0-volgnummers zijn functioneel onschadelijk en worden NIET hernummerd.** De ledger sleutelt op de vólledige bestandsnaam (niet op het nummer), de runner past toe in alfabetische volgorde, en binnen elk paar sorteert de `admin_`/`cc_`-file vóór de `v0_`-file en zijn de tabellen onafhankelijk. Hernummeren zou de ledger-id's breken (rijen zijn al op prod toegepast). Het veilige pad is **documenteren**, niet hernummeren.

## Current state

Alle regelnummers hieronder komen uit de **live** worktree (HEAD `d092d54`). De code van `scripts/migrate.mjs` is byte-identiek aan de plan-SHA `3437648`; `plans/README.md` en `AGENTS.md` zijn ná de plan-SHA bijgewerkt en de excerpts hieronder tonen díe live-versie.

### `scripts/migrate.mjs` — de te harden runner

Rol: leest `.sql`-files uit de doelmap, vergelijkt met `public._migrations`, past pending toe, detecteert drift. De relevante blokken:

- **`sha256`-helper + arg-parsing** (`scripts/migrate.mjs:25-47`):
  ```js
  const sha256 = (s) => createHash('sha256').update(s).digest('hex');
  // ...
  const isV1 = process.argv.includes('--v1');
  // ...
  const mode = process.argv[2] === 'status' ? 'status'
    : process.argv[2] === 'bootstrap' ? 'bootstrap' : 'apply';
  ```
- **Classificatie-loop** (`scripts/migrate.mjs:104-119`) — bouwt `drift` + `backfills`; **slaat wees-rijen over met `continue`** zonder ze te verzamelen:
  ```js
  const fileById = new Map(files.map((f) => [f.replace(/\.sql$/, ''), f]));
  const drift = [];      // ids waarvan de inhoud is gewijzigd ná toepassing
  const backfills = [];  // pre-hardening rijen (checksum null) → eenmalig invullen
  for (const row of applied) {
    const file = fileById.get(row.id);
    if (!file) continue; // applied maar geen lokaal bestand — waarschuwing hieronder
    const hash = sha256(readFileSync(join(migrationsDir, file), 'utf8'));
    if (row.checksum == null) {
      // Aanname: een null-checksum-rij ... is toegepast met exact de huidige bestandsinhoud.
      backfills.push({ id: row.id, hash });
    } else if (row.checksum !== hash) {
      drift.push(row.id);
    }
  }
  ```
- **Backfill-schrijfloop** (`scripts/migrate.mjs:121-127`) — schrijft de hash **zonder de aanname te loggen**; draait óók in `status`-mode (dus `migrate:status` is niet read-only):
  ```js
  for (const { id, hash } of backfills) {
    await client.query('update public._migrations set checksum = $2 where id = $1', [id, hash]);
    console.log(`  ~ checksum backfilled: ${id}`);
  }
  ```
- **Wees-rij-waarschuwing** (`scripts/migrate.mjs:129-133`) — **non-fataal, geen exit-code-effect**:
  ```js
  for (const id of appliedIds) {
    if (!fileById.has(id)) {
      console.warn(`  ! applied maar geen lokaal bestand: ${id} (verwijderde migratie?)`);
    }
  }
  ```
- **Drift-fatale blok** (`scripts/migrate.mjs:137-145`) en **status-mode-blok** (`scripts/migrate.mjs:147-168`) — laten met rust; alleen ná deze blokken lezen.

### `package.json` — migrate-scripts (`package.json:56-60`)

```json
"migrate": "node --env-file=.env.local scripts/migrate.mjs",
"migrate:status": "node --env-file=.env.local scripts/migrate.mjs status",
"migrate:bootstrap": "node --env-file=.env.local scripts/migrate.mjs bootstrap",
"migrate:v1": "node --env-file=.env.local scripts/migrate.mjs --v1",
"migrate:v1:status": "node --env-file=.env.local scripts/migrate.mjs status --v1",
```

### De vier dubbele V0-volgnummers (bevestigd via `ls supabase/migrations`)

| Nummer | File A (`admin_`/`cc_`) | File B (`v0_`) |
|--------|-------------------------|----------------|
| 0028 | `0028_cc_assistant_threads.sql` | `0028_v0_org_settings.sql` |
| 0039 | `0039_admin_error_groups.sql` | `0039_v0_source_disabled.sql` |
| 0040 | `0040_admin_error_capture_severity_guard.sql` | `0040_v0_firecrawl_credit_log.sql` |
| 0044 | `0044_admin_quiz.sql` | `0044_v0_query_log_tone_persoonlijk.sql` |

(`0019a`/`0019b` zijn bewuste sub-migraties van `0019`, géén collision — laat met rust.)

### `plans/README.md` — twee te-hygiëniseren plekken

- **Plan-014-statusrij** (de `| 014 |`-rij in de statustabel): staat op `TODO (plan geschreven)`. Werk je bij in Step 6.
- **Backlog-rij TD-8** (de `~~V1-prod-ledger~~`-rij in de Backlog-tabel; zoek op "V1-prod-ledger", niet op regelnummer — de README schuift) — al STALE-gemarkeerd; jij scherpt hem aan naar het nieuwe audit-commando:
  ```
  | ~~V1-prod-ledger heeft migraties 0017-0020 (admin_*) zónder repo-file~~ **STALE (ronde 2)** | tech-debt | — | De 0017-0020-files bestaan nu wél in de repo (PR #236, `b9f4d71`, ná ontdekking); géén reconstructie meer nodig. Rest = prod-ledger tegen die files verifiëren → plan 014 |
  ```

### `AGENTS.md` — ledgernoot is al gecorrigeerd; rest = één aanscherping

**Let op (correctie op de oorspronkelijke brief):** de stale "V1-ledger-gat"-bullet
("springt van 0016 naar 0021") die dit plan aanvankelijk moest corrigeren, is in
commit `d94c90a` (dezelfde PR als dit plan) **al vervangen** door een correcte
versie. De live bullet (`AGENTS.md:97`) luidt nu:
```
- ⚠️ **Dubbele volgnummers bestaan al in V0** (`0028`, `0039`, `0040`, `0044` — parallelle `admin_*`/`v0_*`-branches claimden hetzelfde nummer). De `migrate.mjs`-tracker keyt op de **volledige bestandsnaam**, dus beide files worden los getrackt en toegepast — benign, **niet hernoemen** (al op prod). Kies wél het eerstvolgende vrije nummer verder. De V1-migraties `0017-0020` (admin_*) bestaan wél in de repo (PR #236) — er is geen file-gat, alleen een openstaande prod-ledger-verificatie (zie `plans/014`).
```
Deze bullet dekt zowel de vier dubbele V0-volgnummers als de 0017-0020-status al
correct af. Wat rest voor dit plan (Step 5): de verwijzing "zie `plans/014`"
aanscherpen naar het concrete audit-commando `npm run migrate:v1:audit` zodra dat
bestaat — een plan-bestand kan verdwijnen, het npm-script niet.

### Test-conventie (model voor Step 4)

- Unit-tests staan in een `__tests__/`-map en heten `*.test.ts`; de runner (`scripts/run-unit-tests.mjs`) doorzoekt de roots `lib`, `app`, `scripts`, `tests` en **faalt hard op een `.test.ts` buiten een `__tests__/`-map**. Hij draait ze via `node --import tsx --test`, dus een `.test.ts` mag een `.mjs` importeren. **Geverifieerd (2026-07-08):** er is nog géén precedent van een `.mjs`-import in een testfile — jouw test wordt de eerste. Dat kan: `tsconfig.json` heeft `allowJs: true` en include `**/*.ts`, dus `npm run typecheck` accepteert de import en leest de types uit de JSDoc-annotaties van de helper (schrijf die dus zorgvuldig, zie Step 1). Faalt typecheck tóch op de import, rapporteer het als STOP-conditie — ga niet zelf `.d.ts`-bestanden verzinnen.
- Exemplaar om te kopiëren qua stijl — `lib/ai/__tests__/cost.test.ts`:
  ```js
  import assert from 'node:assert/strict';
  import { test } from 'node:test';
  import { costUsdToEur } from '../llm';

  test('costUsdToEur — guards + rounding + lineariteit', () => {
    assert.equal(costUsdToEur(0), 0);
    // ...
  });
  ```

## Commands you will need

| Doel | Commando | Verwacht bij succes |
|------|----------|---------------------|
| Syntax-check runner | `node --check scripts/migrate.mjs` | exit 0, geen output |
| Syntax-check helper | `node --check scripts/migrate-ledger.mjs` | exit 0, geen output |
| Unit-tests | `npm run test:unit` | exit 0, alle tests pass (incl. je nieuwe) |
| Typecheck | `npm run typecheck` | exit 0, geen errors |
| Build | `npm run build` | exit 0 (**Windows: verwijder eerst `.next/`** — `Remove-Item -Recurse -Force .next` — een vervuilde `.next` na een dev-server crasht de build) |
| Drift-stat | `git diff --stat 3437648..HEAD -- scripts/migrate.mjs package.json` | **geen output** (deze twee ongewijzigd sinds plan-SHA) |

> **Let op**: `npm run typecheck` (`tsc --noEmit`) dekt `scripts/migrate.mjs` en de nieuwe `.mjs`-helper **niet** (het zijn `.mjs`-scripts, niet in het TS-programma). De machine-gates voor die twee files zijn dus `node --check` + de unit-test op de geëxtraheerde pure functie + code-review. Draai **geen** `npm run migrate*` — die verbinden met een echte prod-database (zie STOP conditions).

## Scope

**In scope** (de enige files die je aanmaakt/wijzigt):
- `scripts/migrate-ledger.mjs` — **nieuw**: pure, side-effect-vrije classificatie-helper (testbaar los van de DB).
- `scripts/migrate.mjs` — importeert de helper; wees-rij-zichtbaarheid + `--strict-ledger`-flag + backfill-logging.
- `scripts/__tests__/migrate-ledger.test.ts` — **nieuw**: unit-test op de helper.
- `package.json` — één nieuw script: `migrate:v1:audit` (read-only prod-audit voor Sebastiaan).
- `AGENTS.md` — één aanscherping van de (al gecorrigeerde) ledgernoot: verwijs naar `npm run migrate:v1:audit`.
- `plans/README.md` — TD-8-backlogrij aanscherpen + plan-014-statusrij bijwerken.

**Out of scope** (NIET aanraken, ook al lijken ze gerelateerd):
- **Elk bestand in `supabase/migrations/` of `supabase/migrations-v1/`** — géén hernummeren, géén inhoud wijzigen. De vier dubbele nummers en de 0017-0020-files zijn al op prod toegepast; renamen breekt de ledger-id's en muteren triggert drift op verse DB's.
- **De V1-prod-database en élk `npm run migrate*`-commando** — menselijk gated (Sebastiaan). De executor verifieert alles offline.
- **`~/.claude/skills/check-migration/`** — die skill leeft globaal (buiten deze repo), niet in de worktree. Het idee "laat check-migration op numerieke collisies checken" is een aparte dotfiles-taak; noteer het als deferred (zie Maintenance notes), bouw het hier niet.
- **`lib/v1/admin/*` en de 0017-0020 SQL** — géén reconstructie; de files bestaan en matchen de code (PR #236).
- **De drift-fatale blok (`migrate.mjs:137-145`) en status-mode-blok (`:147-168`)** — laten met rust op de kleine toevoeging in Step 3 na (strict-exit vóór de mode-branch).

## Git workflow

- Branch: `git checkout -b feat/seb/migrate-ledger-hardening` (nooit direct op `main`).
- Commit klein per logische eenheid; conventional-commit-stijl (voorbeeld uit `git log`: `chore(migrate): ...` / `docs(agents): ...`). Meerregelige commit-message op Windows: schrijf naar een tijdelijk bestand en `git commit -F <file>`, of gebruik de PowerShell-tool met een here-string.
- **Direct vóór elke commit**: `git rev-parse --abbrev-ref HEAD` — bevestig dat je op `feat/seb/migrate-ledger-hardening` staat (parallelle sessies kunnen je branch verschuiven).
- Push/PR alleen als de operator daarom vraagt.

## Steps

### Step 1: Maak de pure classificatie-helper `scripts/migrate-ledger.mjs`

Doel: haal de classificatie-logica uit de side-effect-zware runner in een pure, importeerbare functie — zodat een unit-test hem zonder database kan draaien, en zodat wees-rijen (`orphans`) een eersteklas resultaat worden i.p.v. een `continue`.

Maak `scripts/migrate-ledger.mjs` met exact deze vorm (eigen private `sha256` — bewust géén import uit `migrate.mjs`, om de edit-oppervlakte op het prod-kritieke script klein te houden):

```js
// Pure ledger-classificatie voor scripts/migrate.mjs — GEEN side effects (geen
// DB, geen process.exit), zodat scripts/__tests__/migrate-ledger.test.ts dit
// zonder database kan verifiëren. De runner zelf blijft de I/O + exit-codes doen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * Deel reeds-toegepaste ledger-rijen in tegen de lokale migratiebestanden.
 * @param {{id: string, checksum: string|null}[]} applied  rijen uit public._migrations
 * @param {Map<string,string>} fileById  id → bestandsnaam (alleen bestaande files)
 * @param {string} migrationsDir  absolute map met de .sql-files
 * @param {(path: string) => string} [readFile]  injecteerbaar voor tests
 * @returns {{ drift: string[], backfills: {id:string, hash:string}[], orphans: string[] }}
 *   drift    = checksum wijkt af van de huidige file (migratie ná toepassing bewerkt)
 *   backfills= rij met checksum == null én een lokaal bestand (te stampen hash)
 *   orphans  = rij ZONDER lokaal bestand (verwijderde of out-of-band migratie)
 */
export function classifyLedger(
  applied,
  fileById,
  migrationsDir,
  readFile = (p) => readFileSync(p, 'utf8'),
) {
  const drift = [];
  const backfills = [];
  const orphans = [];
  for (const row of applied) {
    const file = fileById.get(row.id);
    if (!file) {
      orphans.push(row.id);
      continue;
    }
    const hash = sha256(readFile(join(migrationsDir, file)));
    if (row.checksum == null) backfills.push({ id: row.id, hash });
    else if (row.checksum !== hash) drift.push(row.id);
  }
  return { drift, backfills, orphans };
}
```

**Verify**: `node --check scripts/migrate-ledger.mjs` → exit 0, geen output.

### Step 2: Laat `scripts/migrate.mjs` de helper gebruiken en wees-rijen zichtbaar maken

1. Voeg bovenaan (bij de imports, na regel `import pg from 'pg';`) toe:
   ```js
   import { classifyLedger } from './migrate-ledger.mjs';
   ```
   Laat de bestaande lokale `const sha256 = ...` (regel 26) en `createHash`-import (regel 22) **staan** — `migrate.mjs` gebruikt `sha256` nog bij bootstrap (`:181`) en apply (`:206`). (De 1-regel-duplicatie met de helper is een bewuste trade-off: kleinere edit op het prod-kritieke script.)

2. Voeg bij de arg-parsing (vlak ná `const isV1 = ...`, rond regel 32) een flag toe:
   ```js
   // Opt-in strenge ledger-audit: maakt wees-rijen + niet-geverifieerde
   // null-checksum-backfills FATAAL (exit 1) en onderdrukt de auto-backfill —
   // zodat een operator de ledger read-only tegen prod kan controleren.
   const strictLedger = process.argv.includes('--strict-ledger');
   ```

3. Vervang de classificatie-loop **`scripts/migrate.mjs:104-119`** (de `const fileById = ...` t/m de sluitende `}` van de `for`-loop) door:
   ```js
   const fileById = new Map(files.map((f) => [f.replace(/\.sql$/, ''), f]));
   const { drift, backfills, orphans } = classifyLedger(applied, fileById, migrationsDir);
   ```

4. Vervang de wees-rij-waarschuwing **`scripts/migrate.mjs:129-133`** (de `for (const id of appliedIds) { ... }`-loop) door een expliciete, getelde sectie:
   ```js
   // Wees-rijen: toegepast in de ledger maar zonder lokaal bestand. Nu een
   // getelde, zichtbare sectie (voorheen een enkele non-fatale console.warn).
   if (orphans.length > 0) {
     console.warn(`\n! ${orphans.length} ledger-rij(en) toegepast ZONDER lokaal bestand:`);
     for (const id of orphans) {
       console.warn(`  ! ${id} (verwijderde migratie, of out-of-band toegepast?)`);
     }
   }
   ```

5. **Strict-guard (fail-closed, read-only)** — voeg dit blok toe **direct ná** de wees-rij-sectie uit stap 4 en **vóór** de bestaande backfill-schrijfloop (de huidige `:121-127`):
   ```js
   // In strict-mode: schrijf NIETS. Rapporteer wees-rijen + onbewezen
   // null-checksum-rijen en stop met exit 1. Dit maakt `migrate:v1:audit` een
   // veilige, read-only controle die géén checksums stampt.
   if (strictLedger && (orphans.length > 0 || backfills.length > 0)) {
     console.error('\n✗ STRICT-LEDGER: ledger is niet clean — niets geschreven, niets toegepast.');
     if (orphans.length > 0) {
       console.error(`  ${orphans.length} rij(en) zonder lokaal bestand (zie hierboven).`);
     }
     if (backfills.length > 0) {
       console.error(`  ${backfills.length} rij(en) met NULL-checksum — NIET automatisch gebackfilld in strict-mode:`);
       for (const { id, hash } of backfills) {
         console.error(`    ? ${id} → zou stampen met ${hash.slice(0, 12)}… (verifieer eerst dat de file == de destijds toegepaste SQL)`);
       }
     }
     await client.end();
     process.exit(1);
   }
   ```

6. **Backfill-logging** — vervang de bestaande backfill-schrijfloop (`:121-127`) door dezelfde loop met een expliciete aanname-log:
   ```js
   for (const { id, hash } of backfills) {
     await client.query(
       'update public._migrations set checksum = $2 where id = $1',
       [id, hash],
     );
     console.log(`  ~ checksum backfilled: ${id} → ${hash.slice(0, 12)}… (AANNAME: lokaal bestand == destijds toegepaste SQL; niet geverifieerd)`);
   }
   ```

> **Volgorde-let-op**: het eindresultaat is, in deze volgorde: (1) classificatie via helper, (2) wees-rij-sectie, (3) strict-guard met exit, (4) backfill-schrijfloop, (5) de ongewijzigde drift-fatale blok en mode-branches. Verplaats de drift-blokken niet.

**Verify**:
- `node --check scripts/migrate.mjs` → exit 0, geen output.
- `git grep -n "classifyLedger" scripts/migrate.mjs` → toont de import + het gebruik (2 regels).
- `git grep -n "strict-ledger\|STRICT-LEDGER" scripts/migrate.mjs` → toont de flag-parse + de guard.

### Step 3: Voeg het read-only prod-audit-script toe aan `package.json`

Voeg vlak ná de regel `"migrate:v1:status": ...` (`package.json:60`) toe:
```json
"migrate:v1:audit": "node --env-file=.env.local scripts/migrate.mjs status --v1 --strict-ledger",
```
Dit is het commando dat **Sebastiaan** in Step 7 tegen V1-prod draait: strict + status = leest de ledger, rapporteert wees-rijen/onbewezen checksums, schrijft niets.

**Verify**:
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo JSON-OK` → print `JSON-OK` (geldige JSON, geen komma-fout).
- `git grep -n "migrate:v1:audit" package.json` → toont de nieuwe regel.

### Step 4: Schrijf de unit-test `scripts/__tests__/migrate-ledger.test.ts`

Maak de map `scripts/__tests__/` en het bestand. Model qua stijl: `lib/ai/__tests__/cost.test.ts`. Dek de vier gevallen die de blinde vlek beschrijven; injecteer een fake `readFile` zodat er geen echte files nodig zijn:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyLedger } from '../migrate-ledger.mjs';

// sha256('SQL-A') vooraf niet nodig: we sturen de file-inhoud via een fake
// readFile en vergelijken tegen de checksum die classifyLedger zelf berekent.
// We bepalen de verwachte hash door de helper eerst op een backfill-case te
// draaien (checksum null → hash in de output).
const dir = '/fake/migrations';
const fileById = new Map([
  ['0001_a', '0001_a.sql'],
  ['0002_b', '0002_b.sql'],
]);
const readFile = (p: string) =>
  p.endsWith('0001_a.sql') ? 'SQL-A' : p.endsWith('0002_b.sql') ? 'SQL-B' : '';

test('classifyLedger — wees-rij zonder lokaal bestand belandt in orphans', () => {
  const { drift, backfills, orphans } = classifyLedger(
    [{ id: '9999_weg', checksum: 'wat-dan-ook' }],
    fileById,
    dir,
    readFile,
  );
  assert.deepEqual(orphans, ['9999_weg']);
  assert.deepEqual(drift, []);
  assert.deepEqual(backfills, []);
});

test('classifyLedger — null-checksum met bestand → backfill met file-hash', () => {
  const { backfills, drift, orphans } = classifyLedger(
    [{ id: '0001_a', checksum: null }],
    fileById,
    dir,
    readFile,
  );
  assert.equal(backfills.length, 1);
  assert.equal(backfills[0].id, '0001_a');
  assert.match(backfills[0].hash, /^[0-9a-f]{64}$/); // sha256-hex
  assert.deepEqual(drift, []);
  assert.deepEqual(orphans, []);
});

test('classifyLedger — checksum wijkt af van file → drift', () => {
  const { drift } = classifyLedger(
    [{ id: '0001_a', checksum: 'deadbeef-past-niet' }],
    fileById,
    dir,
    readFile,
  );
  assert.deepEqual(drift, ['0001_a']);
});

test('classifyLedger — matchende checksum → schoon (geen drift/backfill/orphan)', () => {
  // Bepaal de correcte hash via de backfill-tak, gebruik hem als "opgeslagen".
  const { backfills } = classifyLedger(
    [{ id: '0002_b', checksum: null }],
    fileById,
    dir,
    readFile,
  );
  const goodHash = backfills[0].hash;
  const res = classifyLedger(
    [{ id: '0002_b', checksum: goodHash }],
    fileById,
    dir,
    readFile,
  );
  assert.deepEqual(res.drift, []);
  assert.deepEqual(res.backfills, []);
  assert.deepEqual(res.orphans, []);
});
```

**Verify**: `npm run test:unit` → exit 0; de output noemt `migrate-ledger.test.ts` en alle 4 tests slagen. (Ziet de runner het bestand niet, dan staat het niet onder een `__tests__/`-map — corrigeer het pad.)

### Step 5: Scherp de AGENTS.md-ledgernoot aan naar het audit-commando

De stale correcties uit de oorspronkelijke brief zijn **al gedaan** (commit
`d94c90a` — zie Current state): de "V1-ledger-gat"-bullet is vervangen en de vier
dubbele V0-volgnummers staan al gedocumenteerd. Wat jij nog doet is één gerichte
aanscherping:

1. **Vervang** in de live bullet (`AGENTS.md:97`) het slot
   `alleen een openstaande prod-ledger-verificatie (zie \`plans/014\`)` door
   `alleen een openstaande prod-ledger-verificatie — audit read-only met \`npm run migrate:v1:audit\``
   (het npm-script uit Step 3 is duurzamer dan een plan-bestandsverwijzing).
2. **Controleer** (niets wijzigen): de stale zin is écht weg en de
   dubbele-nummers-documentatie staat er.

**Verify**:
- `git grep -n "springt van 0016 naar 0021" AGENTS.md` → **geen** match.
- `git grep -n "Dubbele volgnummers bestaan al in V0" AGENTS.md` → 1 match (bestaande documentatie intact).
- `git grep -n "migrate:v1:audit" AGENTS.md` → 1 match (de aanscherping).

### Step 6: Werk `plans/README.md` bij (backlog-hygiëne + statusrij)

1. **Backlog-rij TD-8** (zoek op "V1-prod-ledger" in de Backlog-tabel) — scherp de "Rest ="-tekst aan naar het concrete audit-commando:
   ```
   | ~~V1-prod-ledger heeft migraties 0017-0020 (admin_*) zónder repo-file~~ **STALE (ronde 2)** | tech-debt | — | Files bestaan sinds PR #236 (`b9f4d71`); géén reconstructie. Code-hardening geland (plan 014). Rest = **prod-ledger read-only auditen** met `npm run migrate:v1:audit` — openstaande Sebastiaan-stap (prod-toegang). |
   ```
2. **Plan-014-statusrij** (de `| 014 |`-rij in de statustabel) — vervang `TODO (plan geschreven)` door:
   ```
   DONE (tooling+docs); prod-ledger-audit = openstaande Sebastiaan-stap (menselijke gate)
   ```

**Verify**: `git grep -n "migrate:v1:audit" plans/README.md` → toont beide bijgewerkte regels.

### Step 7: Documenteer de menselijke prod-audit-stap (NIET zelf uitvoeren)

De executor draait dit **niet** — het raakt de echte V1-prod-database. Laat deze runbook staan in het plan als overdracht aan Sebastiaan. Bevestig alleen dat je hem hebt gelezen en dat je géén `migrate*`-commando hebt gedraaid.

**Runbook voor Sebastiaan (menselijke gate):**
1. Draai read-only: `npm run migrate:v1:audit` (= `status --v1 --strict-ledger`). Dit **schrijft niets** — het rapporteert alleen.
2. Beoordeel de output:
   - **Geen wees-rijen, geen NULL-checksum-rijen, exit 0** → de V1-ledger is clean en de 0017-0020-checksums matchen de repo-files. Klaar: markeer de backlog-rij als volledig gesloten.
   - **`? 0017…/0018…/0019…/0020…` met NULL-checksum** → deze rijen zijn vóór de checksum-hardening toegepast. **Backfill ze NIET blind.** Verifieer eerst dat de repo-file gelijk is aan wat op prod draait (schema-diff via de Supabase MCP `list_tables`/`execute_sql`, of vergelijk de DDL). Klopt het: laat de gewone `npm run migrate:v1` de backfill doen (die logt nu de te-stampen hash). Klopt het niet: los de divergentie op als **nieuwe** migratie — muteer de bestaande file niet.
   - **`!! DRIFT` op 0017-0020** → de file wijkt af van de opgeslagen checksum. Reconcilieer expliciet (schema-diff), corrigeer de ledger-checksum handmatig i.p.v. de file te muteren, en documenteer waarom.
3. Leg de uitkomst vast (in de PR of de backlog-rij) en sluit TD-8 pas als de audit clean is.

**Verify (executor)**: `git grep -rn "migrate:v1" scripts/*.log 2>/dev/null; echo done` → print `done` en géén bewijs dat je het commando draaide. (Sanity: je hebt in deze sessie geen `npm run migrate*` uitgevoerd.)

## Test plan

- **Nieuwe test**: `scripts/__tests__/migrate-ledger.test.ts` (Step 4) — 4 cases op `classifyLedger`: orphan (wees-rij), null-checksum-backfill, drift, en schoon. Model: `lib/ai/__tests__/cost.test.ts`.
- **Bestaande tests**: mogen niet regresseren — `npm run test:unit` draait álle `__tests__/*.test.ts` in twee passes.
- **Verificatie**: `npm run test:unit` → exit 0, alle tests pass inclusief de 4 nieuwe. `node --check scripts/migrate.mjs` en `node --check scripts/migrate-ledger.mjs` → beide exit 0.
- **Handmatige review** (geen automatische test mogelijk voor de I/O-glue in `migrate.mjs`): lees de gewijzigde `migrate.mjs` en bevestig de volgorde classificatie → wees-rij-sectie → strict-guard(exit) → backfill-loop → ongewijzigde drift-blokken.

## Done criteria

Machine-checkbaar. ALLE moeten kloppen:

- [ ] `node --check scripts/migrate.mjs` exit 0
- [ ] `node --check scripts/migrate-ledger.mjs` exit 0
- [ ] `npm run test:unit` exit 0; `scripts/__tests__/migrate-ledger.test.ts` bestaat en de 4 tests slagen
- [ ] `npm run typecheck` exit 0 (dekt de nieuwe `.test.ts`)
- [ ] `npm run build` exit 0 (Windows: eerst `.next/` verwijderen)
- [ ] `git grep -n "springt van 0016 naar 0021" AGENTS.md` geeft **geen** match
- [ ] `git grep -n "migrate:v1:audit" AGENTS.md` geeft een match (aangescherpte ledgernoot)
- [ ] `git grep -n "migrate:v1:audit" package.json plans/README.md` toont het nieuwe script + de twee bijgewerkte README-regels
- [ ] `git diff --stat 3437648..HEAD -- supabase/migrations supabase/migrations-v1` toont **geen** wijziging aan migratiebestanden (niets hernummerd)
- [ ] Geen files buiten de in-scope lijst gewijzigd (`git status`)
- [ ] `plans/README.md` plan-014-statusrij bijgewerkt (Step 6)

## STOP conditions

Stop en rapporteer (improviseer niet) als:

- De drift-check toont `scripts/migrate.mjs`, `package.json` of een migratiebestand als gewijzigd sinds `3437648`, óf een "Current state"-excerpt staat niet meer één-op-één in het live-bestand (de codebase is verder gedreven dan dit plan aanneemt).
- Je merkt dat de fix een out-of-scope-bestand vereist (bv. een migratie-SQL-file, `lib/v1/admin/*`, of de globale check-migration-skill).
- `npm run test:unit`, `npm run typecheck` of `npm run build` faalt twee keer na een redelijke fixpoging.
- Je zou een `npm run migrate*`-commando moeten draaien om iets te verifiëren. **Doe dat niet** — die verbinden met een echte prod-database en (zonder `--strict-ledger`) backfillen ze checksums als side effect. De prod-ledger-audit (Step 7) is een **menselijke gate**: alleen Sebastiaan draait `npm run migrate:v1:audit`. Rapporteer dat de code klaar is en dat de prod-audit op Sebastiaan wacht.
- De aanname "de vier dubbele V0-nummers zijn al op prod toegepast en mogen niet hernummerd worden" blijkt onjuist (bv. iemand vraagt tóch om hernummeren) — dat is een datamodel-beslissing, leg voor.

## Maintenance notes

Voor wie deze code na de wijziging bezit:

- **De strict-guard is fail-closed maar opt-in.** Standaardgedrag van `migrate`/`migrate:status`/`migrate:v1` blijft byte-voor-byte gelijk (wees-rijen zijn nu zichtbaarder, maar niet-fataal; backfill logt nu de aanname). Alleen de nieuwe `--strict-ledger` maakt wees-rijen + onbewezen backfills fataal. Overweeg strict later in CI te hangen zodra de prod-ledgers eenmalig schoon geauditeerd zijn.
- **Deferred (bewust buiten dit plan)**: de globale `~/.claude/skills/check-migration/`-skill checkt op "hoogste nummer", niet op numerieke collisie. Hem laten waarschuwen bij een dubbel nummer is een aparte dotfiles-taak (de skill leeft niet in deze repo). De vier bekende duplicaten zijn nu in `AGENTS.md` gedocumenteerd zodat een mens ze niet opnieuw claimt.
- **Reviewer, let op**: (1) de volgorde in `migrate.mjs` — strict-guard moet vóór de backfill-schrijfloop staan, anders schrijft strict-mode alsnog; (2) dat de 1-regel `sha256`-duplicatie tussen `migrate.mjs` en `migrate-ledger.mjs` bewust is (kleinere edit op prod-kritiek script); (3) dat géén migratiebestand hernummerd/gewijzigd is.
- **Follow-up dat op Sebastiaan wacht**: de daadwerkelijke prod-ledger-audit (Step 7). Sluit de TD-8-backlogrij pas volledig als `migrate:v1:audit` tegen V1-prod clean is.
- **Interactie met toekomstige migraties**: zodra een nieuwe V1-migratie wordt toegepast via `migrate:v1`, backfillt die run automatisch eventuele resterende NULL-checksum-rijen (0017-0020) met de file-hash — draai dáárom de read-only `migrate:v1:audit` eerst, vóór de eerstvolgende echte `migrate:v1`, anders wordt een eventuele divergentie stil weggeschreven.
