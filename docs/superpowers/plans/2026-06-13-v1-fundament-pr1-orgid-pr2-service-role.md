# V1 Fundament — PR-1 (orgId verplicht) + PR-2 (service-role-consolidatie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De twee goedkope de-risking-blokken uit de V1-kickoff-spec uitvoeren: (PR-1) `runRagQuery`/`runRagQueryStreaming` mogen geen `organizationId` meer stil naar `DEV_ORG_ID` defaulten, en (PR-2) de ~22 modules die elk hun eigen service-role-client bouwen routeren via één centrale fabriek in `lib/supabase/admin.ts`.

**Architecture:** Beide PR's zijn gedragsbehoudend in V0 en raken géén datamodel/migratie. PR-1 is een type-tightening (compile-time afgedwongen orgId) + één expliciete `DEV_ORG_ID` op het eval-pad. PR-2 is een mechanische refactor naar één `getServiceRoleClient()`-fabriek met byte-identieke client-opties — dat creëert de "één plek die `SUPABASE_SERVICE_ROLE_KEY` leest" die de latere V0/V1-namespace-split (kickoff §3) in tweeën kan knippen.

**Tech Stack:** Next.js 16.2 App Router · TypeScript · `@supabase/supabase-js` · Node built-in test runner (`node --import tsx --test`) · `tsc --noEmit`.

**Bron-spec:** `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md` §4.1 (PR-1) + §4.2 (PR-2).

---

## Pre-flight (eenmalig, vóór Task 1)

- [ ] **P0a — Worktree opzetten.** Gebruik de `superpowers:using-git-worktrees`-skill. **Vraag Sebastiaan eerst** of de worktree zichtbaar (`C:\Users\solys\Documents\Code\chatmanta-v1-pr1`) of verstopt (`.claude/worktrees/`) moet komen — kies niet stilletjes. Branch: `feat/seb/v1-pr1-orgid` van **`origin/main`** (niet van `feat/seb/v1-prep`; die bevat alleen docs en hoeft niet mee). De spec-/handoff-docs blijven op `feat/seb/v1-prep` — die branch los je later op.
- [ ] **P0b — Worktree bruikbaar maken.** Kopieer `.env.local` van de hoofd-repo naar de worktree (gitignored, komt niet mee). Draai `npm ci` in de worktree (junction-`node_modules` faalt op Turbopack — een echte install is nodig). Dev-server later: `npx next dev -p 3001`.
- [ ] **P0c — Geen migratie nodig.** PR-1 en PR-2 voegen géén `supabase/migrations/`-bestand toe. Sla `check-migration` over.
- [ ] **P0d — Baseline groen.** Draai `npm run typecheck` en `npm run test:unit` één keer vóór je begint, zodat je weet dat een latere failure van jóuw wijziging komt, niet van een bestaande breuk.

> **Branch-strategie:** PR-1 en PR-2 zijn aparte PR's op aparte branches. Werk PR-1 volledig af (merge naar `main`), start PR-2 dan vanaf de verse `main`. Reden: beide raken `lib/v0/server/rag.ts` (PR-1 de orgId-params, PR-2 de `supabase()`-clientfabriek) — sequentieel werken voorkomt rebase-pijn.

---

# PR-1 — `runRagQuery` orgId niet-optioneel

**Files:**
- Create: `lib/v0/server/__tests__/rag-org-required.test.ts`
- Modify: `lib/v0/server/rag.ts` (regels 469, 543, 583, 815 = helper-defaults · 1285 = interne call · 1443 = streaming-input-type · 1507 = `?? DEV_ORG_ID`)
- Modify: `package.json` (voeg de nieuwe test toe aan `test:unit`)
- Mogelijk: enkele callers die `tsc` aanwijst (waarschijnlijk geen — zie Task 4)

**Achtergrond (geverifieerd 2026-06-13):**
- Er zijn twee entrypoints. `runRagQuery` (rag.ts:1208) is het **non-streaming eval-pad** — heeft géén orgId-param, gebruikt bewust `DEV_ORG_ID` voor persona (1234/1251) en roept `retrieveChunks(v, V0_RAG_DEFAULTS.TOP_K)` aan op **1285 zonder org** → leunt op de helper-default.
- `runRagQueryStreaming` (rag.ts:1434) is het **productie-pad** — heeft `organizationId?: string` (1443), resolveert `const orgId = input.organizationId ?? DEV_ORG_ID` op **1507** en geeft `orgId` expliciet door aan álle interne helpers (1717/1867/1869/1927/3051).
- **Productie-callers geven `organizationId` al expliciet mee:** `app/api/v0/chat/route.ts:362-371` (`getActiveOrgId(req)`), `app/klantendashboard/test/actions.ts:69` (`activeOrg.id`), `lib/v0/server/eval.ts:863-876` (required `organizationId: string`). De `?? DEV_ORG_ID` op 1507 is dus al de-facto dode vangnet-code voor het streaming-pad; weghalen is een veiligheidsaanscherping, geen gedragswijziging.

---

### Task 1: Failing guard-test — geen stille DEV_ORG_ID-default

**Files:**
- Create: `lib/v0/server/__tests__/rag-org-required.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```typescript
// PR-1-guard: de retrieval-helpers en het streaming-entrypoint in rag.ts mogen
// een ontbrekende organizationId NIET stil naar DEV_ORG_ID defaulten. Een
// her-geintroduceerde default is een cross-tenant-leak zodra een V1-pad deze
// code raakt. Deze test leest de bron en faalt als zo'n default terugkomt.
//
// Run: node --import tsx --test lib/v0/server/__tests__/rag-org-required.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ragSrc = readFileSync(
  fileURLToPath(new URL('../rag.ts', import.meta.url)),
  'utf8',
);

test('retrieval-helpers defaulten organizationId niet naar DEV_ORG_ID', () => {
  assert.doesNotMatch(
    ragSrc,
    /organizationId\s*:\s*string\s*=\s*DEV_ORG_ID/,
    'Een helper defaultt organizationId nog naar DEV_ORG_ID — maak het een verplichte parameter.',
  );
});

test('runRagQueryStreaming valt niet terug op DEV_ORG_ID', () => {
  assert.doesNotMatch(
    ragSrc,
    /input\.organizationId\s*\?\?\s*DEV_ORG_ID/,
    'Het streaming-entrypoint valt nog terug op DEV_ORG_ID — maak input.organizationId verplicht.',
  );
});
```

- [ ] **Step 2: Run de test, verifieer dat hij FAALT**

Run: `node --import tsx --test lib/v0/server/__tests__/rag-org-required.test.ts`
Expected: FAIL — beide assertions matchen nog (de defaults staan er nu in).

- [ ] **Step 3: Commit de falende test**

```bash
git add lib/v0/server/__tests__/rag-org-required.test.ts
git commit -m "test(rag): guard tegen stille DEV_ORG_ID-default (faalt nog)"
```

---

### Task 2: Maak de 4 interne retrieval-helpers org-verplicht

**Files:**
- Modify: `lib/v0/server/rag.ts:469, 543, 583, 815`

- [ ] **Step 1: Verwijder de `= DEV_ORG_ID`-defaults**

Op elk van de vier regels staat nu:
```typescript
  organizationId: string = DEV_ORG_ID,
```
Verander élk van deze vier (regels 469 `retrieveChunksHybrid`, 543 `lookupCachedAnswer`, 583 `writeCachedAnswer`, 815 `retrieveChunks`) naar:
```typescript
  organizationId: string,
```
Laat de JSDoc-commentregel erboven ("// v0.4 multi-org: scope retrieval naar deze org. Default DEV_ORG voor backward compat.") aanpassen naar:
```typescript
  /** v0.4 multi-org: scope retrieval naar deze org. Verplicht (PR-1) — geen stille DEV_ORG-fallback. */
```

- [ ] **Step 2: Verifieer dat `tsc` nu precies één interne call-site afkeurt**

Run: `npm run typecheck`
Expected: FAIL met één fout op `lib/v0/server/rag.ts:1285` — `retrieveChunks(v, V0_RAG_DEFAULTS.TOP_K)` mist nu het verplichte 4e argument (`organizationId`). De call-sites 1717/1867/1869/1927/3051 geven `orgId` al door en blijven groen.

> Als `tsc` méér dan alleen 1285 afkeurt: dat zijn extra call-sites die stiekem op de default leunden — fix elke met de juiste org (productie-pad: de in-scope `orgId`; eval-pad: `DEV_ORG_ID`). Op basis van de grep van 2026-06-13 is 1285 de enige.

- [ ] **Step 3: Commit**

```bash
git add lib/v0/server/rag.ts
git commit -m "refactor(rag): retrieval-helpers eisen expliciete organizationId"
```

---

### Task 3: Fix het eval-call-site (1285) + maak streaming-input org-verplicht

**Files:**
- Modify: `lib/v0/server/rag.ts:1285, 1443, 1507`

- [ ] **Step 1: Geef het non-streaming eval-pad expliciet DEV_ORG_ID mee (regel 1285)**

`runRagQuery` (1208) is per ontwerp het DEV_ORG eval-pad (zie de commentaren op 1232/1248-1250 en `getPersonaById(DEV_ORG_ID)` op 1234/1251). Maak die keuze nu expliciet i.p.v. een stille default. Verander regel 1285:
```typescript
    const hits = await retrieveChunks(v, V0_RAG_DEFAULTS.TOP_K);
```
naar (let op: `retrieveChunks(queryVector, topK, withParents = false, organizationId)` — geef `withParents` expliciet `false` mee zodat het org-argument op de juiste positie staat):
```typescript
    // Eval-pad (non-streaming): expliciet DEV_ORG, geen stille default.
    const hits = await retrieveChunks(v, V0_RAG_DEFAULTS.TOP_K, false, DEV_ORG_ID);
```

- [ ] **Step 2: Maak `runRagQueryStreaming.input.organizationId` verplicht (regel 1443)**

Verander:
```typescript
  /** v0.4 multi-org: scope retrieval+cache naar deze org. Default DEV_ORG. */
  organizationId?: string;
```
naar:
```typescript
  /** v0.4 multi-org: scope retrieval+cache naar deze org. Verplicht (PR-1) — geen DEV_ORG-fallback. */
  organizationId: string;
```

- [ ] **Step 3: Verwijder de `?? DEV_ORG_ID`-fallback (regel 1507)**

Verander:
```typescript
  const orgId = input.organizationId ?? DEV_ORG_ID;
```
naar:
```typescript
  const orgId = input.organizationId;
```
De comment-blok eronder (over "Unknown orgId → fallback DEV_ORG persona") aanpassen: `getPersonaById(orgId)` valt zelf al terug op DEV_ORG-persona bij een onbekende org, dus de persona-laag blijft veilig. Pas de comment aan naar:
```typescript
  // PR-1: organizationId is nu verplicht; geen DEV_ORG-fallback meer op het
  // streaming-pad. getPersonaById() valt zelf terug op DEV_ORG-persona bij een
  // onbekende org, dus een onbekende-maar-geldige org krijgt nog steeds een
  // veilige persona zonder cross-tenant data te lekken.
```

- [ ] **Step 4: Run de guard-test, verifieer dat hij nu SLAAGT**

Run: `node --import tsx --test lib/v0/server/__tests__/rag-org-required.test.ts`
Expected: PASS — beide assertions matchen niet meer.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, óf een korte lijst caller-fouten (zie Task 4). Productie-callers passen `organizationId` al toe, dus verwacht 0 fouten hier — maar bevestig.

- [ ] **Step 6: Commit**

```bash
git add lib/v0/server/rag.ts
git commit -m "feat(rag): organizationId verplicht op streaming-pad, eval-pad expliciet DEV_ORG"
```

---

### Task 4: Compiler-gedreven caller-fix (alleen indien `tsc` iets afkeurt)

**Files:** wat `npm run typecheck` aanwijst. Op 2026-06-13 geven alle bekende streaming-callers `organizationId` al door — verwacht is dat deze task leeg is. Doe 'm tóch als verificatie.

> Ik heb hier bewust géén hand-lijst van 8 callers ingebakken: `tsc` somt elke breuk deterministisch op met exact `file:line`. Een hand-lijst zou stiekem stale kunnen zijn; de compiler niet.

**De regel per gerapporteerde fout:**
- **Productie-/chat-/dashboard-pad** (`app/api/v0/chat/route.ts`, `app/klantendashboard/**`): geef de in-scope geresolveerde org door (`getActiveOrgId(req)` resp. `activeOrg.id`). Verzin geen org — gebruik de waarde die de caller al heeft.
- **Eval-/test-/script-pad** (`lib/v0/server/eval.ts`, `scripts/v0-eval-run.ts`, `scripts/v0-hard-eval-run.ts`, `scripts/v0-test-org-isolation.ts`): geef expliciet `DEV_ORG_ID` mee (of de org die de test al kiest). Import `DEV_ORG_ID` uit `@/lib/v0/server/rag` als die nog niet geïmporteerd is.

- [ ] **Step 1: Pas elke door `tsc` gerapporteerde caller aan volgens de regel hierboven**

(Geen voorbeeld-code: afhankelijk van wat `tsc` rapporteert. Pas per regel toe. Als de lijst leeg is — verwacht — sla over.)

- [ ] **Step 2: Run typecheck tot groen**

Run: `npm run typecheck`
Expected: PASS, 0 fouten.

- [ ] **Step 3: Commit (alleen als er iets gewijzigd is)**

```bash
git add -A
git commit -m "fix(rag): callers geven organizationId expliciet door (compiler-gedreven)"
```

---

### Task 5: PR-1 verificatie + groene tests + PR

- [ ] **Step 1: Voeg de guard-test toe aan `test:unit`**

In `package.json`, regel 12 (`"test:unit": "node --import tsx --test ..."`), voeg het nieuwe testpad toe aan de bestaande lijst (achteraan, vóór de afsluitende `"`):
```
 lib/v0/server/__tests__/rag-org-required.test.ts
```

- [ ] **Step 2: Draai de volledige unit-suite**

Run: `npm run test:unit`
Expected: PASS — alle bestaande tests + de nieuwe `rag-org-required` tests groen.

- [ ] **Step 3: Smoke het eval-pad (de enige gedrags-gevoelige verandering: regel 1285)**

Run (in de worktree, `.env.local` aanwezig): `npm run eval:hard:run -- --versions=v0.10`
Expected: draait door zonder crash; het eval-pad retrievt nog steeds DEV_ORG-data (de hard-eval draait tegen de DEV/demo-orgs). Dit bevestigt dat de expliciete `DEV_ORG_ID` op 1285 gedrag-identiek is aan de oude default.

> Goedkoper alternatief als je geen billable judge-run wilt: `npm run audit:retrieval` — die importeert het retrieval-pad en bevestigt dat de keten compileert+draait tegen DEV_ORG zonder een betaalde judge aan te roepen. Eén van beide volstaat als smoke.

- [ ] **Step 4: Commit + PR**

```bash
git add package.json
git commit -m "test(rag): rag-org-required in test:unit-suite"
git push -u origin feat/seb/v1-pr1-orgid
gh pr create --fill
```

Vul `.github/pull_request_template.md` volledig in. Kernpunten voor de reviewer: (1) type-tightening, geen datamodel/migratie; (2) productie-callers gaven org al door → gedragsbehoudend in V0; (3) enige gedrags-gevoelige regel = 1285 (eval-pad) en die is gesmoket.

**PR-1 Definition of Done:**
- [ ] `npm run typecheck` groen
- [ ] `npm run test:unit` groen (incl. `rag-org-required`)
- [ ] Geen `organizationId: string = DEV_ORG_ID` of `input.organizationId ?? DEV_ORG_ID` meer in `rag.ts`
- [ ] Eval-pad gesmoket (gedrag ongewijzigd)
- [ ] PR aangemaakt met ingevulde template

> Na merge: ruim de branch op (`git branch -D feat/seb/v1-pr1-orgid`, remote delete, `git worktree remove`). Start PR-2 vanaf de verse `main`.

---

# PR-2 — Service-role-client-consolidatie

**Files:**
- Modify: `lib/supabase/admin.ts` (nieuwe export `getServiceRoleClient()`)
- Create: `lib/supabase/__tests__/no-adhoc-service-client.test.ts`
- Modify: de ~22 consumer-modules (zie inventaris in Task 7)
- Modify: `package.json` (nieuwe test in `test:unit`)

**Doel:** Eén centrale fabriek die `SUPABASE_SERVICE_ROLE_KEY` leest. Elke module die nu een eigen lazy-cached `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })` heeft, importeert in plaats daarvan `getServiceRoleClient()` uit `lib/supabase/admin.ts`. Byte-identieke client-opties → gedragsbehoudend.

**Scope-beslissing (leg voor aan Sebastiaan bij twijfel):** PR-2 consolideert alléén **runtime-code onder `lib/**` en `app/**`**. De `scripts/**`-tsx-tools blijven hun eigen client houden — ze draaien buiten Next.js (met `--conditions=react-server`) en zijn geen onderdeel van de SA-5-runtime-grens; ze door `admin.ts` (→`@/lib/auth`) routeren riskeert import-keten-breuk voor weinig waarde. De grep-gate in kickoff §3 wordt dus ge-scoped op `lib/**`+`app/**`, niet repo-breed. *(De spec §4.2-DoD schreef "grep = 0 buiten admin.ts"; dit is de praktische precisering — noem het in de PR.)*

---

### Task 6: Voeg `getServiceRoleClient()` toe + failing inventaris-test

**Files:**
- Modify: `lib/supabase/admin.ts`
- Create: `lib/supabase/__tests__/no-adhoc-service-client.test.ts`

- [ ] **Step 1: Voeg de fabriek-functie toe aan `lib/supabase/admin.ts`**

Voeg ná `getSystemJobClient` (na regel 85) toe:
```typescript
/**
 * Service-role client voor interne V0-modules die al binnen een vertrouwde
 * grens draaien (geen per-request user-identiteit) en die vóór PR-2 elk hun
 * eigen `createClient(...SERVICE_ROLE_KEY...)` bouwden. Gedrag-identiek aan die
 * lokale fabrieken: lazy-cached, geen sessie-persistentie, GEEN auth-check.
 *
 * Anders dan getJorionAdminClient/getOrgScopedAdminClient doet deze GEEN
 * autorisatie — het is bewust de consolidatie-bestemming voor code die er geen
 * had. Het bestaansrecht: er is nu ÉÉN plek die SUPABASE_SERVICE_ROLE_KEY leest,
 * die de V0/V1-namespace-split (kickoff §3) later in tweeën kan knippen.
 *
 * Synchroon (geen await) zodat bestaande synchrone call-sites (`sb().from(...)`)
 * niet async hoeven te worden.
 */
export function getServiceRoleClient(): SupabaseClient {
  return _serviceRoleClient();
}
```

- [ ] **Step 2: Schrijf de falende inventaris-test (cross-platform, geen `grep`)**

```typescript
// PR-2-guard: geen enkele runtime-module onder lib/ of app/ mag nog zelf een
// service-role-client bouwen — alles moet via lib/supabase/admin.ts. Scope is
// bewust lib/+app/ (runtime/SA-5-grens); scripts/ blijven buiten scope.
//
// Run: node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vanaf lib/supabase/__tests__/<dit-bestand> is ../../.. de repo-root.
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
      const rel = file.slice(repoRoot.length + 1);
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
```

- [ ] **Step 3: Run de test, verifieer dat hij FAALT met de volledige inventaris**

Run: `node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts`
Expected: FAIL — `offenders` bevat de ~22 bestanden uit Task 7. **Noteer deze exacte lijst** als je werk-checklist (het is de bron-van-waarheid, actueler dan de snapshot hieronder).

- [ ] **Step 4: Commit fabriek + falende test**

```bash
git add lib/supabase/admin.ts lib/supabase/__tests__/no-adhoc-service-client.test.ts
git commit -m "feat(admin): getServiceRoleClient-fabriek + inventaris-guard (faalt nog)"
```

---

### Task 7: Migreer elke consumer naar `getServiceRoleClient()`

**De canonieke transform (geldt voor élk bestand, het patroon is uniform):**

**VOOR** — elke module heeft een variant hiervan (helper heet `sb`/`supabase`, cache-var `_sb`/`_supabase`):
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// ...
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}
```

**NA:**
1. Verwijder het volledige `let _sb...`-blok + de `function sb()`-definitie.
2. Voeg de import toe: `import { getServiceRoleClient } from '@/lib/supabase/admin';`
3. Vervang elke aanroep `sb()` / `supabase()` door `getServiceRoleClient()`.
4. Ruim de oude `import { createClient, type SupabaseClient } from '@supabase/supabase-js';` op: verwijder `createClient`; behoud `type SupabaseClient` **alleen als het verderop in het bestand nog als type gebruikt wordt** (anders helemaal weg — eslint `no-unused-vars` flagt het).

> Identieke opties (`persistSession:false, autoRefreshToken:false`) staan al in `_serviceRoleClient()` in admin.ts → gedrag is byte-identiek. Geen enkele module gebruikt afwijkende client-opties (geverifieerd 2026-06-13).

**Inventaris (snapshot 2026-06-13 — gebruik de live test-output uit Task 6 Step 3 als de echte checklist):**

`lib/` (21):
- [ ] `lib/controlroom/server/db.ts` *(2 hits — kan 2 fabrieken in 1 file zijn; vervang beide)*
- [ ] `lib/commandcenter/server/checkins.ts`
- [ ] `lib/commandcenter/server/assistant-threads.ts` *(2 hits)*
- [ ] `lib/commandcenter/server/decisions.ts`
- [ ] `lib/commandcenter/server/customers.ts`
- [ ] `lib/commandcenter/server/milestones.ts`
- [ ] `lib/commandcenter/server/storage.ts` *(2 hits)*
- [ ] `lib/v0/server/budget.ts`
- [ ] `lib/v0/server/rag.ts` *(de `supabase()`-helper op regel 106; PR-1 raakte alleen de orgId-params — dit is een aparte regel)*
- [ ] `lib/v0/server/log.ts` *(hot logging-pad — extra zorgvuldig smoken)*
- [ ] `lib/v0/server/threads.ts`
- [ ] `lib/v0/server/faq-snapshot.ts`
- [ ] `lib/v0/server/evals-snapshot.ts`
- [ ] `lib/v0/server/latency-snapshot.ts`
- [ ] `lib/v0/server/knowledge-gap-snapshot.ts`
- [ ] `lib/v0/crawler/credit-log.ts`
- [ ] `lib/v0/klantendashboard/server/conversations.ts`
- [ ] `lib/v0/klantendashboard/server/metrics.ts`
- [ ] `lib/v0/klantendashboard/server/top-questions.ts`
- [ ] `lib/v0/klantendashboard/server/feedback.ts`
- [ ] `lib/v0/klantendashboard/server/settings.ts`

`app/` (1):
- [ ] `app/api/v0/feedback/route.ts`

- [ ] **Step 1: Migreer in clusters, commit per cluster** (kleinere reviews, makkelijker te bisecten als een smoke faalt)

Cluster A — `lib/v0/server/*` (rag, log, threads, budget, *-snapshot):
```bash
git add lib/v0/server/
git commit -m "refactor(v0): service-role-clients in lib/v0/server via getServiceRoleClient"
```
Cluster B — `lib/v0/klantendashboard/server/*` + `lib/v0/crawler/credit-log.ts`:
```bash
git add lib/v0/klantendashboard/ lib/v0/crawler/credit-log.ts
git commit -m "refactor(v0): klantendashboard+crawler service-role-clients via fabriek"
```
Cluster C — `lib/commandcenter/server/*` + `lib/controlroom/server/db.ts`:
```bash
git add lib/commandcenter/ lib/controlroom/
git commit -m "refactor(cc): commandcenter+controlroom service-role-clients via fabriek"
```
Cluster D — `app/api/v0/feedback/route.ts`:
```bash
git add app/api/v0/feedback/route.ts
git commit -m "refactor(v0): feedback-route service-role-client via fabriek"
```

- [ ] **Step 2: Typecheck na elke cluster (of minstens aan het eind)**

Run: `npm run typecheck`
Expected: PASS. Veelvoorkomende fout: ongebruikte `createClient`/`SupabaseClient`-import na verwijdering van de lokale fabriek → haal de ongebruikte import weg.

---

### Task 8: PR-2 verificatie — inventaris groen + smoke + PR

- [ ] **Step 1: Run de inventaris-test, verifieer dat hij nu SLAAGT**

Run: `node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts`
Expected: PASS — `offenders` is leeg.

- [ ] **Step 2: Voeg de inventaris-test toe aan `test:unit`**

In `package.json` `test:unit`, voeg achteraan toe:
```
 lib/supabase/__tests__/no-adhoc-service-client.test.ts
```

- [ ] **Step 3: Volledige unit-suite + typecheck + productie-build**

Run: `npm run test:unit && npm run typecheck`
Expected: beide PASS.

Run (Windows: éérst `Remove-Item -Recurse -Force .next` — vervuilde `.next` crasht de static-gen):
```powershell
Remove-Item -Recurse -Force .next; npm run build
```
Expected: build groen.

- [ ] **Step 4: Rook de getroffen oppervlakken** (gedragsbehoudend, dus dit is de echte vangnet-stap)

Start dev: `npx next dev -p 3001`, dan met de demo-login:
- [ ] **Klantendashboard** laadt + toont metrics (`metrics.ts`, `conversations.ts`, `top-questions.ts`, `feedback.ts`, `settings.ts`).
- [ ] **Admindashboard** (`/admindashboard`) laadt (`commandcenter/*`, `controlroom/db.ts`).
- [ ] **Chat** in `/widget` of `/embed` geeft een antwoord (`rag.ts` + `log.ts` schrijven `query_log`).
- [ ] **Feedback** 👍/👎 op een antwoord komt door (`app/api/v0/feedback/route.ts`).
- [ ] **Budget-cap** intact: `npm run test:budget` (importeert `budget.ts`) draait groen.

> Als één oppervlak "Supabase env vars missing" of een lege lijst toont: een gemiste `sb()`→`getServiceRoleClient()`-vervanging of een verkeerd opgeruimde import. Bisect via de cluster-commits.

- [ ] **Step 5: Commit + PR**

```bash
git add package.json
git commit -m "test(admin): inventaris-guard in test:unit-suite"
git push -u origin feat/seb/v1-pr2-service-role
gh pr create --fill
```

Template-kernpunten voor de reviewer: (1) puur gedragsbehoudende refactor, byte-identieke client-opties; (2) één centrale fabriek = de enabler voor de V0/V1-namespace-split (kickoff §3); (3) scope = `lib/`+`app/` runtime, `scripts/` bewust buiten; (4) alle dashboard-/chat-/feedback-/budget-oppervlakken gesmoket.

**PR-2 Definition of Done:**
- [ ] Inventaris-test groen (0 offenders onder `lib/`+`app/` buiten `admin.ts`)
- [ ] `npm run typecheck` groen
- [ ] `npm run build` groen (na schone `.next`)
- [ ] `npm run test:unit` groen (incl. nieuwe inventaris-test)
- [ ] Dashboard + admindashboard + chat + feedback + budget gesmoket
- [ ] PR aangemaakt met ingevulde template

---

## Na PR-1 + PR-2 (exit van deze plan-ronde)

Beide gemerged = de "prep-first"-helft van kickoff Aanpak A is klaar. De fundament-bouw zelf (§3 V1-prod Supabase-project + namespaced fabrieken + grep-gate, §4 auth e2e) is een **aparte plan-ronde** met open execution-beslissingen (route-group-namen, env-var-naming, plek van `cc_*`/`admin_*` onder de split) — die hoort eerst opnieuw gebrainstormd/gepland te worden, niet hier ingebakken. Update `docs/handoffs/` of de memory zodra PR-1+PR-2 live zijn.

---

## Self-review (uitgevoerd bij schrijven)

- **Spec-dekking §4.1 (PR-1):** defaults 469/543/583/815 + fallback 1507 → Task 2/Task 3; org verplicht → type-change Task 3; eval-pad expliciet DEV_ORG → Task 3 Step 1; `getPersonaById(DEV_ORG_ID)` 1234/1251 bewust buiten scope (eval-persona, ander concern) → genoteerd; test → Task 1/5. ✅
- **Spec-dekking §4.2 (PR-2):** centrale fabriek → Task 6; ~20 modules inventaris → Task 7 (22 gevonden); identieke opties → canonieke transform; grep=0 DoD → inventaris-test Task 6/8; smoke → Task 8 Step 4. ✅
- **Placeholder-scan:** geen TBD/TODO; caller-fix (Task 4) is bewust compiler-gedreven met expliciete regel i.p.v. mogelijk-stale hand-lijst — gemotiveerd in-task. ✅
- **Type-consistentie:** `getServiceRoleClient(): SupabaseClient` (synchroon) consistent gebruikt in admin.ts (Task 6) en alle call-sites (Task 7). `organizationId: string` (verplicht) consistent in helpers (Task 2) en streaming-input (Task 3). ✅
