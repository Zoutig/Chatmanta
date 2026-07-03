# Plan 004: Maak check-env, AGENTS.md, ONBOARDING.md en HANDOFF.md weer waar (+ Node-pin)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- scripts/check-env.mjs AGENTS.md docs/ONBOARDING.md HANDOFF.md package.json`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

Vier "bron van waarheid"-plekken zijn actief onjuist — erger dan ontbrekende docs, want ze worden vertrouwd:
1. `npm run check-env` (de gedocumenteerde setup-smoke-test) eist env-vars die sinds de V0_/V1_-namespace-split niet meer bestaan → vals-negatief op een correcte setup, en de échte vars worden niet gecheckt.
2. `AGENTS.md` regel 11 zegt "37 migrations live (0001 t/m 0037)" en "V1 … is nog niet gestart" — er zijn 53+ V0-migraties, 16 V1-migraties en een code-complete `app/v1`. Elke agent laadt dit als eerste context en krijgt een fout mentaal model.
3. `docs/ONBOARDING.md` noemt "Claude Haiku 4.5 voor antwoorden" (het is gpt-4o-mini) en "pre-build / V1-fase".
4. `HANDOFF.md` §1 schrijft de oude CI-secret-namen voor, waar `build.yml:14` naar verwijst.
Plus: er is geen `engines`/`.nvmrc`-pin terwijl CI op Node 22 draait en `@types/node` op ^20 staat.

## Current state

- `scripts/check-env.mjs:5-11` (geverifieerd):

```js
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_PRODUCT_NAME',
  'NEXT_PUBLIC_APP_URL',
];
```

  Verderop in het script (regel 31+) wordt `NEXT_PUBLIC_SUPABASE_URL` opnieuw gebruikt voor URL-format- en connectiviteitschecks — lees het HELE script en werk alle referenties bij.
- `.env.local.example:13-19` — definieert de echte namen: `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY`, `V1_SUPABASE_SERVICE_ROLE_KEY`; en zegt letterlijk dat de oude unprefixed namen "vervangen" zijn.
- `lib/supabase/service-role.ts:35` — runtime leest `V0_SUPABASE_URL` / `V0_SUPABASE_SERVICE_ROLE_KEY`.
- `AGENTS.md:11` — "**Status (mei 2026):** … 37 migrations live (`0001_core_tenancy` t/m `0037_v0_multi_website`). V1 (Supabase Auth + productie-multi-tenancy) is nog niet gestart — nieuwe features landen als nieuwe V0 bot-versie tenzij Sebastiaan expliciet zegt 'we starten V1'." Feitelijke stand: V0-migraties t/m `0053_v0_contact_requests`, V1-migraties t/m `0016_v1_feedback_tickets`, `app/v1` + `lib/v1` code-compleet (zie `docs/V1_LAUNCH_TODO.md` en `docs/V1_STATUS_EN_PLAN.md`).
- `docs/ONBOARDING.md:7` "RAG … met Claude Haiku als taalmodel"; `:9` "We zitten in de pre-build / V1-fase"; `:15` "**Anthropic Claude Haiku 4.5** voor antwoorden". Feitelijk: OpenAI gpt-4o-mini genereert de antwoorden (AGENTS.md:70, beslissing 2026-06-29 in docs/V1_STATUS_EN_PLAN.md); Anthropic SDK is ongebruikt.
- `HANDOFF.md:31-33` — §1 CI-secrets: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. `build.yml:46-49` leest daadwerkelijk: `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY`.
- `package.json` — geen `engines`-veld; geen `.nvmrc`; `build.yml:33` pint CI op Node `'22'`; `@types/node` staat op `^20`.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Env-check | `npm run check-env`  | alle checks ✓ (op deze machine staat een gevulde `.env.local`) |
| Typecheck | `npm run typecheck`  | exit 0              |

## Scope

**In scope**:
- `scripts/check-env.mjs`
- `AGENTS.md` (alléén het status-blok op regel ~11)
- `docs/ONBOARDING.md` (alléén regels ~7, ~9, ~15)
- `HANDOFF.md` (alléén §1, regels ~31-34)
- `package.json` (`engines`), nieuw `.nvmrc`

**Out of scope**:
- `@types/node` bumpen naar ^22 — apart; kan typefouten blootleggen (zie STOP)
- `CLAUDE.md`, `docs/V1_LAUNCH_TODO.md`, `docs/handoffs/*` — niet herschrijven
- Overige inhoud van AGENTS.md/ONBOARDING.md — geen redactionele "verbeteringen"
- `.env.local` zelf — NOOIT lezen of citeren (secrets)

## Git workflow

- Branch: `git checkout -b feat/seb/docs-env-truth`
- Commit: `docs(dx): check-env naar V0_/V1_-namen + stale status-claims gecorrigeerd + Node-pin`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: check-env.mjs bijwerken

Vervang de `required`-lijst door:

```js
const required = [
  'V0_SUPABASE_URL',
  'V0_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_V1_SUPABASE_URL',
  'NEXT_PUBLIC_V1_SUPABASE_ANON_KEY',
  'V1_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_PRODUCT_NAME',
  'NEXT_PUBLIC_APP_URL',
];
```

Lees daarna de rest van het script en werk elk gebruik van de oude namen bij: URL-format-checks draaien voortaan op `V0_SUPABASE_URL` én `NEXT_PUBLIC_V1_SUPABASE_URL`; een eventuele connectiviteits-ping gebruikt de bijbehorende key per project. Blijf bij de bestaande stijl (pass/fail-regels, nooit waarden loggen).

**Verify**: `npm run check-env` → alle checks ✓, exit 0.

### Step 2: AGENTS.md status-blok

Herschrijf regel ~11 naar de actuele stand, bijvoorbeeld:

> **Status (juli 2026):** V0 draait als actief RAG-leerplatform (migraties t/m `0053_v0_contact_requests`) mét geshipte crawler + embeddable widget. **V1 is code-compleet** — `app/v1` + `lib/v1` + migraties `0001`–`0016` op het aparte V1-prod-project; alle §1.5-items gebouwd. Resterend vóór launch: uitsluitend ops/legal, zie `docs/V1_LAUNCH_TODO.md`. Nieuwe features: overleg of ze in V0 (bot-versie) of V1 landen.

Behoud de rest van de alinea/het document byte-voor-byte. Check dat het blok niet meer botst met regel ~79 (die naar `docs/V1_STATUS_EN_PLAN.md` verwijst).

**Verify**: `grep -n "nog niet gestart" AGENTS.md` → 0 hits; `grep -n "0037" AGENTS.md` → 0 hits in het status-blok.

### Step 3: ONBOARDING.md

- Regel ~7: "…met **OpenAI gpt-4o-mini** als taalmodel."
- Regel ~9: vervang de pre-build-zin door de actuele fase (V1 code-compleet, launch-voorbereiding met 2-3 testklanten).
- Regel ~15: "**OpenAI gpt-4o-mini** voor antwoorden, **OpenAI text-embedding-3-small** voor embeddings" (Claude/Anthropic weghalen of expliciet als "V2-plan" markeren).

**Verify**: `grep -in "haiku" docs/ONBOARDING.md` → 0 hits (of alleen in een expliciete V2-zin).

### Step 4: HANDOFF.md §1

Vervang de drie oude secret-namen door de vier die `build.yml:46-49` leest (V0_SUPABASE_URL, V0_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_V1_SUPABASE_URL, NEXT_PUBLIC_V1_SUPABASE_ANON_KEY), met dezelfde toelichting (V0-sandbox = fake demo-data).

**Verify**: `grep -n "NEXT_PUBLIC_SUPABASE_URL" HANDOFF.md` → 0 hits.

### Step 5: Node-pin

- `package.json`: voeg toe `"engines": { "node": ">=22" }`.
- Nieuw `.nvmrc` met inhoud `22`.

**Verify**: `npm run typecheck` exit 0; `node -e "console.log(require('./package.json').engines.node)"` → `>=22`.

## Test plan

Geen unit-tests: dit zijn docs + een check-script. Bewijs = `npm run check-env` groen op een correcte `.env.local` en de greps hierboven op 0 hits.

## Done criteria

- [ ] `npm run check-env` exit 0 en checkt de V0_/V1_-namen
- [ ] Alle vier de greps uit de stappen → 0 hits
- [ ] `engines.node` + `.nvmrc` aanwezig
- [ ] `npm run typecheck` exit 0
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- `npm run check-env` faalt na Step 1 op een var die wél in `.env.local.example` staat — dan wijkt de lokale `.env.local` af; rapporteer welke KEY (nooit de waarde).
- Je wilt `@types/node` bumpen om iets te laten kloppen — niet doen, rapporteer.
- Het AGENTS.md-statusblok blijkt intussen al herschreven (drift) — rapporteer i.p.v. dubbel te redigeren.

## Maintenance notes

- AGENTS.md-status veroudert opnieuw; overweeg bij de volgende grote mijlpaal (V1-launch) een vaste "laatst geverifieerd op"-datum in het blok.
- `scripts/diagnose-env.mjs` bestaat ook nog — buiten scope hier, maar check bij een volgende env-wijziging of die dezelfde drift heeft.
