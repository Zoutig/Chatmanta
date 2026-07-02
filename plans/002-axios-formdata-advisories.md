# Plan 002: Los de HIGH npm-advisories op (axios + form-data via @mendable/firecrawl-js)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- package.json package-lock.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

`@mendable/firecrawl-js` (de website-crawler-SDK, gebruikt in V0 én V1) trekt transitief `axios@1.15.2` en `form-data@4.0.5` binnen. Beide hebben HIGH-severity advisories (o.a. Proxy-Authorization-lek bij redirects, prototype-pollution MITM-gadget, CRLF-injectie in multipart). De crawler haalt externe, deels klant-opgegeven URL's op, dus dit is een bereikbaar runtime-pad. `npm audit` meldt dat een **non-breaking fix** beschikbaar is.

## Current state

- `package.json:72` — `"@mendable/firecrawl-js": "^4.25.0"` (geen directe axios-dependency, geen `overrides`-blok).
- `lib/v0/crawler/firecrawl.ts` en `lib/v1/crawler/firecrawl.ts` — instantiëren `new Firecrawl(apiKey)`; de SDK gebruikt axios voor alle API-calls.
- `npm audit --omit=dev` (gedraaid 2026-07-02) meldt:

```
axios: HIGH — o.a. GHSA-654m-c8p4-x5fp (Proxy-Authorization Header Injection via Prototype Pollution)
  via @mendable/firecrawl-js 4.18.1 - 4.25.1
form-data 4.0.0 - 4.0.5: HIGH — GHSA-hmw2-7cc7-3qxx (CRLF injection)
postcss <8.5.10: moderate — via next (alleen build-time; fix is een BREAKING next-downgrade — NIET doen)
5 vulnerabilities (2 moderate, 3 high) — "fix available via `npm audit fix`"
```

De 2 moderate postcss-advisories zitten in de build-toolchain van `next` zelf; de "fix" daarvoor is `npm audit fix --force` dat next naar 9.x zou downgraden — dat is expliciet uitgesloten.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Audit     | `npm audit --omit=dev`   | na fix: 0 high      |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit-tests| `npm run test:unit`      | alle groen          |
| Build     | eerst `.next/` verwijderen (PowerShell: `Remove-Item -Recurse -Force .next`), dan `npm run build` | exit 0 |

## Scope

**In scope** (de enige files die mogen wijzigen):
- `package-lock.json`
- `package.json` (alléén als een `overrides`-blok nodig blijkt)

**Out of scope** (NIET aanraken):
- Elke andere dependency-versie (next, react, openai, supabase-js, …)
- Alle broncode onder `app/`, `lib/`, `scripts/`
- `npm audit fix --force` — nooit gebruiken

## Git workflow

- Branch: `git checkout -b feat/seb/deps-audit-fix` (nooit direct op main; de pre-push hook blokkeert main)
- Commit-stijl (conventional, NL — zie `git log`): `fix(deps): axios/form-data HIGH-advisories via npm audit fix`
- NIET pushen of een PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Baseline vastleggen

Run `npm audit --omit=dev` en bewaar de output (3 high verwacht).

**Verify**: output noemt axios + form-data HIGH en "fix available via `npm audit fix`".

### Step 2: Fix toepassen

Run `npm audit fix` (ZONDER `--force`).

**Verify**: `git diff --stat` → alleen `package-lock.json` gewijzigd (evt. `package.json` als npm de firecrawl-range aanpaste — dan checken dat het binnen `^4.x` blijft).

### Step 3: Controleer dat alleen de bedoelde packages bewogen zijn

Run `git diff package-lock.json | grep -E '"(axios|form-data|@mendable/firecrawl-js)"' | head -20` en `npm ls axios form-data`.

**Verify**: axios ≥ een gepatchte versie (>1.15.2), form-data ≥ 4.0.6; `@mendable/firecrawl-js` nog steeds major 4.

### Step 4: Her-audit + regressiecheck

Run `npm audit --omit=dev`, daarna `npm run typecheck` en `npm run test:unit`.

**Verify**: 0 high in prod-deps (de 2 moderate postcss via next mogen blijven — gedocumenteerd hierboven); typecheck exit 0; unit-tests groen.

### Step 5: Build-check

Verwijder `.next/` en run `npm run build`.

**Verify**: exit 0.

## Test plan

Geen nieuwe tests: dit is een lockfile-bump. De bestaande verificatie (typecheck + test:unit + build) plus de her-audit is het bewijs. Een live crawl-smoke-test (billable, vereist `FIRECRAWL_API_KEY`) is NIET nodig voor een patch-bump binnen dezelfde SDK-major; alleen draaien als de operator erom vraagt.

## Done criteria

- [ ] `npm audit --omit=dev` → 0 high
- [ ] `npm ls axios` toont een versie > 1.15.2; `npm ls form-data` > 4.0.5
- [ ] `npm run typecheck` exit 0; `npm run test:unit` groen; `npm run build` exit 0
- [ ] `git status`: alleen `package-lock.json` (+ evt. `package.json` overrides) gewijzigd
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

Stop en rapporteer als:
- `npm audit fix` `@mendable/firecrawl-js` naar een andere **major** wil bumpen (5.x) — dat kan SDK-gedrag verschuiven en vereist een crawl-smoke-test + overleg.
- `npm audit fix` wijzigingen aan `next`, `react` of `react-dom` voorstelt.
- Na de fix nog steeds high-advisories overblijven — dan is een `overrides`-blok nodig: leg het voor i.p.v. zelf te experimenteren.

## Maintenance notes

- De transitieve axios-pin komt terug bij elke firecrawl-bump: draai `npm audit --omit=dev` na elke dependency-wijziging (plan 001 voegt een `verify`-script toe; overweeg audit daar later aan toe te voegen).
- De postcss-moderates verdwijnen vanzelf bij een toekomstige next-upgrade; niet forceren.
