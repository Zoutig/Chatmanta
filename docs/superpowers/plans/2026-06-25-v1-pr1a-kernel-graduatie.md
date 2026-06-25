# V1 PR-1a — Kernel-graduatie (neutrale, client-geïnjecteerde `lib/rag/`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the V0 RAG retrieval/answer pipeline (`lib/v0/server/rag.ts` → `runRagQueryStreaming`) into a neutral, client-injected `lib/rag/` module — `runRagQuery(client, { orgId, chatbotId, config, persona, … })` with `orgId`+`chatbotId` mandatory — **without changing V0 behavior or V0's database**.

**Architecture:** `lib/v0/server/rag.ts` keeps an exported `runRagQueryStreaming` that becomes a **thin V0 adapter**: it injects the V0 service-role client (`getServiceRoleClient()`), the V0 persona (`getPersonaById(orgId)`), `chatbotScoped: false`, and delegates to the neutral `lib/rag/runRagQuery`. All 5 V0 callers stay unchanged. `chatbotId` is mandatory on the neutral signature; the retrieve helpers pass `p_chatbot_id` to the RPC **only when `config.chatbotScoped === true`** (V1 later), so V0's RPCs and database are never touched. Neutral helper modules move under `lib/rag/`; a CI grep-gate forbids `lib/rag/**` from importing `lib/v0/**`.

**Tech Stack:** Next.js 16, TypeScript, `@supabase/supabase-js`, OpenAI SDK (unchanged, global `OPENAI_API_KEY`), `node:test` + tsx unit tests, the existing V0 `hard-eval` (free, deterministic) as the behavior-preserving gate.

**Spec:** `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` (PR-1, kernel-graduatie-deel).

**Scope note:** This is **PR-1a** of the milestone. PR-1b (V1 migration `0002` + seed + `/v1/app` real RAG + e2e) is a separate plan that branches from `main` AFTER PR-1a merges, because it depends on `lib/rag/` existing. Ingest/cache/crawler paths (`ingestText`, `purgeAnswerCache`, `writeCachedAnswer`/`lookupCachedAnswer`) keep using the V0 service-role client in-module this round; they are not part of the neutral read path and move in PR-2/PR-3.

---

## File Structure

**New (`lib/rag/`, neutral — imports nothing from `lib/v0/**`):**
- `lib/rag/types.ts` — `RagConfig`, `RagPersona`, and the shared response/stream types the engine emits (moved from `rag.ts`). `RagConfig` = the moved `BotConfig` shape **plus** `chatbotScoped: boolean`.
- `lib/rag/run-rag-query.ts` — the neutral engine: `runRagQuery(client, input)` (the relocated `runRagQueryStreaming` body) + its module-internal helpers (`retrieveChunks`, `retrieveChunksHybrid`, `lookupCachedAnswer`, `writeCachedAnswer`, `hydrateParentContent`, `embedTexts`, `chatComplete`, the `openai()` singleton, `toSource`, etc.).
- `lib/rag/persona.ts` — the **pure** persona helpers moved from `lib/v0/server/persona.ts`: `renderPersonaTemplate`, `composeBotPrompts`, `buildGeneralClosingStripRegex`, and the `RagPersona` type (was `OrgPersona`). NOT `getPersonaById` (V0 data — stays in V0).
- `lib/rag/rag-decision.ts`, `lib/rag/reclassify.ts`, `lib/rag/claims.ts`, `lib/rag/history-entities.ts`, `lib/rag/manual-qa.ts`, `lib/rag/source-links.ts`, `lib/rag/hard-facts.ts`, `lib/rag/hard-eval-checks.ts`, `lib/rag/preprocess-parse.ts`, `lib/rag/style.ts`, `lib/rag/style-types.ts` — pure helper modules moved verbatim (import paths fixed).
- `lib/rag/__tests__/rag-config-type.test.ts` — a small compile/shape test for `RagConfig`/`RagPersona`.

**Modified:**
- `lib/v0/server/rag.ts` — becomes the V0 adapter: keeps `runRagQueryStreaming(input)` exported (signature unchanged), delegates to `lib/rag/run-rag-query`, supplies V0 client/persona/`chatbotScoped:false`. Keeps the V0-only exports that don't move (`DEV_ORG_ID`, `ingestText`/`ingestCrawlResults`, `purgeAnswerCache`, `V0_RAG_DEFAULTS`, `FALLBACK_MESSAGE`, type re-exports for back-compat).
- `lib/v0/server/bots.ts` — `BotConfig` becomes `RagConfig` (imported from `lib/rag/types`) extended with V0 specifics if any; re-export `BotConfig` for back-compat. Each bot version object gains `chatbotScoped: false`.
- `lib/v0/server/persona.ts` — `getPersonaById` stays, now returns `RagPersona` (imported from `lib/rag/persona`); re-export `OrgPersona = RagPersona` for back-compat.
- Any V0 module importing the moved helpers (e.g. `eval.ts`, `klantendashboard/*`, `app/api/v0/chat/route.ts`) — import paths repointed to `lib/rag/*` where the symbol moved; typecheck is the checklist.
- `lib/supabase/__tests__/no-adhoc-service-client.test.ts` — add the `lib/rag/**` ⊄ `lib/v0/**` boundary test.

**The 5 V0 callers of `runRagQueryStreaming` — UNCHANGED** (they keep calling the V0 adapter): `app/api/v0/chat/route.ts:393`, `app/klantendashboard/test/actions.ts:64`, `lib/v0/server/eval.ts:863`, `scripts/v0-test-org-isolation.ts:63`, `scripts/v0-hard-eval-run.ts:146`.

---

## Task 0: Worktree prep + behavior baseline

**Files:** none committed (env + baseline artifact).

- [ ] **Step 1: Install deps in the worktree**

Run: `npm ci`
Expected: completes; `node_modules/` present (Turbopack/tsx need a real install per worktree — memory `worktree_node_modules_turbopack`).

- [ ] **Step 2: Copy env into the worktree**

Copy the main-repo `.env.local` into this worktree root (gitignored; the V0_/V1_/OPENAI keys are needed for typecheck-free scripts + the hard-eval). PowerShell: `Copy-Item ..\chatmanta\.env.local .\.env.local`. Verify `OPENAI_API_KEY`, `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY` are present and uncommented (memory `feedback_worktree_env_keys`).

- [ ] **Step 3: Capture the pre-refactor V0 behavior baseline**

Run the free deterministic hard-eval on the LATEST V0 version and save the result as the baseline to diff against after the refactor:
Run: `npm run eval:hard:run -- --versions=v0.10 > ../v0-hardeval-baseline-pre.txt 2>&1` (adjust `--versions` to the current LATEST; memory `eval_cache_and_run_gotchas` — hard-eval does NOT use the answer-cache, judge = Claude Code, $0).
Expected: a verdict table is written. This file is the golden baseline; the refactor must reproduce it byte-for-content.

- [ ] **Step 4: Green starting point**

Run: `npm run typecheck && npm run test:unit`
Expected: both green (the inherited `main` state). If not, STOP — fix or report before refactoring.

---

## Task 1: Neutral `RagConfig` + `RagPersona` types in `lib/rag/`

**Files:**
- Create: `lib/rag/types.ts`
- Create: `lib/rag/__tests__/rag-config-type.test.ts`
- Modify: `lib/v0/server/bots.ts`

- [ ] **Step 1: Write the failing type/shape test** `lib/rag/__tests__/rag-config-type.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RagConfig, RagPersona } from '../types';

// Compile-time + shape guard: RagConfig must carry the chatbot-scoping flag and
// the retrieval knobs the engine reads. If a field the engine needs is dropped
// from RagConfig, this object literal stops compiling.
test('RagConfig carries the engine knobs + chatbotScoped', () => {
  const cfg: Pick<RagConfig, 'chatbotScoped' | 'similarityThreshold' | 'hybridSearch' | 'parentDocumentRetrieval' | 'chatModel'> = {
    chatbotScoped: false,
    similarityThreshold: 0.4,
    hybridSearch: false,
    parentDocumentRetrieval: true,
    chatModel: 'gpt-4o-mini',
  };
  assert.equal(cfg.chatbotScoped, false);
  assert.equal(cfg.similarityThreshold, 0.4);
});

test('RagPersona carries the rendered identity fields', () => {
  const p: Pick<RagPersona, 'generalKnowledgeClosing'> = { generalKnowledgeClosing: 'x' };
  assert.equal(typeof p.generalKnowledgeClosing, 'string');
});
```

- [ ] **Step 2: Run → expect FAIL** (module `../types` does not exist yet)

Run: `node --import tsx --test lib/rag/__tests__/rag-config-type.test.ts`
Expected: FAIL — cannot find `../types`.

- [ ] **Step 3: Create `lib/rag/types.ts`**

Move the **entire `BotConfig` type definition** out of `lib/v0/server/bots.ts:18…` into `lib/rag/types.ts`, renamed `RagConfig`, and **add one field**: `chatbotScoped: boolean;` (doc: "if true, retrieval RPCs receive `p_chatbot_id` and the DB scopes by chatbot — V1; if false, single-bot/V0, the param is omitted so the V0 RPCs stay unchanged"). Also move the `OrgPersona` type here renamed `RagPersona`, and the engine's shared response/stream types that the public signature exposes (`ChatResponse`, `ChatSource`, `StreamEvent`, `ChatHistoryTurn`, `HydeModeRequest`, `HydeModeResolved`, `ManualQA`, `ChatbotPromptOverrides`, `Tone`, `Length`) — move or re-export them from here so `lib/rag/` owns its public types and imports none of them from `lib/v0/**`.

> Implementation detail: keep the field set of `RagConfig` byte-identical to the old `BotConfig` (plus `chatbotScoped`). Do NOT prune fields — typecheck across the engine is the completeness check.

- [ ] **Step 4: Repoint `bots.ts` at the neutral type**

In `lib/v0/server/bots.ts`: `import type { RagConfig } from '@/lib/rag/types';` and `export type BotConfig = RagConfig;` (back-compat alias). Add `chatbotScoped: false,` to every bot-version object literal (V0 is single-bot). 

- [ ] **Step 5: Run the type test → expect PASS**

Run: `node --import tsx --test lib/rag/__tests__/rag-config-type.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: green. (Every `bot.X` read in `rag.ts` still resolves because `BotConfig = RagConfig`. Any bot-version object missing `chatbotScoped` surfaces here.)

- [ ] **Step 7: Commit**

```bash
git add lib/rag/types.ts lib/rag/__tests__/rag-config-type.test.ts lib/v0/server/bots.ts
git commit -m "feat(rag): neutrale RagConfig/RagPersona-types in lib/rag (+ chatbotScoped)"
```

---

## Task 2: Move the pure helper modules to `lib/rag/`

**Files:**
- Create (move): `lib/rag/persona.ts`, `lib/rag/preprocess-parse.ts`, `lib/rag/style.ts`, `lib/rag/style-types.ts`, `lib/rag/hard-facts.ts`, `lib/rag/hard-eval-checks.ts`, `lib/rag/source-links.ts`, `lib/rag/manual-qa.ts`, `lib/rag/rag-decision.ts`, `lib/rag/reclassify.ts`, `lib/rag/claims.ts`, `lib/rag/history-entities.ts`
- Modify: `lib/v0/server/persona.ts` (keep `getPersonaById` only), and every importer of a moved symbol.

- [ ] **Step 1: Move the persona RENDERING + type, keep `getPersonaById` in V0**

`git mv lib/v0/server/persona.ts lib/rag/persona.ts`, then in `lib/rag/persona.ts` **remove** `getPersonaById` (and any V0-org-registry data) and rename the exported `OrgPersona` → `RagPersona` (re-export the rendering helpers `renderPersonaTemplate`, `composeBotPrompts`, `buildGeneralClosingStripRegex`). Create a NEW `lib/v0/server/persona.ts` that imports `RagPersona` + the renderers from `@/lib/rag/persona`, **keeps `getPersonaById(orgId): RagPersona`** (the V0 registry lookup with its DEV_ORG fallback), and re-exports `export type OrgPersona = RagPersona;` + the renderers for back-compat.

- [ ] **Step 2: Move the remaining pure modules**

For each of `preprocess-parse`, `hard-facts`, `hard-eval-checks`, `source-links`, `manual-qa`, `rag-decision`, `reclassify`, `claims`, `history-entities`, and the style files (`lib/v0/style.ts` → `lib/rag/style.ts`, `lib/v0/style-types.ts` → `lib/rag/style-types.ts`): `git mv` into `lib/rag/`, then fix their internal import paths (relative imports to other moved modules become `./…` within `lib/rag/`; imports of `RagConfig`/`RagPersona` come from `@/lib/rag/types`/`@/lib/rag/persona`; neutral infra like `@/lib/ai/llm`, `@/lib/errors/app-error` stay).

> If a "pure" module turns out to import something from `lib/v0/**` (e.g. a klantendashboard type), move that type into `lib/rag/types.ts` too, or thread it as a parameter. The grep-gate (Task 6) + typecheck enforce zero `lib/v0` imports from `lib/rag/`.

- [ ] **Step 3: Repoint every importer of a moved symbol**

Run: `npm run typecheck`
Expected: a list of broken imports (modules that imported `@/lib/v0/server/persona`, `@/lib/v0/server/source-links`, `@/lib/v0/style`, etc.). For each, repoint to the new `@/lib/rag/*` path. Re-run until green. (Known importers beyond `rag.ts`: `eval.ts`, `klantendashboard/server/*`, `app/api/v0/chat/route.ts`, the hard-eval scripts — let typecheck drive.)

- [ ] **Step 4: Unit tests for moved modules still pass**

Run: `npm run test:unit`
Expected: green (any `__tests__` that moved with a module had its import path fixed in Step 2/3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(rag): verplaats pure RAG-helpers naar lib/rag (persona-rendering, claims, reclassify, source-links, hard-facts, style, ...)"
```

---

## Task 3: Relocate the engine to `lib/rag/run-rag-query.ts` + client/persona/chatbotId injection

**Files:**
- Create: `lib/rag/run-rag-query.ts` (the relocated engine)
- Modify: `lib/v0/server/rag.ts` (becomes the V0 adapter)

- [ ] **Step 1: Create `lib/rag/run-rag-query.ts` from the engine body**

Move into it from `lib/v0/server/rag.ts`: the `openai()` singleton (`:97`), `embedTexts`, `chatComplete`, `retrieveChunks` (`:809`), `retrieveChunksHybrid` (`:422`), `lookupCachedAnswer` (`:500`), `writeCachedAnswer` (`:541`), `hydrateParentContent` (`:855`), `toSource`, `generateMultiQueries`, `generateHydeDocument`, `rerankChunks`, `generateFollowUps`, the type defs `RawChunk`/`RetrievedChunk`, and the generator `runRagQueryStreaming` body (`:1275`–`:2959`) **renamed `runRagQuery`**. Import `RagConfig`/`RagPersona` + shared types from `@/lib/rag/types`, persona renderers from `@/lib/rag/persona`, and the moved helpers from `./…`. Keep `import 'server-only';`.

- [ ] **Step 2: Change the engine signature to client + injected identity**

New public signature (replaces the old `input`-only generator):
```ts
export async function* runRagQuery(
  client: SupabaseClient,
  input: {
    question: string;
    threshold: number;
    enableRewrite: boolean;
    config: RagConfig;            // was `bot: BotConfig`
    persona: RagPersona;          // was getPersonaById(orgId) internally
    organizationId: string;       // mandatory
    chatbotId: string;            // mandatory (NEW)
    history?: ChatHistoryTurn[];
    tone?: Tone; length?: Length;
    disableCache?: boolean;
    includeFullParentContent?: boolean;
    hydeModeOverride?: HydeModeRequest;
    enableGeneralKnowledge?: boolean;
    manualQAItems?: ManualQA[];
    chatbotOverrides?: ChatbotPromptOverrides;
  }
): AsyncGenerator<StreamEvent, void, void> {
  const { threshold, enableRewrite, config: bot } = input;   // alias `bot` = config → minimal body diff
  const persona = input.persona;                             // was: getPersonaById(orgId)
  const chatbotId = input.chatbotId;
  // ...rest of the body unchanged, except retrieval calls below...
```
> Using `const { config: bot } = input` keeps every `bot.X` read in the 1600-line body unchanged — the only edits are the signature, the `persona` line (drop `getPersonaById`), and the retrieval-helper calls (Step 3). This is the minimal-diff path.

- [ ] **Step 3: Thread `client` + `chatbotId`/`chatbotScoped` into the retrieval/cache helpers**

Change the helper signatures to take the injected `client` and (for retrieval) the chatbot scope, and build the RPC params conditionally:
```ts
async function retrieveChunks(
  client: SupabaseClient, queryVector: number[], topK: number,
  withParents: boolean, organizationId: string,
  chatbotId: string, chatbotScoped: boolean,
): Promise<RetrievedChunk[]> {
  const rpcName = withParents ? 'match_chunks_with_parents' : 'match_chunks';
  const { data, error } = await client.rpc(rpcName, {
    p_organization_id: organizationId,
    query_embedding: queryVector,
    match_count: topK,
    ...(chatbotScoped ? { p_chatbot_id: chatbotId } : {}),  // V0: omitted → RPC unchanged
  });
  // ...rest unchanged, but use `client` (not getServiceRoleClient()) for the
  //    documents-hydrate query below...
}
```
Apply the same pattern to `retrieveChunksHybrid` (add `p_chatbot_id` to the `match_chunks_hybrid` call when scoped; pass `client`), `lookupCachedAnswer(client, …)`, `writeCachedAnswer(client, …)`, `hydrateParentContent(client, …)`. **Remove every bare `getServiceRoleClient()` call** from these helpers (there is no `getServiceRoleClient` import in `lib/rag/` — the grep-gate forbids it). Update the call sites inside the generator to pass `client`, `chatbotId`, `config.chatbotScoped` (retrieval stage `:1738-1748` + the selective-HyDE retrieve `:1804`).

- [ ] **Step 4: Rewrite `lib/v0/server/rag.ts` as the V0 adapter**

Replace the moved engine code with a thin adapter that preserves the public `runRagQueryStreaming(input)` API exactly:
```ts
import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { getPersonaById } from './persona';
import { runRagQuery } from '@/lib/rag/run-rag-query';
import type { BotConfig } from './bots';
// ...keep DEV_ORG_ID, V0_RAG_DEFAULTS, FALLBACK_MESSAGE, ingestText/ingestCrawlResults,
//    purgeAnswerCache (these stay V0 + keep using getServiceRoleClient in-module)...

export async function* runRagQueryStreaming(input: {
  question: string; threshold: number; enableRewrite: boolean; bot: BotConfig;
  history?; tone?; length?; organizationId: string; disableCache?: boolean;
  includeFullParentContent?: boolean; hydeModeOverride?; enableGeneralKnowledge?: boolean;
  manualQAItems?; chatbotOverrides?;
}) {
  // V0 adapter: inject the V0 service-role client + V0 persona; single-bot → not chatbot-scoped.
  yield* runRagQuery(getServiceRoleClient(), {
    ...input,
    config: { ...input.bot, chatbotScoped: false },
    persona: getPersonaById(input.organizationId),
    chatbotId: input.organizationId,   // sentinel: V0 single-bot, omitted from RPC (chatbotScoped:false)
  });
}
```
Keep re-exporting any types the 5 callers import from `@/lib/v0/server/rag` (e.g. `ChatResponse`, `ChatSource`, `RetrievedChunk`) via `export type { … } from '@/lib/rag/types';` / `from '@/lib/rag/run-rag-query';`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: green. The 5 callers compile unchanged (they still call `runRagQueryStreaming(input)` with `bot:`). Fix any straggler import of a moved type.

- [ ] **Step 6: Build (clean) — catches server-only / client-bundle chain breaks**

Run (PowerShell): `Remove-Item -Recurse -Force .next; npm run build`
Expected: success. (Memory `windows_next_build_dirty_next_crash` — always clear `.next` first. The PR-2-fundament landmine was a hidden `next/*` import chain; a clean build + Task 0's scripts are the guard.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(rag): graduate engine naar lib/rag/run-rag-query (client+persona+chatbotId geinjecteerd); V0 rag.ts = adapter"
```

---

## Task 4: Prove V0 behavior is byte-for-content identical

**Files:** none (verification only).

- [ ] **Step 1: Re-run the hard-eval on the same version**

Run: `npm run eval:hard:run -- --versions=v0.10 > ../v0-hardeval-after.txt 2>&1` (same version as Task 0 Step 3).
Expected: completes.

- [ ] **Step 2: Diff against the baseline**

Run (PowerShell): `Compare-Object (Get-Content ..\v0-hardeval-baseline-pre.txt) (Get-Content ..\v0-hardeval-after.txt)`
Expected: **no differences** in the verdict table / per-case outcomes. (Token counts / latency lines may differ run-to-run; the per-case PASS/FAIL verdicts and the answers must match. If a verdict flips, the refactor changed behavior — STOP and bisect with `superpowers:systematic-debugging`; do NOT proceed.)

- [ ] **Step 3: Live smoke against the V0 demo org**

Run: `npm run v0:chat -- --org acme-corp --q "Wat zijn de openingstijden?"` (any seeded org/question; memory `feedback_autonomous_build_no_signoff_skill` — the worktree has `.env.local` from Task 0 Step 2).
Expected: a grounded answer streams, no exceptions, same shape as before the refactor.

- [ ] **Step 4: Commit the verification note** (optional, in the PR body — no code change). Record "hard-eval identical pre/post" for the reviewer.

---

## Task 5: Extend the grep-gate — `lib/rag/**` must not import `lib/v0/**`

**Files:**
- Modify: `lib/supabase/__tests__/no-adhoc-service-client.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append to the test file (reuse its existing `walk()` + `repoRoot` helpers):
```ts
test('lib/rag is neutraal — importeert niets uit lib/v0', () => {
  const v0Import = /from ['"]@\/lib\/v0\//;
  const offenders: string[] = [];
  for (const file of walk(join(repoRoot, 'lib', 'rag'))) {
    const src = readFileSync(file, 'utf8');
    if (v0Import.test(src)) offenders.push(relative(repoRoot, file));
  }
  assert.deepEqual(offenders, [], `lib/rag importeert uit lib/v0 (graduatie lek):\n${offenders.join('\n')}`);
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
```

- [ ] **Step 2: Run → expect PASS** (Task 2/3 already removed all `lib/v0`/service-role imports from `lib/rag`)

Run: `node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts`
Expected: PASS. If it FAILS, a moved module still imports `lib/v0` or a factory — fix the import (move the dependency into `lib/rag` or inject it) until green. This test failing IS the gate doing its job.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/__tests__/no-adhoc-service-client.test.ts
git commit -m "test(rag): grep-gate dwingt lib/rag-neutraliteit af (geen lib/v0- of factory-imports)"
```

---

## Task 6: Tidy the stale `lib/auth.ts` comment (reviewer NIT)

**Files:**
- Modify: `lib/auth.ts:10-12`

- [ ] **Step 1: Align the service-role pointer**

In `lib/auth.ts` the comment (`:10-12`) says privileged service-role work uses `lib/supabase/admin.ts`. Update it to note the V1 service-role factory (`lib/supabase/v1/service-role.ts`) is the V1 path; `admin.ts` hosts the auth-gated wrappers. (Comment-only; no behavior change.)

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: green.
```bash
git add lib/auth.ts
git commit -m "docs(auth): comment uitgelijnd op V1-service-role-factory"
```

---

## Task 7: Full gate + open PR-1a

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run test:unit && (Remove-Item -Recurse -Force .next; npm run build)`
Expected: all green; grep-gate (incl. the new `lib/rag` neutrality tests) green.

- [ ] **Step 2: Confirm branch + push**

Run:
```bash
git rev-parse --abbrev-ref HEAD   # expect feat/seb/v1-kernel
git push -u origin feat/seb/v1-kernel
```

- [ ] **Step 3: Open PR-1a** with `gh pr create` using the template. Title: `feat(v1): kernel-graduatie — neutrale client-geinjecteerde lib/rag (PR-1a)`. Body: V0 behaviour proven identical (hard-eval diff), V0 DB untouched (chatbotScoped:false → no `p_chatbot_id`), all 5 V0 callers unchanged, grep-gate now guards `lib/rag` neutrality. Note PR-1b (V1 migration + seed + `/v1/app` RAG + e2e) follows from merged `main`.

- [ ] **Step 4: Review loop** — run `chatmanta-reviewer` on the branch diff + a local `/code-review`; address findings (expect ~1-2 false positives — verify before fixing, memory). Merge only after green + your sign-off.

---

## Definition of Done (PR-1a)

- [ ] `lib/rag/runRagQuery(client, { orgId, chatbotId, config, persona, … })` exists, neutral, with `orgId`+`chatbotId` mandatory.
- [ ] `lib/v0/server/rag.ts` is a thin V0 adapter; all 5 V0 callers unchanged.
- [ ] V0 behavior proven identical (hard-eval baseline diff empty + live smoke).
- [ ] V0 database untouched (no V0 migration; `p_chatbot_id` omitted when `chatbotScoped:false`).
- [ ] Grep-gate forbids `lib/rag/**` → `lib/v0/**` and direct factory imports; green in CI (`test:unit`).
- [ ] `typecheck` + `build` green.

## Verification summary

1. `npm run typecheck` — clean.
2. `npm run test:unit` — RagConfig type-test + the two `lib/rag`-neutrality gate tests + existing suite green.
3. `Remove-Item -Recurse -Force .next; npm run build` — clean (no hidden `next/*` chain break).
4. `npm run eval:hard:run -- --versions=<LATEST>` — verdicts identical to the Task 0 baseline.
5. `npm run v0:chat -- --org <slug> --q "<vraag>"` — grounded answer, unchanged.

---

## Self-review (writing-plans)

- **Spec coverage:** kernel → neutral `lib/rag/` (Task 1-3) ✓; client-injected (Task 3) ✓; config+persona injected — dependency injection (Task 1-3) ✓; `chatbotId` mandatory + non-optional (Task 3 signature) ✓; V0 keeps working via thin adapter, test-first/behavior-preserving (Task 3-4) ✓; grep-gate neutrality (Task 5) ✓; `auth.ts` comment NIT (Task 6) ✓. **Deferred to PR-1b (by design):** V1 migration `0002`, seed, `/v1/app` real RAG, e2e, the `p_chatbot_id` RPC predicate (lives in the V1 migration, exercised only when `chatbotScoped:true`).
- **chatbotId-without-V0-migration:** the `chatbotScoped` flag (Task 1 Step 3 / Task 3 Step 3) keeps V0's RPCs and DB byte-identical while the kernel signature mandates `chatbotId` — consistent throughout.
- **Type consistency:** `RagConfig` (with `chatbotScoped`), `RagPersona`, `runRagQuery(client, input)` used identically in Tasks 1, 3, 5. `BotConfig = RagConfig` and `OrgPersona = RagPersona` back-compat aliases keep V0 callers compiling.
- **Placeholder scan:** the "let typecheck drive which importers to repoint" steps (Task 2 Step 3, Task 3 Step 5) are a deliberate mechanical-discovery instruction for a large refactor, not a placeholder — the gate (typecheck green) is concrete.
