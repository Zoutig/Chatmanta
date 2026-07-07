# Plan 015: Zes onafhankelijke quick-win-fixes (PERF, tech-debt, DX, security-DRY)

> **Executor-instructies**: Dit plan bundelt **zes volledig onafhankelijke** fixes
> (A t/m F). Elke sectie heeft een eigen "Current state", eigen scope, eigen
> stappen én eigen verificatie. Je mag ze los oppakken, in elke volgorde, of
> allemaal achter elkaar. Er zijn GEEN onderlinge afhankelijkheden. Kies per
> sectie een eigen branch (aanbevolen — zie "Git-workflow"), of doe alles op één
> `feat/seb/quick-wins-015`-branch als je ze samen shipt.
>
> Voer per stap het verificatie-commando uit en bevestig het verwachte resultaat
> vóór je verder gaat. Gebeurt er iets uit de "STOP-condities" van die sectie:
> stop en rapporteer — improviseer niet. Werk aan het eind je statusrij in
> `plans/README.md` (regel 32) bij.
>
> **Drift-check (draai dit eerst, per sectie de bijhorende paden):**
> ```
> git diff --stat 3437648..HEAD -- lib/rag/run-rag-query.ts app/components/home/hub-background.tsx lib/errors/action.ts app/home/components/home-accent-picker.tsx scripts/check-env.mjs lib/security/cron-auth.ts lib/v0/auth-cookie.ts lib/v0/server/embed-token.ts lib/v1/widget/embed-token.ts
> ```
> Is één van de in-scope bestanden gewijzigd sinds dit plan? Vergelijk dan de
> "Current state"-excerpts met de live code vóór je begint; bij een mismatch:
> behandel het als STOP-conditie voor díe sectie (de andere secties kun je gewoon
> doorzetten).

## Status

- **Priority**: P2
- **Effort**: S (per sectie; 6× S)
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf | tech-debt | dx | security (DRY)
- **Planned at**: commit `3437648`, 2026-07-06
- **Menselijke gate**: **NEE voor migraties** — geen enkele sectie raakt een
  migratie, datamodel of RLS-policy (V0 noch V1). Wél twee *zachte* gates:
  - **Sectie D (TD-7)** vereist een **visuele UX-check** in de browser vóór de
    dependency verwijderd wordt (zie `plans/README.md:100`).
  - **Sectie E (DX-2)** hangt af van de inhoud van `.env.local` (gitignored, niet
    zichtbaar) — zie de STOP-conditie daar.

## Waarom dit ertoe doet (per fix, kort)

- **A / PERF-1**: `/home` laadt de zware WebGL-shader-lib eager in de initiële
  bundle + probeert 'm te SSR-en, terwijl de zusterpagina `/login` exact dezelfde
  lib pas na hydration client-only laadt. Puur bundle-/SSR-verspilling voor een
  aria-hidden achtergrond.
- **B / PERF-5**: op het no-rewrite-pad wordt exact dezelfde tekst (`original`)
  twee keer geëmbed — één keer voor de cache-lookup, één keer in de batch-embed.
  Eén verspilde OpenAI-embedding-call (netwerk + tokens/cost) per request op dat
  pad. De fix corrigeert bovendien een latente dubbel-telling in de cost-boekhouding.
- **C / TD-1**: 14 near-identieke lokale `function authFail(e)`-kopieën in de
  V1-server-actions. Elke wijziging aan het auth-fout-contract moet nu in 14
  bestanden in lockstep; 3 kopieën zijn al gedivergeerd.
- **D / TD-7**: de hele headless-UI-lib `@ark-ui/react` hangt in de dependency-tree
  voor precies één popover (de accent-kleurkiezer op `/home`). Te vervangen door de
  native Popover-API en de dep te laten vallen.
- **E / DX-2**: 37 scripts lezen de OUDE unprefixed Supabase-env-namen die
  `check-env` niet meer valideert. `npm run check-env` kan groen zijn terwijl deze
  scripts stil falen op een verse `.env.local`. Twee env-naamschema's lopen door
  elkaar.
- **F / SEC-3**: 4× byte-identieke constant-time-string-vergelijker naast elkaar.
  Geen bug, wél DRY-schuld: één getest helperoppervlak voorkomt dat een toekomstige
  copy-paste per ongeluk een non-constant-time (short-circuit) vergelijk op een
  auth-/tokenpad introduceert.

## Commands die je nodig hebt

| Doel | Command | Verwacht bij succes |
|------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, geen fouten (draait `tsc --noEmit`) |
| Unit-tests | `npm run test:unit` | alle tests groen (draait `node scripts/run-unit-tests.mjs`) |
| Build | `npm run build` | exit 0 (Windows: **eerst** `Remove-Item -Recurse -Force .next` als er een dev-server draaide — anders crasht `next build` op een vervuilde `.next`) |
| Env-check | `npm run check-env` | alle required checks ✓ |
| Losse unit-test | `node --import tsx --test <pad naar .test.ts>` | die ene test groen |

> **Belangrijk over `test:unit`**: de runner (`scripts/run-unit-tests.mjs`) faalt
> **hard** op elke `*.test.ts` die NIET onder een `__tests__/`-map staat ("wees-tests
> voorkomen"). Zet nieuwe tests dus altijd in een `__tests__/`-map naast de module.
>
> **Over `npm run eval:run-all`**: dit doet **echte, billable OpenAI-calls**. Draai
> het NIET standaard. Het staat alleen als *optionele* extra gedragscheck bij PERF-5,
> en pas ná expliciete goedkeuring van Sebastiaan.

## Git-workflow

- Repo squasht PR's; branch-conventie: `feat/seb/<slug>`, **nooit** direct op `main`.
- **Aanbeveling: één branch per sectie** (ze zijn onafhankelijk), bijv.:
  - A → `feat/seb/perf1-lazy-home-shader`
  - B → `feat/seb/perf5-reuse-cache-embed`
  - C → `feat/seb/td1-authfail-export`
  - D → `feat/seb/td7-drop-ark-ui`
  - E → `feat/seb/dx2-supabase-env-names`
  - F → `feat/seb/sec3-timing-safe-helper`
- Commit-stijl: conventional commits (bijv. `perf(home): lazy-load shader via next/dynamic`).
- **Vóór élke commit** je branch checken: `git rev-parse --abbrev-ref HEAD` (parallelle
  sessies kunnen je branch verschuiven).
- Push/PR alleen wanneer de operator dat vraagt.

---

# Sectie A — PERF-1: `/home` lazy-load de WebGL-shader via `next/dynamic`

## Current state (A)

- `app/components/home/hub-background.tsx` — 51 regels, `'use client'`. Rendert de
  mesh-shader-achtergrond voor `/home`. **Enige consumer**: `app/home/page.tsx:20`
  (`<HubBackground />`; die page is een server-component, `export const dynamic =
  'force-dynamic'`).
- De import staat statisch op module-top-level:
  ```
  app/components/home/hub-background.tsx:17
  import { MeshGradient } from '@paper-design/shaders-react';
  ```
- Gebruik in de render (regels 30-37):
  ```
  <MeshGradient
    className="absolute inset-0 w-full h-full"
    style={{ backgroundColor: isLight ? '#f4f7fa' : '#02060c' }}
    colors={[...palette]}
    speed={0.35}
    distortion={0.6}
    swirl={0.25}
  />
  ```
- **Exemplar (kopieer dit patroon)** — `app/components/ui/login-background.tsx:20-45`
  laadt shaders via `next/dynamic` met `{ ssr: false }`. De docstring bovenaan legt
  het WAAROM uit: server/client `Math.random`-mismatch vermijden + geen SSR-uitvoering
  van three.js. Bijv. regels 31-37:
  ```
  const MeshGradientBackground = dynamic(
    () =>
      import('./mesh-gradient-background').then((m) => ({
        default: m.MeshGradientBackground,
      })),
    { ssr: false },
  );
  ```

## Scope (A)

**In scope (enige te wijzigen bestand):**
- `app/components/home/hub-background.tsx`

**Out of scope — NIET aanraken:**
- `app/components/ui/login-background.tsx` (dient als voorbeeld, is al correct)
- `app/components/ui/mesh-gradient-background.tsx` (aparte login-wrapper)
- `lib/v0/shader-palette.ts`, de `useAccent`/`useTheme`-hooks
- `app/home/page.tsx` en alle andere `/home`-cards

## Stappen (A)

### A1: Vervang de statische import door `next/dynamic` op module-niveau

Doe in `app/components/home/hub-background.tsx`:

1. Verwijder regel 17 (`import { MeshGradient } from '@paper-design/shaders-react';`).
2. Voeg bovenaan de imports toe: `import dynamic from 'next/dynamic';`.
3. Voeg **op module-niveau** (buiten de `HubBackground`-functie, boven regel 22) toe:
   ```ts
   // Client-only lazy-load: shader-lib hoort niet in de initiële /home-bundle
   // en three.js mag niet SSR-en. Zelfde patroon als login-background.tsx.
   const MeshGradient = dynamic(
     () => import('@paper-design/shaders-react').then((m) => ({ default: m.MeshGradient })),
     { ssr: false },
   );
   ```
4. Laat de rest van het component ongewijzigd: alle props op `<MeshGradient>`
   (`className`, `style`, `colors`, `speed=0.35`, `distortion=0.6`, `swirl=0.25`),
   de dimmer-overlay-div eronder, de `useAccent`/`useTheme`/`getShaderPalette`-hooks,
   en de `'use client'`-directive bovenaan.

**VALKUIL**: de `dynamic(...)`-call MOET op module-niveau staan, niet in de
render-body — anders wordt bij elke render een nieuw component-type gemaakt en
remount de shader. Het bestand is al `'use client'`, dus `dynamic({ssr:false})` mag hier.

**Verify (A1)**:
- `npm run typecheck` → exit 0, geen fouten.
- `npm run build` → exit 0 (Windows: eerst `Remove-Item -Recurse -Force .next`).
- **Visueel**: open de app (`npm run dev`), ga naar `/home`, bevestig dat de
  mesh-achtergrond nog steeds zichtbaar is (het component is aria-hidden — er is
  geen test-hook, dus browser-check of Playwright-screenshot).

## STOP-condities (A)

- Regel 17 of het `<MeshGradient .../>`-blok ziet er anders uit dan de excerpts
  → drift, stop en rapporteer.
- Na de wijziging faalt `npm run build` op iets in `@paper-design/shaders-react`
  → controleer of de named export exact `MeshGradient` heet:
  `grep -rn "MeshGradient" node_modules/@paper-design/shaders-react/dist/`. Klopt de
  naam niet, stop en rapporteer (niet gokken).
- De mesh-achtergrond is na de wijziging weg op `/home` → stop en rapporteer.

---

# Sectie B — PERF-5: hergebruik de cache-embed-vector op het no-rewrite-pad

## Current state (B)

Alle regels in `lib/rag/run-rag-query.ts` (god-file, generator-functie).

- **Declaratie** van de herbruikbare vector (regel 1444):
  ```
  let cacheEmbedVector: number[] | null = null;
  ```
- **`queryForEmbed` start op `original`** (regel 1458): `let queryForEmbed = original;`
  Blijft `=== original` als er geen rewrite is (`enableRewrite=false`) of op het
  `off_topic`-pad (regel 1512 zet `queryForEmbed = original;`). Op het echte
  rewrite-pad wordt `queryForEmbed = pp.query` (regel 1521).
- **Eerste embed** van `original` (cache-lookup, regel 1470):
  ```
  const cacheEmbedPromise = cacheActive ? embedTexts([original]) : null;
  ```
  met `cacheActive = bot.cacheEnabled && input.disableCache !== true` (regel 1469).
- **De vector wordt opgeslagen** in scope (regels 1533-1537), alleen bij cache-MISS
  (bij een hit returnt de functie eerder):
  ```
  const cacheEmbed = await cacheEmbedPromise;
  stopEmbedCache();
  preCacheEmbedTokens = cacheEmbed.tokens;
  preCacheEmbedCost = cacheEmbed.costUsd;
  cacheEmbedVector = cacheEmbed.vectors[0];
  ```
- **De sub-query-set** default = `[queryForEmbed]` (regel 1613): `let subQueries: string[] = [queryForEmbed];`
  `querySet` wordt daarvan afgeleid (regel 1650); HyDE/decompose/multi-query **pushen
  extra entries ná index 0**, dus `querySet[0].text === queryForEmbed`.
- **De batch-embed** (regels 1686-1691) — hier gebeurt de tweede embed:
  ```
  yield { kind: 'status', phase: 'embed' };
  const stopEmbed = tMark('embedding_ms');
  const queryTexts = querySet.map((q) => q.text);
  const { vectors, tokens: embedTokens, costUsd: embedCost } = await embedTexts(queryTexts);
  stopEmbed();
  ```
  Op het no-rewrite-pad geldt `queryTexts[0] === queryForEmbed === original` →
  dezelfde tekst als de cache-embed. `embedTexts` (statische import, regel 27, uit
  `@/lib/rag/embeddings`) retourneert `{ vectors: number[][], tokens: number, costUsd: number }`
  en is **deterministisch** (`text-embedding-3-small`), dus de tweede call geeft een
  bit-identieke vector.
- **Volgorde is load-bearing**: `vectors[i]` wordt geïndexeerd tegen `querySet[i]` in
  `retrieveChunksHybrid` (regel 1709) en `retrieveChunks` (regel 1720). Index 0 moet
  dus de vector van `queryTexts[0]` blijven.
- **Cost-boekhouding** — `embedTokens`/`embedCost` (batch) en `preCacheEmbedTokens`/
  `preCacheEmbedCost` (cache-embed) worden **los** bijgehouden en in élk response-pad
  bij elkaar opgeteld:
  ```
  1947: embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
  1988: embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
  2020: embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
  2061: embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
  2503-2504: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens + claimVerifyEmbedTokens,
  ```
  → **Belangrijk inzicht**: vandaag telt `embedTokens + preCacheEmbedTokens` de tokens
  van `original` DUBBEL op het no-rewrite-pad (de tweede embed gebeurt écht). Zodra we
  die tweede embed overslaan, wordt `embedTokens` lager en klopt de som weer
  (original 1× via preCache + de rest via de batch). De fix **repareert dus meteen een
  latente dubbel-telling** — je hoeft niets extra's te compenseren, mits `embedTexts`
  alleen de niet-hergebruikte teksten embedt.

## Scope (B)

**In scope:**
- `lib/rag/run-rag-query.ts` (alleen het batch-embed-blok 1686-1691 + de `original`-
  vergelijking)
- `lib/rag/embed-reuse.ts` (nieuw — de pure helper)
- `lib/rag/__tests__/embed-reuse.test.ts` (nieuw — unit-test)

**Out of scope — NIET aanraken:**
- De selective-HyDE-embed (regels 1780-1782) — aparte embed, laat staan.
- De cache-write (regel 2926, `if (bot.cacheEnabled && cacheEmbedVector && ...)`) —
  hergebruikt `cacheEmbedVector` al correct.
- De **volgorde** van `vectors` — index `i` moet `querySet[i]` blijven mappen.
- Alle andere response-velden en timers behalve wat hieronder staat.

## Stappen (B)

### B1: Extraheer de hergebruik-beslissing als pure helper

Maak `lib/rag/embed-reuse.ts`:
```ts
// Beslist welke query-teksten nog geëmbed moeten worden wanneer index 0 al een
// kant-en-klare vector heeft (de cache-embed van de originele vraag). Alleen
// index 0 komt in aanmerking: vectors[i] mapt 1:1 op querySet[i], dus we mogen
// de volgorde nooit verstoren. Pure functie → los te unit-testen.
export function planQueryEmbed(
  reusableVector: number[] | null,
  queryTexts: string[],
  original: string,
): { toEmbed: string[]; prepend: number[] | null } {
  if (reusableVector && queryTexts.length > 0 && queryTexts[0] === original) {
    return { toEmbed: queryTexts.slice(1), prepend: reusableVector };
  }
  return { toEmbed: queryTexts, prepend: null };
}
```

### B2: Gebruik de helper op de batch-embed-callsite

Vervang in `lib/rag/run-rag-query.ts` het blok 1687-1691 door (voeg de import van
`planQueryEmbed` toe bij de bestaande `@/lib/rag/...`-imports bovenaan):
```ts
const stopEmbed = tMark('embedding_ms');
const queryTexts = querySet.map((q) => q.text);
// PERF-5: op het no-rewrite-pad is queryTexts[0] === original en hebben we die
// vector al (cacheEmbedVector). Skip die ene embed i.p.v. 'm te herhalen.
const { toEmbed, prepend } = planQueryEmbed(cacheEmbedVector, queryTexts, original);
let vectors: number[][];
let embedTokens = 0;
let embedCost = 0;
if (toEmbed.length > 0) {
  const embedded = await embedTexts(toEmbed);
  embedTokens = embedded.tokens;
  embedCost = embedded.costUsd;
  vectors = prepend ? [prepend, ...embedded.vectors] : embedded.vectors;
} else {
  // Single-query no-rewrite: alles hergebruikt, geen embed-call nodig.
  vectors = prepend ? [prepend] : [];
}
stopEmbed();
```

**Let op de types/namen**:
- De oorspronkelijke regel declareert `vectors`, `embedTokens`, `embedCost` via
  `const`-destructuring; downstream-code (regels 1709, 1720, 1947, 1988, 2020, 2061,
  2503) verwijst naar exact die namen. Behoud de namen; ze worden nu `let`.
- `prepend` is `number[] | null`; ná de guard in de helper is de non-null variant
  gegarandeerd, dus `[prepend, ...]` typecheckt als `number[][]`.

### B3: Timer-semantiek documenteren

Voeg een korte comment toe (bij `stopEmbed`) dat `embedding_ms` nu een kleinere
batch (of nul embeds) meet op het hergebruik-pad — bewuste, kleine meet-verschuiving.

**Verify (B)**:
- `npm run typecheck` → exit 0.
- Schrijf `lib/rag/__tests__/embed-reuse.test.ts` (model: `node:test` + `import { strict as assert } from 'node:assert'`, zie exemplar hieronder). Dek minimaal:
  1. `reusableVector != null` én `queryTexts[0] === original`, single-query →
     `{ toEmbed: [], prepend: reusableVector }`.
  2. idem met multi-query (`['orig','sub1','sub2']`) → `{ toEmbed: ['sub1','sub2'], prepend: reusableVector }`.
  3. `reusableVector === null` (cache inactief) → `{ toEmbed: queryTexts, prepend: null }` (volledige batch).
  4. `queryTexts[0] !== original` (rewrite-pad) → `{ toEmbed: queryTexts, prepend: null }`.
  5. lege `queryTexts` → `{ toEmbed: [], prepend: null }`.
- `npm run test:unit` → alle tests groen (incl. je nieuwe).
- `npm run build` → exit 0 (Windows: eerst `.next` wissen).
- **Optioneel, alleen met Sebastiaans OK (billable)**: `npm run eval:run-all` — de
  retrieval-resultaten moeten identiek blijven (zelfde vector ⇒ zelfde chunks).

**Test-exemplar** — `lib/v0/server/__tests__/rate-limit-fallback.test.ts` toont het
pure-functie-test-patroon (`node:test` + `assert/strict`).

## STOP-condities (B)

- De regels 1444, 1458, 1470, 1512, 1533-1537, 1613 of 1686-1691 wijken af van de
  excerpts → drift, stop en rapporteer.
- Je twijfelt of index 0 gegarandeerd `original` is op het hergebruik-pad → verifieer
  dat HyDE/decompose/multi-query alleen **ná** index 0 pushen (regels 1670, 1680; en
  `subQueries` default `[queryForEmbed]`). Klopt dat niet, stop en rapporteer.
- Downstream verwijst naar `embedTokens`/`embedCost`/`vectors` op een manier die niet
  meer typecheckt na de `const`→`let`-omzetting → stop en rapporteer.
- Je overweegt de selective-HyDE-embed (1780) of de cache-write (2926) aan te raken →
  dat is buiten scope; stop en rapporteer.

---

# Sectie C — TD-1: `authFail` naar één export in `lib/errors/action.ts`

## Current state (C)

- **Doelbestand** `lib/errors/action.ts` exporteert al `ActionFail` (regel 19),
  `actionTry`, `fail`, `ActionResult`. `ActionFail` =
  `{ ok:false; error:string; code:AppErrorCode; retryAfterSec?:number; requestId?:string }`.
  **LET OP**: dit bestand importeert momenteel `toAppError` en `AppErrorCode` uit
  `./app-error` (regel 1), maar **NIET** `isAppError`. Dat moet je toevoegen.
- **Canonieke vorm** (11 byte-identieke kopieën), bijv. `app/v1/app/widget/actions.ts:30-34`:
  ```ts
  /** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
  function authFail(e: unknown): ActionFail {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
    throw e;
  }
  ```
- **Volledige inventaris** (geverifieerd op HEAD via `grep -n "function authFail" app/`; 14 stuks):

  **CANONIEK (11 — direct te vervangen door import):**
  - `app/v1/app/widget/actions.ts:31`
  - `app/v1/app/account/actions.ts:21`
  - `app/v1/app/instellingen/actions.ts:23`
  - `app/v1/app/instellingen/generate-actions.ts:30`
  - `app/v1/app/contactverzoeken/actions.ts:25`
  - `app/v1/app/feedback/actions.ts:63`
  - `app/v1/app/kennisbank/actions.ts:53`
  - `app/v1/app/kennisbank/qa/qa-actions.ts:45`
  - `app/v1/admin/issues/[groupId]/actions.ts:16`
  - `app/v1/admin/feedback/actions.ts:31`
  - `app/v1/app/gesprekken/top-questions-actions.ts:32` (retourneert `ActionFail`; check dat de bodyregels semantisch identiek zijn — deze is mogelijk multi-line geformatteerd)

  **GEDIVERGEERD (3 — NIET blind vervangen; laat lokaal):**
  - `app/v1/app/quiz/actions.ts:43` → `function authFail(e): SubmitResult` — filtert
    alleen `AUTH_FORBIDDEN`, retourneert `{ ok:false, error:'Geen toegang.' }`, geen `code`.
  - `app/v1/admin/quiz/actions.ts:50` → hardcoded admin-boodschap
    (`'Geen toegang — Jorion-admin vereist.'`), alleen `AUTH_FORBIDDEN`.
  - `app/v1/app/gesprekken/actions.ts:38` → `function authFail(e): { ok:false; error:string }`
    — smaller return-type, geen `code`/`retryAfterSec`.
- Elke caller heeft al `import { isAppError } from '@/lib/errors/app-error'` en een
  import uit `@/lib/errors/action` (bijv. `import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';`, zie widget/actions.ts:18-19).

## Scope (C)

**In scope:**
- `lib/errors/action.ts` (nieuwe export + één import erbij)
- De 11 canonieke actions-bestanden hierboven (lokale functie weg, import erbij)
- De 3 gedivergeerde bestanden — alléén een 1-regel-comment die uitlegt waarom ze afwijken

**Out of scope — NIET aanraken:**
- Het aparte backlog-item "V1-actions omzeilen `actionTry`" (dat gaat over
  `app/v1/app/gesprekken/actions.ts:90` e.a. — een ándere fix).
- Geen wijziging aan de body-logica van de canonieke kopieën (ze zijn byte-identiek
  aan de export).

## Stappen (C)

### C1: Voeg de export toe aan `lib/errors/action.ts`

1. Breid regel 1 uit met `isAppError`:
   `import { AppError, isAppError, toAppError, type AppErrorCode } from './app-error';`
   (verifieer eerst dat `app-error.ts` `isAppError` exporteert — de callers importeren
   het al uit `@/lib/errors/app-error`, dus dat is zeker het geval).
2. Voeg (bijv. onder `fail`) toe:
   ```ts
   /** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
   export function authFail(e: unknown): ActionFail {
     if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
     throw e;
   }
   ```

**Verify (C1)**: `npm run typecheck` → exit 0.

### C2: Vervang de 11 canonieke kopieën door de import

Doe per bestand uit de canonieke lijst:
1. Verwijder de lokale `function authFail(...) { ... }` én de docstring-comment erboven.
2. Voeg `authFail` toe aan de bestaande `@/lib/errors/action`-import.
3. **Check per bestand of `isAppError` daarna nog ergens gebruikt wordt.** Zo niet:
   verwijder de nu-ongebruikte `import { isAppError } from '@/lib/errors/app-error'`
   (anders klaagt `tsc`/eslint over een ongebruikte import).

Doe dit één bestand tegelijk en draai tussendoor `npm run typecheck`.

**Verify (C2)**:
- `grep -rn "function authFail" app/` → nog exact **3** treffers (de gedivergeerde).
- `npm run typecheck` → exit 0.

### C3: Documenteer de 3 divergenties

Voeg boven elk van de 3 gedivergeerde `authFail`-functies één comment toe, bijv.:
`// Bewust lokaal: afwijkend return-type / boodschap — zie plan 015 sectie C.`

**Verify (C)**:
- `npm run typecheck` → exit 0.
- `npm run build` → exit 0 (Windows: eerst `.next` wissen).
- `npm run test:unit` → groen (er is geen dedicated authFail-test; dit bevestigt
  alleen dat niets brak).

## STOP-condities (C)

- Een van de 11 "canonieke" bodies blijkt tóch af te wijken van de export-vorm
  (ander return-type, andere velden) → behandel dat bestand als een 4e divergentie:
  laat lokaal, vervang NIET, en rapporteer het.
- De helper mag `e` NIET "returnen" bij een niet-`AppError`; hij moet `throw e` doen,
  anders krijg je een stille auth-bypass (Next.js' redirect-throw naar `/v1/login`
  moet doorlopen). Ziet je export er anders uit → stop en corrigeer.
- `grep` vindt na C2 meer of minder dan 3 resterende `function authFail` → stop en
  rapporteer (inventaris klopt niet meer).

---

# Sectie D — TD-7: `@ark-ui/react` vervangen door de native Popover-API

> **Zachte menselijke gate**: deze sectie eist een **visuele UX-check** in de browser
> vóór de dependency verwijderd wordt (`plans/README.md:100`). Verwijder de dep pas ná
> een groene build én een geslaagde visuele check.

## Current state (D)

- **Isolatie bevestigd**: `grep -rn "ark-ui"` over `**/*.{ts,tsx}` levert UITSLUITEND
  `app/home/components/home-accent-picker.tsx` op (2 regels). Verder alleen
  `package.json:79`, `package-lock.json` en `plans/README.md`.
  ```
  app/home/components/home-accent-picker.tsx:3  import { Popover } from '@ark-ui/react/popover';
  app/home/components/home-accent-picker.tsx:4  import { Portal } from '@ark-ui/react/portal';
  package.json:79                               "@ark-ui/react": "^5.36.2",
  ```
- **Het component** (`app/home/components/home-accent-picker.tsx`, 76 regels): een
  `fixed` knop linksonder (Settings-icoon, `bottom-5 left-20 z-20`) die een popover
  opent met een `role="radiogroup"` van `ACCENT_OPTIONS`-swatches. State via
  `useAccent()` uit `@/lib/v0/hooks/use-accent`. Gebruikt
  `Popover.Root/Trigger/Positioner/Content/Arrow/ArrowTip/Title` + `Portal`.
- **Styling-conventie**: het component gebruikt inline `style={{...}}` met
  CSS-custom-properties (`var(--bg-elev)`, `var(--manta-accent)`, `color-mix(...)`).
  Dat is **bewust** vanwege de Tailwind-v4-PostCSS-quirk (PostCSS dropt soms silent
  nieuwe properties — zie CLAUDE.md). **Behoud de inline-style-aanpak.**

## Scope (D)

**In scope:**
- `app/home/components/home-accent-picker.tsx` (herschrijven)
- `package.json` (dep verwijderen) + `package-lock.json` (via `npm install`, niet
  handmatig editen)

**Out of scope — NIET aanraken:**
- Wat dan ook buiten dit ene component + de dep-verwijdering. `@ark-ui` heeft geen
  andere consumenten.
- `@/lib/v0/hooks/use-accent` (blijft ongewijzigd gebruikt).

## Stappen (D)

### D1: Herschrijf `HomeAccentPicker` zonder ark-ui

Vervang de ark-ui-Popover door de **native HTML Popover-API** (`popover`-attribuut +
`popovertarget`) of een kleine lokale `useState` + outside-click. Te reproduceren gedrag:
1. **Klik-buiten-sluit + Escape** — native `popover="auto"` doet dit gratis.
2. **Arrow/ArrowTip** — mag vervallen of met een CSS-`::before` gerepliceerd.
3. **Positionering** onder/naast de trigger — native via CSS anchor positioning, óf
   simpele absolute plaatsing (de knop staat op een vaste plek `fixed bottom-5 left-20`).
4. **Focus-management + `aria-checked`** op de radio-swatches — dit blijft handmatige
   button-markup (`role="radio"`, `aria-checked={accent === o.value}`) en verandert niet.

Behoud de inline-style-conventie en alle bestaande CSS-custom-properties.

### D2: Groene build + visuele check (verplicht vóór D3)

- `npm run typecheck` → exit 0.
- `npm run build` → exit 0 (Windows: eerst `.next` wissen).
- **Visueel** (`npm run dev`, ga naar `/home`):
  - klik de accent-picker-knop → popover opent;
  - wissel een kleur → de accent verandert direct;
  - herlaad de pagina → de keuze persisteert (via `useAccent`);
  - klik buiten de popover → sluit; druk Escape → sluit.

### D3: Verwijder de dependency (pas ná D2)

- Verwijder regel 79 (`"@ark-ui/react": "^5.36.2",`) uit `package.json`.
- Draai `npm install` zodat `package-lock.json` regenereert (NIET handmatig editen).
- `npm run build` → exit 0.
- `grep -rn "ark-ui"` over `**/*.{ts,tsx}` → **geen** treffers meer in broncode.

**Verify (D)**: alle checks in D2 groen én `grep -rn "ark-ui" --include=*.ts --include=*.tsx .`
levert 0 broncode-treffers.

## STOP-condities (D)

- De visuele check in D2 faalt op één van de vier gedragingen (open/wissel/persist/sluit)
  → **verwijder de dep NIET**; stop en rapporteer.
- De native `popover`-API blijkt niet acceptabel voor de doelgroep-browserbaseline →
  overweeg de useState+outside-click-variant; twijfel je, stop en vraag.
- `grep` vindt ná D3 nog ark-ui-imports in broncode → de rewrite is incompleet; stop.

---

# Sectie E — DX-2: 37 scripts migreren naar de prefixed Supabase-env-namen

> **Zachte gate**: `.env.local` is gitignored en niet zichtbaar. Deze fix werkt
> vandaag alleen zolang `.env.local` de OUDE namen nog meedraagt. Zie STOP-condities.

## Current state (E)

- **Validatie-bron** `scripts/check-env.mjs:5-13` valideert alleen de NIEUWE prefixed
  namen:
  ```
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
- **App-canoniek (V0)** `lib/supabase/service-role.ts:35-36` — "the SINGLE place":
  ```
  const url = process.env.V0_SUPABASE_URL;
  const key = process.env.V0_SUPABASE_SERVICE_ROLE_KEY;
  ```
- **Correcte V1-scripts (contrast)** `scripts/v1-seed.mjs:16-17`:
  ```
  const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
  const key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
  ```
- **De stragglers** — 37 scripts lezen `process.env.NEXT_PUBLIC_SUPABASE_URL` +
  `process.env.SUPABASE_SERVICE_ROLE_KEY` (geen fallback). Bijv.
  `scripts/v0-ingest.mjs:61-64`:
  ```
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  ```
  (let op: de error-message-string bevat óók de oude naam — regel 64.)
- **Volledige lijst (37, geverifieerd op HEAD)** — `grep -l "NEXT_PUBLIC_SUPABASE_URL" scripts/`:
  `scripts/cc/backfill-prs.mjs`, `scripts/cc/clean-slate.mjs`, `scripts/cc/seed-v0-milestones.mjs`,
  `scripts/compare-rewrites-v04-v05.ts`, `scripts/probe-eigenrisico-retrieval.ts`,
  `scripts/probe-keyword-path.ts`, `scripts/test-budget-cap.ts`, `scripts/test-delete-visitor.ts`,
  `scripts/test-pii-redaction-log.ts`, `scripts/v063-eval-progress.ts`, `scripts/v063-prep-diagnostics.ts`,
  `scripts/v0-backfill-manual-qa.mjs`, `scripts/v0-chat.mjs`, `scripts/v0-citation-integrity.ts`,
  `scripts/v0-clear-org-cache.mjs`, `scripts/v0-crawl-debug.ts`, `scripts/v0-crawl-eval.ts`,
  `scripts/v0-eval-label-doctor.ts`, `scripts/v0-eval-relabel.ts`, `scripts/v0-eval-report.ts`,
  `scripts/v0-eval-run.ts`, `scripts/v0-eval-seed.ts`, `scripts/v0-failure-taxonomy.ts`,
  `scripts/v0-hard-eval-harvest.ts`, `scripts/v0-hard-eval-run.ts`, `scripts/v0-ingest.mjs`,
  `scripts/v0-latency-diagnosis.ts`, `scripts/v0-list-docs.mjs`, `scripts/v0-reingest-parents.ts`,
  `scripts/v0-reset.mjs`, `scripts/v0-retrieval-audit.ts`, `scripts/v0-seed-orgs.ts`,
  `scripts/v0-snapshot.mjs`, `scripts/v0-tune-threshold.mjs`, `scripts/v0-unsupported-subtax.ts`,
  `scripts/verify-schema.mjs`, `scripts/wp3-cache-count.mjs`.

## Scope (E)

**In scope:** alleen de 37 scripts hierboven (env-reads + eventuele error-message-strings).

**Out of scope — NIET aanraken:**
- `package.json` (de `--env-file=.env.local`-scripts blijven ongewijzigd; je hernoemt
  alleen de env-reads binnen de `.ts`/`.mjs`-bestanden).
- `scripts/check-env.mjs` (blijft de source-of-truth; je migreert de scripts NAAR die
  namen, niet andersom).
- `scripts/v1-seed.mjs` en andere `v1-*`-scripts die de prefixed namen al goed doen.

## Stappen (E)

### E1: Bepaal per script V0 of V1 (belangrijk — niet blind hernoemen)

De meeste stragglers zijn duidelijk **V0** (`v0-*`, de eval/audit-pipeline,
`v0-snapshot`, `wp3-cache-count`). Twijfelgevallen die je **per script moet
beoordelen** vóór je hernoemt: `test-budget-cap.ts`, `test-delete-visitor.ts`,
`test-pii-redaction-log.ts`, `scripts/cc/*`, `probe-*`, `compare-rewrites-*`,
`verify-schema.mjs`. Bepaal het target-project door te lezen welke tabellen/data het
script aanraakt (V0-tabellen → V0_-namen; V1-tabellen → `NEXT_PUBLIC_V1_*` +
`V1_SUPABASE_SERVICE_ROLE_KEY`). **Aanbeveling: default = V0** tenzij het script
aantoonbaar V1-tabellen/`v1_`-prefixen aanraakt.

### E2: Hernoem de env-reads (optie A — aanbevolen)

Per script:
- `process.env.NEXT_PUBLIC_SUPABASE_URL` → `process.env.V0_SUPABASE_URL`
  (of `NEXT_PUBLIC_V1_SUPABASE_URL` als E1 het als V1 aanwees).
- `process.env.SUPABASE_SERVICE_ROLE_KEY` → `process.env.V0_SUPABASE_SERVICE_ROLE_KEY`
  (of `V1_SUPABASE_SERVICE_ROLE_KEY` voor V1).
- Neem de bijhorende **error-message-strings** mee (bijv. `v0-ingest.mjs:64`).

> **Waarom optie A en niet de band-aid (optie B = oude namen terugzetten in
> `check-env`)?** De app is al gestandaardiseerd op `V0_`; optie A elimineert het
> dubbele schema i.p.v. het te bestendigen.

### E3 (optioneel maar aanbevolen): documenteer het canonieke schema

Er is GEEN `.env.example`. Overweeg er één toe te voegen (of breid de comments in
`check-env.mjs` uit) met de vereiste namen, zodat een verse checkout niet opnieuw op
dit dubbele schema stuit. Klein en optioneel — vraag Sebastiaan of hij dit wil.

**Verify (E)**:
- `grep -rlP '(?<![A-Z0-9_])NEXT_PUBLIC_SUPABASE_URL' scripts/` → **leeg**.
- `grep -rlP '(?<![A-Z0-9_])SUPABASE_SERVICE_ROLE_KEY' scripts/` → **leeg**
  (de prefixed `V0_SUPABASE_SERVICE_ROLE_KEY` / `V1_SUPABASE_SERVICE_ROLE_KEY` matchen
  door de negatieve look-behind NIET).
- `npm run check-env` → alle required ✓.
- Draai 1 representatief script als smoke-test, bijv. `npm run v0:list`
  (= `scripts/v0-list-docs.mjs`) → laadt zonder "Missing …"-fout.

## STOP-condities (E)

- Een smoke-test faalt met "Missing V0_SUPABASE_URL / V0_SUPABASE_SERVICE_ROLE_KEY"
  → jouw lokale `.env.local` mist de prefixed namen. Dat is een **omgevings**-issue,
  geen code-bug: STOP en meld dat Sebastiaan de prefixed namen aan `.env.local` moet
  toevoegen (`check-env` vereist ze sowieso al). Ga niet gokken/aanpassen.
- Je kunt voor een twijfel-script (E1) niet met zekerheid V0 vs V1 bepalen → STOP en
  vraag; hernoem het niet op gevoel.

---

# Sectie F — SEC-3: consolideer 4× constant-time-compare naar één helper

## Current state (F)

Vier byte-identieke constant-time-string-vergelijkers (length-guard + `node:crypto`
`timingSafeEqual`). Geen van de vier bevat een bug; dit is puur DRY.

- `lib/security/cron-auth.ts:12-15` — **inline** (geen named `safeEqual`), op Buffers
  uit strings:
  ```
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authHeader);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
  ```
- `lib/v0/auth-cookie.ts:43-48` — `function safeEqual(a: string, b: string): boolean`
  (import op regel 16: `import { createHmac, timingSafeEqual } from 'node:crypto';`).
- `lib/v0/server/embed-token.ts:30-35` — idem `safeEqual`; heeft `import 'server-only'`
  (regel 9) + `import { createHmac, timingSafeEqual } from 'node:crypto';` (regel 10).
- `lib/v1/widget/embed-token.ts:35-40` — idem `safeEqual`; `import 'server-only'`
  (regel 14) + `import { createHmac, timingSafeEqual } from 'node:crypto';` (regel 15).
  File-comment (regels 4-7) zegt "Eigen kopie i.p.v. import: het V0-bestand staat onder
  `lib/v0/**`".

**Conventie-correctie (belangrijk — overrule de losse note "alleen deels
consolideerbaar"):** `lib/security/cron-auth.ts` wordt al geïmporteerd door **zowel**
`app/api/v0/cron/*` **als** `app/api/v1/cron/*` (bijv. `app/api/v1/cron/retention/route.ts:17`
`import { isAuthorizedCron } from '@/lib/security/cron-auth';`). `lib/security` is dus
bewezen V0+V1-neutraal. De "V0/V1 delen geen lib-code"-conventie gaat over
`lib/v0/**` ↔ `lib/v1/**`-imports, NIET over een neutrale `lib/security`-helper. Daarom
mogen **alle vier** sites (incl. de V1-widget embed-token) op deze helper landen. De
file-comment "eigen kopie i.p.v. import" ging over het niet-importeren van de héle
embed-token-module uit `lib/v0` — niet over een gedeelde crypto-primitive.

## Scope (F)

**In scope:**
- `lib/security/timing-safe-equal.ts` (nieuw — de helper)
- `lib/security/__tests__/timing-safe-equal.test.ts` (nieuw — unit-test)
- `lib/security/cron-auth.ts` (inline → helper)
- `lib/v0/auth-cookie.ts` (safeEqual → import)
- `lib/v0/server/embed-token.ts` (safeEqual → import)
- `lib/v1/widget/embed-token.ts` (safeEqual → import)

**Out of scope — NIET aanraken:**
- Wire-format, `sign()`, `b64url()`, `secret()`, en de verify-logica in de
  embed-token-bestanden. Extraheer UITSLUITEND de constant-time-compare.
- Exports/signatures van `checkPassword`/`verifyAuthCookieValue`/`createEmbedToken`/
  `verifyEmbedToken`/`isAuthorizedCron` — ongewijzigd.
- Voeg `import 'server-only'` NIET toe aan de nieuwe helper (cron-auth heeft het ook
  niet en werkt; `node:crypto` is sowieso server-side).

## Stappen (F)

### F1: Maak de helper

`lib/security/timing-safe-equal.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';

/** Constant-time string-vergelijk. False bij lengte-mismatch (geen leak).
 *  De length-guard MOET vóór timingSafeEqual — Node's crypto.timingSafeEqual
 *  gooit bij buffers van verschillende lengte. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

### F2: Refactor de 4 callsites

- **`lib/security/cron-auth.ts`**: vervang het inline blok (regels 12-15) door
  `return timingSafeEqualStr(authHeader, \`Bearer ${secret}\`);` en vervang de import
  `import { timingSafeEqual } from 'node:crypto';` door
  `import { timingSafeEqualStr } from './timing-safe-equal';` (relatief — dit bestand
  staat zelf in `lib/security`).
- **`lib/v0/auth-cookie.ts`**: verwijder de lokale `function safeEqual`; voeg toe
  `import { timingSafeEqualStr as safeEqual } from '@/lib/security/timing-safe-equal';`
  (alias `safeEqual` → callsites `checkPassword`/`verifyAuthCookieValue` blijven
  ongewijzigd). Verander de node:crypto-import naar `import { createHmac } from 'node:crypto';`
  (`timingSafeEqual` wordt hier niet meer direct gebruikt).
- **`lib/v0/server/embed-token.ts`**: idem — lokale `safeEqual` weg, alias-import erbij,
  node:crypto-import → `import { createHmac } from 'node:crypto';`. Laat `import 'server-only'`
  staan.
- **`lib/v1/widget/embed-token.ts`**: idem als V0 embed-token. Laat `import 'server-only'`
  staan; werk desgewenst de "eigen kopie i.p.v. import"-comment bij zodat hij nu de
  gedeelde crypto-helper noemt.

### F3: Schrijf de unit-test

`lib/security/__tests__/timing-safe-equal.test.ts` (model:
`lib/security/__tests__/cron-auth.test.ts` — `node:test` + `import { strict as assert } from 'node:assert'`,
header-comment met de run-regel). Dek: gelijke-lengte match → true; gelijke-lengte
mismatch → false; ongelijke lengte → false; lege strings (`''` vs `''`) → true.

**Verify (F)**:
- `npm run typecheck` → exit 0.
- `npm run test:unit` → alle tests groen. De **bestaande** round-trip-tests
  `lib/v0/server/__tests__/embed-token.test.ts` en
  `lib/v1/widget/__tests__/embed-token.test.ts` dekken de extractie end-to-end
  (`createEmbedToken` → `verifyEmbedToken`) en moeten groen **blijven**. Ook
  `lib/security/__tests__/cron-auth.test.ts` moet groen blijven.
- Losse run van je nieuwe test:
  `node --import tsx --test lib/security/__tests__/timing-safe-equal.test.ts` → groen.
- `npm run build` → exit 0 (Windows: eerst `.next` wissen).

## STOP-condities (F)

- Een van de 4 huidige vergelijkers wijkt af van de excerpts (bijv. mist de
  length-guard) → drift, stop en rapporteer (niet "gladstrijken").
- Na de refactor faalt een bestaande embed-token-round-trip-test → je hebt per ongeluk
  wire-format/sign/verify geraakt; stop en rol terug.
- Je overweegt `import 'server-only'` aan de nieuwe helper toe te voegen omdat cron-auth
  'm dan niet meer mag importeren → doe dat NIET (cron-auth is geen server-only-module);
  stop en heroverweeg.

---

## Done-criteria (hele plan — vink per sectie af)

Per uitgevoerde sectie moeten ALLE checks van die sectie gelden. Overkoepelend:

- [ ] **A**: `hub-background.tsx` gebruikt `next/dynamic({ssr:false})`; `/home` toont
      nog de mesh-achtergrond; typecheck + build groen.
- [ ] **B**: `planQueryEmbed` bestaat + is getest; typecheck + build + `test:unit` groen;
      geen wijziging aan selective-HyDE/cache-write; vector-volgorde intact.
- [ ] **C**: `authFail` geëxporteerd uit `lib/errors/action.ts`; `grep -rn "function authFail" app/`
      → exact 3 (de gedivergeerde, met uitleg-comment); typecheck + build groen.
- [ ] **D**: `HomeAccentPicker` draait zonder `@ark-ui`; visuele check geslaagd; dep uit
      `package.json` + lockfile geregenereerd; `grep -rn "ark-ui"` in broncode leeg.
- [ ] **E**: `grep -rlP '(?<![A-Z0-9_])NEXT_PUBLIC_SUPABASE_URL' scripts/` én
      `... SUPABASE_SERVICE_ROLE_KEY ...` leeg; `check-env` groen; 1 script gesmoketest.
- [ ] **F**: `timingSafeEqualStr` bestaat + getest; 4 callsites gebruiken 'm; bestaande
      embed-token/cron-auth-tests groen; typecheck + build groen.
- [ ] Geen bestanden buiten de in-scope-lijst van de betrokken sectie(s) gewijzigd
      (`git status`).
- [ ] `plans/README.md`-statusrij (regel 32) bijgewerkt naar de uitgevoerde secties.

## Maintenance-notities

- **B (PERF-5)**: als iemand later HyDE/decompose/multi-query zó wijzigt dat ze een
  entry vóór index 0 in `querySet` invoegen, breekt de hergebruik-aanname. De helper
  gaat er strikt van uit dat `querySet[0]` de main-query is. Reviewer: check dat
  `vectors[0]` nog altijd de embed van `queryTexts[0]` is.
- **C (TD-1)**: nieuwe `actions.ts`-bestanden moeten voortaan `authFail` **importeren**,
  niet kopiëren. De 3 gedivergeerde kopieën blijven bewust lokaal.
- **D (TD-7)**: de native Popover-API vereist een recente browserbaseline. Als de
  accent-picker ooit naar een klant-facing pagina verhuist, her-evalueer de baseline.
- **F (SEC-3)**: toekomstige auth-/tokenpaden die een constant-time-compare nodig
  hebben, importeren `timingSafeEqualStr` — géén nieuwe lokale copy-paste (dat was
  precies het risico dat deze consolidatie wegneemt).

## STOP-condities (overkoepelend)

- Een verificatie-commando faalt twee keer na een redelijke fix-poging → stop en
  rapporteer die sectie.
- Een fix blijkt een out-of-scope-bestand nodig te hebben → stop en rapporteer.
- De drift-check bovenaan toont dat een in-scope bestand sinds commit `3437648`
  gewijzigd is en de "Current state"-excerpts niet meer kloppen → behandel het als
  drift voor díe sectie.

## Noot: NIET in dit plan (bewuste scope-grens)

`plans/README.md:32` noemt bij plan 015 ook een **"injection dubbel-adjectief-regexfix"**
(zie ook README-tabelregel 72: "015 (regexfix)"). Die zit **niet** in de zes findings
van deze batch en staat niet in de brief voor dit plan — hij is dus **buiten scope**
gelaten. Als Sebastiaan die regexfix tóch bij 015 wil, hoort hij als aparte sectie
(met eigen bewijs uit `lib/v0/server/injection-patterns.ts`) — niet stilletjes hierin
gebundeld.
