# Plan 008: Ponytail-opruiming — dode dep, dode EUR-kostentabel, gedupliceerde crawler-utils

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- package.json lib/ai/llm.ts lib/v0/crawler lib/v1/crawler`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (aanbevolen — de crawl-ssrf-test staat daarna op z'n definitieve plek; zonder 001 kan dit plan wel, maar check dan het testpad in Step 3)
- **Category**: tech-debt
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

Drie geverifieerde over-engineering-vondsten (ponytail-audit, elk met grep bevestigd op 2026-07-02):
1. **nanoid** staat in dependencies maar heeft nul imports — de codebase gebruikt overal `crypto.randomUUID()`. Dode supply-chain-oppervlakte.
2. **`MODEL_COSTS` (EUR) + `calculateCost` + `SupportedModel`/`SupportedModelUsd`** in `lib/ai/llm.ts` hebben nul callers buiten het bestand zelf, en de EUR-tabel is een byte-identieke kopie van de USD-tabel (dus niet eens echte EUR). Alle echte callers gebruiken `MODEL_COSTS_USD`/`costForModelUsd`/`costUsdToEur`.
3. **`validateCrawlUrl.ts` (133 r) en `normalizeHost.ts` (14 r)** bestaan byte-identiek in `lib/v0/crawler/` én `lib/v1/crawler/` (diff = leeg; de V1-normalizeHost draagt zelfs nog de V0-header). Het zijn pure Node-functies zonder DB-koppeling — en het is de SSRF-guard: een fix in één kopie mist de andere.

Samen: ~170 regels en 1 dependency weg, en de SSRF-guard heeft weer één bron van waarheid.

## Current state

- `package.json:87` — `"nanoid": "^5.1.11"`. Grep over app/lib/scripts (alle extensies): 0 imports.
- `lib/ai/llm.ts:38-56` — `MODEL_COSTS` (EUR, waarden identiek aan `MODEL_COSTS_USD` op regel 69-74), `SupportedModel` (45), `calculateCost` (48-56); `SupportedModelUsd` (76). Grep buiten dit bestand: 0 hits. LET OP: de comments op regel 66-67 ("V1 callers gebruiken MODEL_COSTS (EUR) voor billing") en regel 104-105 ("per-call EUR via MODEL_COSTS — let op: MODEL_COSTS (EUR) spiegelt nu nog de USD-tabel") verwijzen naar de te verwijderen tabel en moeten mee.
- `lib/v0/crawler/validateCrawlUrl.ts` ≡ `lib/v1/crawler/validateCrawlUrl.ts` en `lib/v0/crawler/normalizeHost.ts` ≡ `lib/v1/crawler/normalizeHost.ts` (diff leeg, geverifieerd). Consumenten: de v0/v1 crawler-modules, `app/v1/app/kennisbank/actions.ts`, `app/v1/admin/jobs/actions.ts`, en de crawl-ssrf-test.
- Repo-precedent voor de oplossing: `lib/v0/server/doc-parse.ts` is een re-export-shim naar `@/lib/rag/doc-parse` ("V0 re-export shim", zie memory PR-2). `lib/rag/` is de gevestigde versie-neutrale laag.
- Bewust NIET in dit plan: `@ark-ui/react` vervangen door de native popover-API (ponytail-vondst 4) — vereist visuele UX-verificatie van de accent-picker; staat in de backlog.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Unit-tests| `npm run test:unit` | groen (incl. crawl-ssrf) |
| Build     | `.next/` weg, `npm run build` | exit 0 |

## Scope

**In scope**:
- `package.json` + `package-lock.json` (nanoid eruit)
- `lib/ai/llm.ts` (EUR-blok + comments)
- `AGENTS.md` (alléén de "Migratie-grens"-regel ~80 die `MODEL_COSTS` bij naam noemt)
- Nieuw: `lib/rag/crawler/validateCrawlUrl.ts` + `lib/rag/crawler/normalizeHost.ts` (verhuisd)
- `lib/v0/crawler/validateCrawlUrl.ts`, `lib/v0/crawler/normalizeHost.ts`, `lib/v1/crawler/validateCrawlUrl.ts`, `lib/v1/crawler/normalizeHost.ts` → worden 1-regel re-export-shims

**Out of scope**:
- `callLLM`/`streamLLM`-stubs in llm.ts — gedocumenteerde V2-scope, laten staan
- `costForModelUsd`, `MODEL_COSTS_USD`, `costUsdToEur` — actief gebruikt, laten staan
- `firecrawl.ts` (óók byte-identiek V0/V1, maar bevat de API-koppeling en is 363 r — bewust uitgesteld; zie backlog techdebt-02)
- `@ark-ui/react` — zie hierboven
- Alle importers van de crawler-utils: door de shims hoeven die NIET aangepast

## Git workflow

- Branch: `git checkout -b feat/seb/ponytail-cleanup`
- Drie commits, één per vondst: `chore(deps): nanoid verwijderd (0 imports)`, `chore(ai): dode EUR-kostentabel verwijderd`, `refactor(crawler): validateCrawlUrl+normalizeHost naar neutrale lib/rag/crawler (shims op oude paden)`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: nanoid verwijderen

Haal `"nanoid": "^5.1.11"` uit `package.json` dependencies en run `npm install` (werkt de lock bij).

**Verify**: `grep -rn "from 'nanoid'" app lib scripts` → 0; `npm run typecheck` exit 0. (`npm ls nanoid` mag nog transitieve 3.x via next/postcss tonen — dat is een andere, indirecte dependency.)

### Step 2: EUR-kostentabel verwijderen

In `lib/ai/llm.ts`: verwijder `MODEL_COSTS`, `SupportedModel`, `calculateCost` (regel ~31-56) en `SupportedModelUsd` (~76). Werk de comments bij: regel ~66-67 wordt "Alle callers (V0 én V1) rekenen in USD via costForModelUsd; EUR ontstaat alleen via costUsdToEur."; in de `costUsdToEur`-comment (~104-105) vervalt de verwijzing naar MODEL_COSTS.

Werk óók `AGENTS.md` regel ~80 bij (panel-bevinding): de zin "de LLM-laag `lib/ai/llm.ts` met provider-abstractie + `MODEL_COSTS` voor EUR-billing" verwijst straks naar een geschrapt symbool. Vervang dat deel door: "de LLM-laag `lib/ai/llm.ts` met provider-abstractie; EUR ontstaat via `costUsdToEur` (een echte EUR-tarieventabel komt pas met een echte V2-billing-caller)". Raak de rest van de regel/alinea niet aan.

**Verify**: `grep -rn "MODEL_COSTS[^_]\|calculateCost\|SupportedModel" app lib scripts` → alleen nog `MODEL_COSTS_USD`-gerelateerde hits binnen llm.ts; `npm run typecheck` exit 0; `npm run test:unit` groen (`lib/ai/__tests__/cost.test.ts` test de USD-helpers).

### Step 3: Crawler-utils dedupliceren

1. `git mv lib/v0/crawler/validateCrawlUrl.ts lib/rag/crawler/validateCrawlUrl.ts` en `git mv lib/v0/crawler/normalizeHost.ts lib/rag/crawler/normalizeHost.ts`. Fix de header-comment van normalizeHost (die noemt nog het v0-pad).
2. Maak op alle vier de oude paden een shim naar het nieuwe pad, naar het model van `lib/v0/server/doc-parse.ts`:

```ts
// Re-export-shim — implementatie verhuisd naar de versie-neutrale laag (plan 008).
export * from '@/lib/rag/crawler/validateCrawlUrl';
```

   (idem voor normalizeHost; de V1-varianten identiek.)
3. Check of de crawl-ssrf-test (na plan 001: `lib/v0/crawler/__tests__/crawl-ssrf.test.ts`; anders `tests/v0/crawl-ssrf.test.ts`) nog draait — hij importeert via het oude pad en werkt door de shim gewoon.

**Verify**: `diff <(git show 628e7df:lib/v0/crawler/validateCrawlUrl.ts) lib/rag/crawler/validateCrawlUrl.ts` → leeg (inhoud 1:1 verhuisd); `npm run typecheck` exit 0; `npm run test:unit` groen; `.next/` weg + `npm run build` exit 0.

## Test plan

Geen nieuwe tests: alle drie de wijzigingen zijn deletions/verhuizingen met bestaande dekking (cost.test.ts voor llm.ts; crawl-ssrf.test.ts voor validateCrawlUrl). De verify-greps bewijzen "echt nul callers".

## Done criteria

- [ ] nanoid weg uit package.json; lock bijgewerkt
- [ ] llm.ts bevat geen EUR-tabel/calculateCost/SupportedModel* meer; comments kloppen weer
- [ ] `grep -n "MODEL_COSTS[^_]" AGENTS.md` → 0 hits
- [ ] `lib/rag/crawler/` bevat de enige implementatie; 4 shims op de oude paden
- [ ] `npm run typecheck` + `npm run test:unit` + `npm run build` groen
- [ ] Netto diff: ~170 regels minder (excl. lockfile)
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- Een grep uit de verify-stappen vindt tóch een caller van nanoid/calculateCost/MODEL_COSTS(EUR) — rapporteer (de audit-aanname klopt dan niet meer).
- De V0/V1-kopieën blijken niet langer byte-identiek (drift sinds 628e7df) — dan is de verhuizing geen no-op meer; rapporteer het verschil.
- `npm install` wil meer dan nanoid uit de lock halen.

## Maintenance notes

- Toekomstige SSRF-guard-wijzigingen: alléén in `lib/rag/crawler/validateCrawlUrl.ts`.
- De shims mogen verdwijnen zodra iemand de importers omzet naar het neutrale pad (mechanisch, laag risico, geen haast).
- `firecrawl.ts` (363 r, óók byte-identiek) is de volgende dedup-kandidaat maar heeft API-gedragsrisico — zie backlog techdebt-02.
- Nieuwe EUR-billing (V2) introduceert een échte EUR-tabel pas als er een caller is.
