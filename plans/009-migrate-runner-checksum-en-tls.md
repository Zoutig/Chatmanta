# Plan 009: Migratie-runner hardening — checksum-drift-detectie + TLS-certvalidatie

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- scripts/migrate.mjs`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (raakt de tool die DDL op prod draait; wijzigingen zijn additief en fail-loud)
- **Depends on**: none
- **Category**: tech-debt / security
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

Twee geverifieerde gaten in `scripts/migrate.mjs` (de eigen runner die DDL op V0- én V1-prod uitvoert):
1. **Geen drift-detectie.** De `_migrations`-ledger slaat alleen de bestandsnaam op. Wie een al-toegepaste migratie achteraf bewerkt (klassieke fout — en ledger-drift is in dit project al eens echt misgegaan, zie de 0048-episode), krijgt géén waarschuwing: de bestaande DB draait de wijziging nooit, een verse DB wél → stille schema-divergentie.
2. **`ssl: { rejectUnauthorized: false }`** op de prod-connectie (regel 61): certificaatvalidatie staat volledig uit voor de verbinding die het DB-wachtwoord draagt en DDL injecteerbaar maakt bij een MITM/DNS-spoof. Lage kans, hoge impact.

## Current state

- `scripts/migrate.mjs:57-62` (geverifieerd):

```js
const client = new pg.Client({
  connectionString: url,
  // Supabase pooled connection requires SSL but cert is signed by their CA;
  // rejectUnauthorized false is safe here (we know we're talking to Supabase).
  ssl: { rejectUnauthorized: false },
});
```

- `scripts/migrate.mjs:76-82` — tracking-DDL: `create table if not exists public._migrations (id text primary key, applied_at timestamptz ...)` — geen checksum-kolom.
- `scripts/migrate.mjs:84-88` — `pending` = files waarvan `id` (bestandsnaam zonder `.sql`) niet in `appliedIds` zit; puur naam-gebaseerd.
- `scripts/migrate.mjs:130-142` — apply-loop: `begin` → sql → `insert into public._migrations(id)` → `commit` (transactie-wrapping is al correct; alleen content-tracking ontbreekt).
- De runner bedient beide projecten: `npm run migrate` (V0, `DATABASE_URL`) en `npm run migrate:v1` (V1, `V1_DATABASE_URL`); beide ledgers krijgen dus dezelfde hardening.
- ⚠️ Bekende omgevingsbeperking: vanaf deze dev-machine time-out de Supabase-pooler soms (memory: "npm run migrate bereikt prod niet vanaf dev-machine"). Verificatie tegen de echte DB kan dus falen om netwerkredenen — zie STOP.

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Syntax    | `node --check scripts/migrate.mjs` | exit 0     |
| Status V0 | `npm run migrate:status`   | statuslijst, geen drift-meldingen (als pooler bereikbaar) |
| Status V1 | `npm run migrate:v1:status`| idem                |

## Scope

**In scope**:
- `scripts/migrate.mjs` (enige codebestand)

**Out of scope**:
- De migratie-SQL-bestanden zelf — NOOIT bestaande migraties bewerken
- `supabase/migrations*`-mappen
- De MCP-noodroute / andere tooling

## Git workflow

- Branch: `git checkout -b feat/seb/migrate-hardening`
- Commits: `feat(migrate): sha256-checksum in _migrations + fail-loud drift-detectie` en `fix(migrate): TLS-certvalidatie via MIGRATE_SSL_CA (fallback met warning)`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Checksum-kolom + backfill

Breid de tracking-DDL (regel 76-82) uit met, ná het `create table if not exists`-blok:

```js
await client.query(`
  alter table public._migrations add column if not exists checksum text;
`);
```

Voeg een sha256-helper toe (`import { createHash } from 'node:crypto'`): `const sha256 = (s) => createHash('sha256').update(s).digest('hex');`

**Verify**: `node --check scripts/migrate.mjs` exit 0.

### Step 2: Drift-detectie vóór elke mode

Na het ophalen van `applied` (breid de select uit naar `select id, checksum from ...`): vergelijk voor elk applied id waarvoor een lokaal bestand bestaat de checksum:
- rij-checksum `null` (pre-hardening rijen): backfill met de huidige file-hash + log één regel `~ checksum backfilled: <id>` (aanname: het huidige bestand is wat destijds is toegepast — documenteer dat in een comment).
- rij-checksum aanwezig maar ≠ file-hash → **fail-loud**: print alle afwijkende ids met de melding dat een reeds-toegepaste migratie is bewerkt (fix: wijziging terugdraaien of als nieuwe migratie toevoegen) en `process.exit(1)` — óók in `status`-mode (daar als `!! DRIFT`-markering per rij, exit 1 aan het einde).
- applied id zónder lokaal bestand → waarschuwing (verwijderde migratie), geen harde fail.

**Verify**: `node --check scripts/migrate.mjs` exit 0. Gedragstest zonder DB: zie Test plan.

### Step 3: Checksum meeschrijven bij apply

In de apply-loop (regel ~137-140): `insert into public._migrations(id, checksum) values ($1, $2)` met de file-hash. Idem in `bootstrap`-mode (regel ~111-114).

**Verify**: `node --check scripts/migrate.mjs` exit 0.

### Step 4: TLS-certvalidatie

Vervang het ssl-blok (regel 57-62) door:

```js
// TLS: met MIGRATE_SSL_CA (pad naar het Supabase CA-certificaat, te downloaden
// via Dashboard → Project Settings → Database → SSL) valideren we het server-
// certificaat. Zonder CA vallen we terug op het oude gedrag, met een luide
// waarschuwing — de runner mag ops niet blokkeren tot de CA is ingericht.
const caPath = process.env.MIGRATE_SSL_CA;
const ssl = caPath
  ? { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };
if (!caPath) {
  console.warn('⚠ MIGRATE_SSL_CA niet gezet — TLS-certvalidatie staat UIT (zie plan 009).');
}
const client = new pg.Client({ connectionString: url, ssl });
```

Documenteer `MIGRATE_SSL_CA` ook in `.env.local.example` (één regel bij de DATABASE_URL-sectie).

**Verify**: `node --check scripts/migrate.mjs` exit 0; `npm run migrate:status` zonder CA toont de waarschuwing en werkt verder als voorheen (mits pooler bereikbaar).

### Step 5: End-to-end-bewijs (alleen als de DB bereikbaar is)

1. `npm run migrate:status` → alle rijen `✓ applied`, eerste run logt de checksum-backfills, exit 0.
2. Drift-simulatie ZONDER echte migratie aan te raken: maak tijdelijk `supabase/migrations/zzz_drift_test.sql` aan? — NEE (vervuilt pending). Doe het lokaal: kopieer een applied file naar een temp-map, wijzig de runner-invocatie niet; in plaats daarvan: wijzig tijdelijk één spatie in de JOUW NIEUWSTE al-applied migratie, run `migrate:status` → verwacht `!! DRIFT` + exit 1, en **maak de wijziging direct ongedaan** (`git checkout -- <file>`). Run status opnieuw → schoon.

**Verify**: beide uitkomsten zoals beschreven; `git status` toont geen restwijziging in supabase/migrations.

## Test plan

De runner heeft geen unit-testinfrastructuur (CLI, DB-afhankelijk). Bewijs = Step 5 (of, bij pooler-block, de expliciete rapportage daarvan + `node --check`). Geen testframework toevoegen voor dit ene script (YAGNI); als het script vaker wijzigt, is een aparte refactor-naar-testbare-functies gerechtvaardigd — noteer dat dan in de README-backlog.

## Done criteria

- [ ] `_migrations` krijgt/heeft `checksum`-kolom; apply én bootstrap schrijven hem
- [ ] Bewerkte al-applied migratie ⇒ fail-loud met exit 1 (Step 5-bewijs of gerapporteerde pooler-block)
- [ ] TLS valideert met `MIGRATE_SSL_CA`; zonder CA: oude gedrag + luide warning; `.env.local.example` gedocumenteerd
- [ ] `node --check scripts/migrate.mjs` exit 0
- [ ] Geen enkele wijziging onder `supabase/migrations*`
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- De pooler is onbereikbaar (bekende block): lever de codewijziging af mét `node --check`-bewijs en rapporteer expliciet dat Step 5 door Sebastiaan (of via CI/een machine mét connectiviteit) gedraaid moet worden. NIET de MCP-execute_sql-route zelf nemen.
- `alter table add column` faalt op de prod-ledger — rapporteer de exacte fout, niets forceren.
- De drift-simulatie laat onverwacht `pending` zien i.p.v. drift — de vergelijkingslogica klopt dan niet; terugdraaien en rapporteren.

## Maintenance notes

- Vanaf nu geldt hard: een gemergde migratie is onveranderlijk; wijzigingen = nieuw nummer. De runner dwingt het af.
- De backfill-aanname (huidig bestand = destijds toegepaste inhoud) is eenmalig; bij twijfel over een specifieke migratie kan Sebastiaan de rij-checksum handmatig NULL-en zodat hij opnieuw gebackfilled wordt.
- Overweeg later `sslmode=verify-full` in de connection-string zelf zodra de CA overal staat (dan kan de fallback weg).
