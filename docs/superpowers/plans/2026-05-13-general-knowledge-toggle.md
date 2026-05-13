# General-Knowledge Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-session UI toggle in `SettingsView` that lets the user disable the v0.5 zero-hits reclassify-LLM path, falling through to the existing static `FALLBACK_MESSAGE`.

**Architecture:** UI state in `chat-shell`, in-memory, default = `bot.generalKnowledgeEnabled`. Passed as `enableGeneralKnowledge` body field to `/api/v0/chat`. `rag.ts` gates the existing reclassify branch on `bot.generalKnowledgeEnabled && enableGeneralKnowledge`. New nullable `query_log.general_knowledge_actual` column records the effective gate outcome. Toggle disabled on bots where `bot.generalKnowledgeEnabled=false`.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase Postgres, Playwright (E2E only — no Vitest unit infra for `rag.ts`).

**Worktree:** `../chatmanta-general-toggle` on branch `feat/seb/general-toggle`. **All commands below assume you are running from inside that worktree** (cd into it first; do NOT run from the main repo cwd).

**Spec:** `docs/superpowers/specs/2026-05-13-general-knowledge-toggle-design.md`.

---

## Task 1: Add `query_log.general_knowledge_actual` column

**Files:**
- Create: `supabase/migrations/<NNNN>_v0_general_knowledge_logging.sql` (number determined by `check-migration` skill)

- [ ] **Step 1: Determine the next safe migration number**

Invoke the `check-migration` skill. It reports both the highest local migration and any pending PRs that claim a number. Use whatever number it returns.

Expected output: a single safe integer (e.g., `0019`). The latest local migration at design-time is `0018_v0_request_id.sql`, so the most likely value is `0019` unless another branch beat us.

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/<NNNN>_v0_general_knowledge_logging.sql` with this content:

```sql
-- v0.5 general-knowledge toggle telemetry.
-- Nullable boolean: true = reclassify path ran, false = gated off, null = path not reached
-- (smalltalk, non-zero-hits answer, or legacy pre-migration rows).
ALTER TABLE query_log
  ADD COLUMN general_knowledge_actual boolean;

COMMENT ON COLUMN query_log.general_knowledge_actual IS
  'v0.5 general-knowledge gate outcome. true = reclassify ran; false = gated off via UI toggle or bot config; null = zero-hits path not reached.';
```

No RLS change (existing `query_log` policies cover all columns). No index (low cardinality, eval filters by `bot_version` first).

- [ ] **Step 3: Apply the migration locally**

Run: `npm run migrate`
Expected: migration applied, `migrate:status` afterwards shows the new file in the applied list.

- [ ] **Step 4: Verify the column exists**

Run via your Supabase SQL tooling or psql:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'query_log' AND column_name = 'general_knowledge_actual';
```
Expected: one row, `data_type=boolean`, `is_nullable=YES`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<NNNN>_v0_general_knowledge_logging.sql
git commit -m "feat(db): add query_log.general_knowledge_actual column"
```

---

## Task 2: Extend `rag.ts` input type, gate, and response field

**Files:**
- Modify: `lib/v0/server/rag.ts` (input type ~1266-1281, gate at ~1595, all `ChatResponse` construction sites)

- [ ] **Step 1: Add `enableGeneralKnowledge` to the `runRagQueryStreaming` input**

Open `lib/v0/server/rag.ts`. Find the `runRagQueryStreaming` function signature (around line 1266). Add a new optional input field. Locate this block:

```ts
export async function* runRagQueryStreaming(input: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  bot: BotConfig;
  history?: ChatHistoryTurn[];
  tone?: Tone;
  length?: Length;
  /** v0.4 multi-org: scope retrieval+cache naar deze org. Default DEV_ORG. */
  organizationId?: string;
  /**
   * Per-query HyDE-modus override (v0.5 evaluatie-toggle). 'auto' of undefined
   * = volg bot-config. Override wint altijd, ook over bots met useHyDE=false.
   */
  hydeModeOverride?: HydeModeRequest;
}): AsyncGenerator<StreamEvent, void, void> {
```

Add the new field after `hydeModeOverride`:

```ts
  /**
   * v0.5: per-query override voor general-knowledge reclassify-pad. Default true
   * — gated combined with bot.generalKnowledgeEnabled. UI-toggle (SettingsView)
   * stuurt false om de extra LLM-call bij zero-hits over te slaan en direct naar
   * FALLBACK_MESSAGE te gaan.
   */
  enableGeneralKnowledge?: boolean;
```

- [ ] **Step 2: Compute the effective gate value at the top of the function**

Right after the existing line `const hydeModeRequested: HydeModeRequest = input.hydeModeOverride ?? 'auto';` (~line 1286), add:

```ts
  // v0.5 general-knowledge toggle: gate combined with bot config. Default true
  // for backwards-compat (older clients/scripts without the field).
  const enableGeneralKnowledge = input.enableGeneralKnowledge !== false;
  const generalKnowledgeActive = bot.generalKnowledgeEnabled && enableGeneralKnowledge;
```

- [ ] **Step 3: Wire the gate into the zero-hits branch**

Find the existing gate (line 1595): `if (bot.generalKnowledgeEnabled) {`
Replace with: `if (generalKnowledgeActive) {`

Replace the comment block directly above to reflect both conditions:

```ts
    // V0.5: tweede-stage re-classifier wanneer bot.generalKnowledgeEnabled
    // EN de UI-toggle aan staat. We weten nu dat retrieval géén relevante
    // chunks gaf — de vraag is dus ofwel algemene kennis binnen het domein
    // (GENERAL) of buiten het domein (OFF_TOPIC) of een specifiek detail dat
    // we eerlijk niet kennen (FALLBACK).
    //
    // Bij !generalKnowledgeActive (v0.1-v0.4, of v0.5 met toggle-uit)
    // gedragen we ons exact zoals v0.1-v0.4: vaste FALLBACK_MESSAGE, geen
    // LLM-call.
```

- [ ] **Step 4: Add `generalKnowledgeActual` to the `ChatResponse` type**

Find the `ChatResponse` type declaration in `rag.ts` (grep for `export type ChatResponse`). For each variant of the discriminated union that has `kind: 'answer'` or `kind: 'fallback'`, add the field:

```ts
  /**
   * v0.5: gate-outcome voor het zero-hits reclassify-pad. true = pad mocht
   * draaien; false = pad geskipt (bot doesn't support OR user toggle off).
   * null voor smalltalk en non-zero-hits answers (pad niet bereikt).
   */
  generalKnowledgeActual: boolean | null;
```

For the `kind: 'smalltalk'` variant: add the same field but document that it's always `null`.

- [ ] **Step 5: Populate `generalKnowledgeActual` at every `ChatResponse` construction site**

There are multiple `ChatResponse` literals built inside `rag.ts`. Find each one (grep for `kind: 'answer'`, `kind: 'fallback'`, `kind: 'smalltalk'` inside `rag.ts`). For each:

- **Smalltalk response** (~line 1370): add `generalKnowledgeActual: null,`
- **Cache-hit answer**: add `generalKnowledgeActual: null,` (cache hits never go through the zero-hits branch)
- **Regular answer** (chunks-found path): add `generalKnowledgeActual: null,`
- **General-knowledge answer** (~line 1707, after reclassify succeeded): add `generalKnowledgeActual: true,`
- **Off-topic refusal** (in handleOffTopic): add `generalKnowledgeActual: true,` (reclassify ran)
- **Reclassify→fallback** (when rc.category === 'fallback'): add `generalKnowledgeActual: true,`
- **Zero-hits fallback** (the `else` of the new gate — both pre-v0.5 bots and toggle-off): add `generalKnowledgeActual: false,`

The pattern: `true` whenever reclassify executed, `false` whenever we hit the zero-hits branch but skipped reclassify, `null` everywhere else.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors related to `generalKnowledgeActual`. If TS complains about missing the field in object literals, you missed a construction site — add it.

- [ ] **Step 7: Commit**

```bash
git add lib/v0/server/rag.ts
git commit -m "feat(rag): gate v0.5 reclassify path on enableGeneralKnowledge input"
```

---

## Task 3: Extend `log.ts` to write `general_knowledge_actual`

**Files:**
- Modify: `lib/v0/server/log.ts` (`logQuery` function + any internal types)

- [ ] **Step 1: Read the current `logQuery` insert site**

Open `lib/v0/server/log.ts`. Find the `INSERT INTO query_log` call (search for `query_log`). Note the existing column list and the value-bindings pattern.

- [ ] **Step 2: Add the column to the insert**

In the column list, add `general_knowledge_actual` in the same position as `hyde_mode_actual` (alphabetical or wherever the existing pattern places it).

In the values bindings, add the value: derive it from `response`. Use a type-narrowed access:

```ts
const generalKnowledgeActual =
  response.kind === 'smalltalk' ? null : response.generalKnowledgeActual ?? null;
```

Then pass `generalKnowledgeActual` in the binding array at the matching position.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke-test that an insert still works**

This requires the dev server. In one terminal:
```bash
npm run dev
```

In another terminal, send any chat request via the running v0:chat script:
```bash
npm run v0:chat -- --question "hoi"
```

Expected: command completes without error. No insert-time SQL error in the dev-server log.

If you see `column "general_knowledge_actual" does not exist`, the migration from Task 1 was not applied to this DB. Re-run `npm run migrate`.

- [ ] **Step 5: Verify a row was logged with the new column**

Via Supabase SQL:
```sql
SELECT id, bot_version, kind, general_knowledge_actual
FROM query_log
ORDER BY created_at DESC
LIMIT 3;
```
Expected: the most recent rows show `null` in `general_knowledge_actual` (smalltalk path, or any non-zero-hits answer).

- [ ] **Step 6: Commit**

```bash
git add lib/v0/server/log.ts
git commit -m "feat(log): persist general_knowledge_actual on query_log insert"
```

---

## Task 4: Wire `enableGeneralKnowledge` through the chat route

**Files:**
- Modify: `app/api/v0/chat/route.ts`

- [ ] **Step 1: Add the field to the request `Body` type**

In `app/api/v0/chat/route.ts`, find the `type Body = { ... }` declaration (~line 34). Add a new line:

```ts
  enableGeneralKnowledge?: unknown;
```

- [ ] **Step 2: Parse the field, defaulting to true**

Find the parsing block (the lines that set `const enableRewrite`, `const version`, `const history`). Add directly after `const enableRewrite = body.enableRewrite !== false;`:

```ts
  const enableGeneralKnowledge = body.enableGeneralKnowledge !== false;
```

- [ ] **Step 3: Pass it into `runRagQueryStreaming`**

Find the `runRagQueryStreaming({ ... })` call (~line 175). Add the field to the argument object:

```ts
  const generator = runRagQueryStreaming({
    question,
    threshold,
    enableRewrite,
    enableGeneralKnowledge,
    bot,
    history,
    tone,
    length,
    organizationId,
    hydeModeOverride: hydeModeRequested,
  });
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Smoke-test the route end-to-end with the field**

With `npm run dev` running, curl the route:
```bash
curl -X POST http://localhost:3000/api/v0/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: v0_auth=$(grep V0_DEMO_PASSWORD .env.local | cut -d= -f2)" \
  -d '{"question":"wat is iets compleet onbekends xyz123","version":"v0.5","enableGeneralKnowledge":false}'
```

Expected (NDJSON stream): the final event is `{"kind":"fallback","response":{...,"answer":"...FALLBACK...","generalKnowledgeActual":false}}`. **No** reclassify-LLM-call should occur (you can confirm by watching the dev-server log — no `[reclassify]` log line).

Then re-run with `"enableGeneralKnowledge":true`:
- Expected: reclassify runs, you get either a general-knowledge answer (with disclaimer) or off-topic refusal, and `generalKnowledgeActual:true`.

- [ ] **Step 6: Commit**

```bash
git add app/api/v0/chat/route.ts
git commit -m "feat(api): accept enableGeneralKnowledge body field on /api/v0/chat"
```

---

## Task 5: Plumb the toggle state through `page.tsx` and `chat-shell`

**Files:**
- Modify: `app/page.tsx` (`botFlags` prop)
- Modify: `app/components/chat-shell.tsx` (state, body field, prop pass-through)

- [ ] **Step 1: Extend `botFlags` in `app/page.tsx`**

Open `app/page.tsx`. Find where `botFlags` is constructed (search for `cacheEnabled`). Add a new key:

```ts
  botFlags={{
    cacheEnabled: bot.cacheEnabled,
    selfReflect: bot.selfReflect,
    cascadeOnLowConfidence: bot.cascadeOnLowConfidence,
    cascadeModel: bot.cascadeModel,
    generalKnowledgeEnabled: bot.generalKnowledgeEnabled,
  }}
```

- [ ] **Step 2: Extend the `BotFlags` type**

Open `app/components/chat-shell.tsx`. Find the `BotFlags` type (or wherever the shape is declared — likely inline in the component's props or in a sibling type file). Add `generalKnowledgeEnabled: boolean;`.

If `BotFlags` is declared in `settings-view.tsx` instead, update it there and re-import. Match the existing layout pattern.

- [ ] **Step 3: Add `generalKnowledgeOn` state in `chat-shell`**

Near the existing `const [rewriteOn, setRewriteOn] = useState(defaultEnableRewrite);` (line 96), add:

```ts
  const [generalKnowledgeOn, setGeneralKnowledgeOn] = useState(botFlags.generalKnowledgeEnabled);
```

Initial value = bot's default; switching bot-version triggers a page-level re-render (via `router.push('/?v=...')`), so this re-initializes naturally.

- [ ] **Step 4: Add `generalKnowledgeOn` to the POST body**

Find the `fetch('/api/v0/chat', { ..., body: JSON.stringify({...}) })` call. Add the new field to the body:

```ts
  body: JSON.stringify({
    question: q,
    threshold,
    enableRewrite: rewriteOn,
    enableGeneralKnowledge: generalKnowledgeOn,
    version: botVersion,
    history,
    tone,
    length,
    hydeMode,
  }),
```

- [ ] **Step 5: Add `generalKnowledgeOn` to the `ask` callback's dependency array**

Find the `useCallback(..., [...])` for the `ask` function (line 386 has the current deps). Add `generalKnowledgeOn` to the dependency array so the body stays in sync.

- [ ] **Step 6: Pass `generalKnowledgeOn` + `setGeneralKnowledgeOn` to `SettingsView`**

Find the `<SettingsView ... />` usage in `chat-shell.tsx`. Add two new props:

```tsx
  <SettingsView
    ...existing props...
    generalKnowledgeOn={generalKnowledgeOn}
    onToggleGeneralKnowledge={() => setGeneralKnowledgeOn((v) => !v)}
  />
```

(There may be multiple usages — classic and manta layouts. Update both.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `SettingsView` complains about unknown props, that's expected — Task 6 wires them up.

- [ ] **Step 8: Commit (deferred until Task 6 to avoid broken-build commit)**

Do NOT commit yet — `SettingsView` doesn't accept the new props yet. We'll commit Tasks 5+6 together.

---

## Task 6: Add the `ToggleRow` to `SettingsView`

**Files:**
- Modify: `app/components/settings-view.tsx`

- [ ] **Step 1: Extend the component's props**

In `app/components/settings-view.tsx`, find the props type (line 32). Add:

```ts
  generalKnowledgeOn: boolean;
  onToggleGeneralKnowledge: () => void;
```

Also extend the existing `botFlags` shape to include `generalKnowledgeEnabled: boolean`:

```ts
  botFlags: {
    cacheEnabled: boolean;
    selfReflect: boolean;
    cascadeOnLowConfidence: boolean;
    cascadeModel: string;
    generalKnowledgeEnabled: boolean;
  };
```

- [ ] **Step 2: Destructure the new props in the function signature**

Add `generalKnowledgeOn, onToggleGeneralKnowledge,` to the destructured argument list (line 20-33).

- [ ] **Step 3: Add the `ToggleRow` to the "Pipeline-opties" section**

Find the existing `<ToggleRow label="Smart pre-processing" ... />` (line 119). Add a new `ToggleRow` directly after it:

```tsx
        <ToggleRow
          label="Algemene-kennis-antwoorden"
          desc="Bij zero-hits beantwoordt de bot algemene vragen binnen ons domein (extra LLM-call ≈ $0.0001–0.0003). Uit = directe fallback zonder LLM-call. Beschikbaar vanaf v0.5."
          on={generalKnowledgeOn}
          onChange={onToggleGeneralKnowledge}
          disabled={!botFlags.generalKnowledgeEnabled}
        />
```

`ToggleRow` already supports `disabled` — when disabled, it ignores clicks and renders grey. No further UI work needed.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere.

- [ ] **Step 5: Visual smoke-test in the browser**

Start dev server (`npm run dev`) if not already. Open `http://localhost:3000/?v=v0.5`. Open the Instellingen panel (gear icon or whichever opens `SettingsView`).

Expected:
1. New "Algemene-kennis-antwoorden" row is visible under "Pipeline-opties".
2. Toggle is ON by default.
3. Click the toggle → it visibly flips to OFF.
4. Refresh the page → toggle is back to ON (in-memory only — by design).
5. Switch to `?v=v0.4` → toggle is greyed/disabled.

- [ ] **Step 6: Functional smoke-test the toggle's effect**

On `?v=v0.5`:
1. Toggle OFF.
2. Ask "wat is een onbekend term xyz123" in the composer.
3. Expected: response is the FALLBACK_MESSAGE ("Daar heb ik geen informatie over..." or whatever the constant is). Response appears within ~1-2s. Cost in the usage-footer increments by ~$0.00002 (embed only, no chat-LLM).
4. Toggle ON.
5. Re-ask the same question.
6. Expected: response is either a GENERAL answer (with "Even kort: ..." disclaimer) or off-topic refusal. Cost increments by ~$0.0001–0.0003 (reclassify + maybe general-LLM).

- [ ] **Step 7: Commit Tasks 5 + 6 together**

```bash
git add app/page.tsx app/components/chat-shell.tsx app/components/settings-view.tsx
git commit -m "feat(ui): add general-knowledge toggle to SettingsView"
```

---

## Task 7: Add an E2E test for the toggle-off path

**Files:**
- Modify: `tests/v0/v05-general-knowledge.spec.ts`

- [ ] **Step 1: Add a new test case after the OFF_TOPIC test**

In `tests/v0/v05-general-knowledge.spec.ts`, append a third `test(...)` block inside the existing `test.describe(...)`:

```ts
  test('TOGGLE OFF: "Wat zijn MKB-bedrijven?" geeft FALLBACK ipv GENERAL antwoord, geen reclassify-call', async ({
    page,
  }) => {
    await page.goto(V05_URL);
    await expect(page.locator('body')).toContainText(/v0\.5/i);

    // Open de Instellingen-paneel en zet de algemene-kennis-toggle uit.
    // Het exacte selectorpatroon hangt af van hoe Instellingen is geopend in
    // de UI — pas dit aan op basis van wat in chat-shell.tsx zichtbaar is.
    const settingsButton = page.getByRole('button', { name: /instellingen|settings/i }).first();
    await settingsButton.click();

    const toggle = page.getByRole('switch', { name: /algemene-kennis-antwoorden/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Sluit instellingen (optioneel; afhankelijk van UI).
    // Stel de GENERAL-vraag.
    const composer = page.getByRole('textbox', { name: /stel een vraag|composer|bericht/i }).first();
    await composer.fill('Wat zijn MKB-bedrijven?');
    await composer.press('Enter');

    const assistant = page.locator('.msg-assistant').last();
    await expect(assistant).toBeVisible({ timeout: 30_000 });

    // Mag NIET de GENERAL-disclaimer bevatten — toggle staat uit, reclassify
    // is dus niet gedraaid.
    await expect(assistant).not.toContainText(/Even kort.*buiten onze specifieke documentatie/i);

    // Moet de FALLBACK_MESSAGE bevatten (de exacte zin staat in rag.ts als
    // FALLBACK_MESSAGE — grep ernaar en match een herkenbaar stuk).
    await expect(assistant).toContainText(/geen informatie|niet gevonden|kan ik niet beantwoorden/i, {
      timeout: 30_000,
    });
  });
```

(If the FALLBACK_MESSAGE regex doesn't match the actual constant, grep `lib/v0/server/rag.ts` for `FALLBACK_MESSAGE` and update the regex.)

- [ ] **Step 2: Run the new test**

Make sure `npm run dev` is running in a separate terminal, then:

```bash
npm run test:e2e -- v05-general-knowledge
```

Expected: all three tests pass (existing GENERAL, existing OFF_TOPIC, new TOGGLE OFF).

If TOGGLE OFF fails because the toggle selector doesn't match, inspect `SettingsView` markup and update the selector. The `ToggleRow` renders an `aria-label={label}` on the button so `getByRole('switch', { name: /.../ })` should work.

- [ ] **Step 3: Commit**

```bash
git add tests/v0/v05-general-knowledge.spec.ts
git commit -m "test(v0.5): cover general-knowledge toggle-off path"
```

---

## Task 8: Update `CHATBOT_REFERENCE.md`

**Files:**
- Modify: `docs/CHATBOT_REFERENCE.md`

- [ ] **Step 1: Find the existing line about `generalKnowledgeEnabled`**

Open `docs/CHATBOT_REFERENCE.md`. Find line 873 (the table row for `generalKnowledgeEnabled`).

- [ ] **Step 2: Add a brief note about the runtime override**

Below the existing `generalKnowledgeEnabled` row, add (or extend the row's description):

> **Runtime override (v0.5+):** Stuur `enableGeneralKnowledge: false` in de `/api/v0/chat` body om reclassify over te slaan en direct naar FALLBACK te gaan. Default = true. UI-toggle in SettingsView. Per-vraag effect gelogd in `query_log.general_knowledge_actual`.

- [ ] **Step 3: Commit**

```bash
git add docs/CHATBOT_REFERENCE.md
git commit -m "docs: note enableGeneralKnowledge runtime override"
```

---

## Task 9: Final review + PR

- [ ] **Step 1: Confirm branch state**

Run:
```bash
git status
git log origin/main..HEAD --oneline
git rev-parse --abbrev-ref HEAD
```

Expected: working tree clean; branch is `feat/seb/general-toggle`; ~6-8 commits ahead of `origin/main`.

- [ ] **Step 2: Run full type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: zero errors. Fix any warnings the same way the rest of the codebase handles them (eslint-disable with a justification comment, like the existing patterns in `chat-shell.tsx`).

- [ ] **Step 4: Run the eval smoke (optional but cheap)**

The eval-runner does NOT pass the toggle, so it should produce identical results to a `main`-equivalent v0.5 run. Skip unless you suspect a regression in the general-knowledge code path.

- [ ] **Step 5: Run `graphify update .`**

```bash
graphify update .
```
Expected: AST-only update, no API cost. Output stays gitignored.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/seb/general-toggle
```

The pre-push hook should allow this (you're not pushing to `main`).

- [ ] **Step 7: Open PR using the repo template**

```bash
gh pr create --title "feat(v0.5): general-knowledge toggle in SettingsView" --body "$(cat <<'EOF'
## Summary
- Add a per-session UI toggle (`SettingsView`) that disables the v0.5 zero-hits reclassify-LLM path.
- When off: zero-hits skip reclassify entirely and return FALLBACK_MESSAGE — gedrag identiek aan v0.1–v0.4.
- New nullable `query_log.general_knowledge_actual` column for analyzing gate-outcome distribution.
- Toggle is disabled on bots where `bot.generalKnowledgeEnabled=false` (pre-v0.5).

## Spec
docs/superpowers/specs/2026-05-13-general-knowledge-toggle-design.md

## Plan
docs/superpowers/plans/2026-05-13-general-knowledge-toggle.md

## Test plan
- [ ] Migration applied locally via `npm run migrate`
- [ ] `npx tsc --noEmit` zero errors
- [ ] `npm run lint` zero errors
- [ ] `npm run test:e2e -- v05-general-knowledge` — all three tests pass
- [ ] Manual: v0.5 + toggle aan + "Wat is MKB?" → GENERAL antwoord met disclaimer
- [ ] Manual: v0.5 + toggle uit + "Wat is MKB?" → FALLBACK_MESSAGE, geen reclassify-call zichtbaar in dev-log
- [ ] Manual: v0.4 + Instellingen → toggle is grijs/disabled

## V1 hard-rules check
- Multi-tenancy: niet geraakt — alleen UI-state + 1 nullable kolom + 1 if-conditie.
- RLS: niet gewijzigd — `query_log` policies dekken alle kolommen.
- Service-role: niet geraakt.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Report the PR URL back to Sebastiaan**

Done — paste the PR URL so it can be reviewed.

---

## Post-merge cleanup

Once the PR is merged:

```bash
# From the main repo, NOT the worktree:
cd C:\Users\solys\Documents\Code\chatmanta
git fetch origin
git checkout main
git pull
git worktree remove ../chatmanta-general-toggle
git branch -D feat/seb/general-toggle  # always -D (force) after squash-merge per memory
```
