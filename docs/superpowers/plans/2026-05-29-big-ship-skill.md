# big-ship Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also consult **superpowers:writing-skills** for skill-authoring conventions while writing the prose.

**Goal:** Build a new personal skill `big-ship` — the large-build sibling of `ship-feature` — that wraps a heavy multi-agent design front-end (codebase recon + approach tournament) and an adversarial review loop (local `/code-review` ⇄ Codex MCP, real rebuttal, ≤3 rounds) plus a final human-triggered ultra-gate, around the reused middle of `ship-feature`.

**Architecture:** Single markdown file `~/.claude/skills/big-ship/SKILL.md`, modelled structurally on the existing `~/.claude/skills/ship-feature/SKILL.md`. It is a personal/global skill — it lives OUTSIDE the chatmanta repo and is NOT git-tracked. The skill references `ship-feature` for shared phases (0/6/8) instead of duplicating them, and keeps phases 5b–5d identical to the parallel "ship-feature v2" design so they don't diverge.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code skill format). No build/test toolchain. Verification = frontmatter parse + section-presence greps + a final read-through against the spec's acceptance criteria.

**Source of truth:** `docs/superpowers/specs/2026-05-28-big-ship-skill-design.md` (committed `17d217f` on this branch). Every section below maps to that spec — when prose detail is needed, pull it from the named spec section rather than re-deciding.

---

## File Structure

| File | Responsibility | Git-tracked? |
|---|---|---|
| `~/.claude/skills/big-ship/SKILL.md` | The entire skill: frontmatter + 8-phase flow + when-not + red-flags + notes | **No** — global config |
| `docs/superpowers/specs/2026-05-28-big-ship-skill-design.md` | Approved design spec (already committed) | Yes (this worktree) |
| `docs/superpowers/plans/2026-05-29-big-ship-skill.md` | This plan | Yes (this worktree) |

Single deliverable file. No decomposition into multiple skill files — `ship-feature` is one file and `big-ship` mirrors it. Section order inside the file follows the flow diagram: frontmatter → intro → when-not → flow → phases 0–8 → red-flags → project notes.

**Path note for the executor:** the home dir on this machine is `C:\Users\solys`. Use `~/.claude/skills/big-ship/SKILL.md` = `C:\Users\solys\.claude\skills\big-ship\SKILL.md`. The Bash shell cwd is pinned to the main checkout by the harness; always write the SKILL.md via its absolute path. The pre-edit hook will warn "OUTSIDE worktree" for the global path — that is expected and correct here.

---

## Task 1: Skill skeleton — frontmatter, intro, when-not, flow diagram

**Files:**
- Create: `C:\Users\solys\.claude\skills\big-ship\SKILL.md`

- [ ] **Step 1: Create the file with exact frontmatter**

Write the file beginning with this frontmatter verbatim (the `description` carries the trigger + the explicit "use ship-feature instead" skip-clause, which is what makes the skill auto-discoverable for the right cases):

```markdown
---
name: big-ship
description: Use when building a large multi-subsystem project that is too big for a single spec+plan — a complete dashboard, a new bot version, or any build that deserves its own milestone breakdown. Drives a heavy multi-agent design front-end (parallel codebase recon + a tournament of full approaches judged and synthesized) and an adversarial review loop (local /code-review cross-checked against Codex via MCP, real rebuttal, max 3 rounds) plus a final human-triggered /code-review ultra gate, wrapped around the reused worktree→implement→PR→merge→cleanup middle of ship-feature. For a normal non-trivial feature or bugfix (3+ files) use ship-feature instead; for a one-file fix use neither.
---
```

- [ ] **Step 2: Add title + intro + relationship line**

Below the frontmatter add an H1 `# /big-ship — end-to-end delivery for large builds`, then a 2-3 sentence intro (from spec §What), then a one-line relationship pointer: normal features → `ship-feature`; big-ship reuses ship-feature's middle and adds a heavy design front-end + an adversarial review-loop back-end.

- [ ] **Step 3: Add "Wanneer NIET gebruiken" section**

Use spec §"Wanneer wel / niet gebruiken" (the NOT half): normal non-trivial feature/bugfix (3+ files) → `/ship-feature`; one-file fix/typo/read-only → no skill.

- [ ] **Step 4: Add the flow diagram verbatim**

Insert this fenced block exactly (it is the spine the rest of the file expands):

```
0. Worktree-bootstrap        ← erft van ship-feature §1 (env, npm ci, port, migratie-nr)
1. Verken (fan-out)          NIEUW · parallelle lees-agents brengen het terrein in kaart
2. Ontwerp-toernooi          NIEUW · N approach-agents → judge → winnaar synthetiseren
3. Spec + Plan (milestones)  zwaarder dan ship-feature §2/§3 · plan = milestone-breakdown
4. Implementeer per milestone ← ship-feature §4, herhaald per milestone
5. PRE-PR GATES              hergebruikt v2's 5a–5d, met 5a verzwaard tot 2-reviewer-loop
   5a  Review-loop (code-review ⇄ Codex/MCP, echte rebuttal, ≤3 rondes)
   5b  Schone prod-build      (altijd: rm .next + next build + metadata-collisie-check)
   5c  Browser-verify         (conditioneel: UI-changes)
   5d  Eval-gate              (conditioneel: lib/v0/ changes)
6. PR aanmaken               ← ship-feature §5
7. Ultra-gate (jij triggert) NIEUW · /code-review ultra op de PR, agent verwerkt
8. Merge → cleanup → safe-to-close  ← ship-feature §6-8
```

- [ ] **Step 5: Verify skeleton**

Run:
```bash
sed -n '1,40p' "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
grep -nE "^name: big-ship$|^description:|^# /big-ship|Wanneer NIET|^0\. Worktree" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
```
Expected: frontmatter `name`/`description` present, H1 present, a "Wanneer NIET" heading present, and the flow block's `0. Worktree` line present.

- [ ] **Step 6: No commit**

SKILL.md is global config (not in any git repo). Do NOT attempt to commit it. Move to Task 2.

---

## Task 2: Front bookend — Fase 0, 1, 2

**Files:**
- Modify: `C:\Users\solys\.claude\skills\big-ship\SKILL.md` (append phase sections)

- [ ] **Step 1: Write Fase 0 (worktree-bootstrap, by reference)**

One short section: "Doe `ship-feature` §1 volledig (worktree create — vraag zichtbaar vs verstopt, env-copy, `npm ci`, vrije poort, gereserveerd migratie-nr via `check-migration`)." Do not duplicate ship-feature's steps; point to them. Add the chatmanta branch convention `feat/seb/<slug>`.

- [ ] **Step 2: Write Fase 1 (Verken fan-out)**

From spec §"Fase 1 — Verken". Must state: dispatch parallel **read-only** agents (via the **Workflow** tool, or `superpowers:dispatching-parallel-agents`, or `Explore`), each on a different slice (dashboard patterns / datamodel + RLS / relevant `lib/v0` modules / prior bot versions / eval-infra). Synthesize into one "terrein-brief". Include the scaling note: skip/shorten if the area is already well-understood, but log that explicitly.

- [ ] **Step 3: Write Fase 2 (Ontwerp-toernooi)**

From spec §"Fase 2 — Ontwerp-toernooi". Must state: **N = 3** parallel approach-agents, each a full approach from a different angle (MVP-first / risk-first / architectuur-first), covering architecture, datamodel changes, milestone breakdown, risks, cost. A **judge-agent** scores on fit / simplicity / risk / cost / **V1 hard rules + blueprint**. Synthesize winner + best ideas of runners-up. **Mens-checkpoint:** present synthesized approach to Sebastiaan for sign-off before Fase 3. Note: run via the **Workflow tool** (parallel + judge); the skill instruction is the explicit Workflow opt-in.

- [ ] **Step 4: Verify**

Run:
```bash
grep -nE "Fase 0|Fase 1|Fase 2|terrein-brief|judge|V1 hard rules|sign-off|Workflow" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
```
Expected: all of Fase 0/1/2 headings present; `terrein-brief`, `judge`, `V1 hard rules`, `sign-off`, `Workflow` all appear.

- [ ] **Step 5: No commit** (global file). Continue.

---

## Task 3: Middle — Fase 3, 4

**Files:**
- Modify: `C:\Users\solys\.claude\skills\big-ship\SKILL.md`

- [ ] **Step 1: Write Fase 3 (Spec + Plan, milestone-structured)**

From spec §"Fase 3". Must state: SPEC.md with What / acceptance criteria / out-of-scope / edge cases (as ship-feature §2), but the PLAN is a **milestone-breakdown** — each milestone = a coherent, independently verifiable block with its own acceptance subset. Keep out-of-scope discipline (overshoot 2× = trim signal). Write spec to `docs/superpowers/specs/`. Human sign-off before implementing.

- [ ] **Step 2: Write Fase 4 (Implement per milestone)**

From spec §"Fase 4". Must state: loop `ship-feature` §4 per milestone — implement, typecheck + tests AFTER each milestone (not at the end), commit small, one logical commit-group per milestone. Optional parallel sub-agents per independent milestone (`superpowers:subagent-driven-development` / `dispatching-parallel-agents`). Include the stale `.next`/Turbopack cache caveat (clear before debugging).

- [ ] **Step 3: Verify**

Run:
```bash
grep -nE "Fase 3|Fase 4|milestone|out-of-scope|typecheck|\.next" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
```
Expected: Fase 3/4 headings + `milestone`, `typecheck`, `.next` present.

- [ ] **Step 4: No commit** (global file). Continue.

---

## Task 4: Back bookend — Fase 5 (gates), 6, 7, 8

**Files:**
- Modify: `C:\Users\solys\.claude\skills\big-ship\SKILL.md`

- [ ] **Step 1: Write Fase 5 intro + 5a review-loop (the heart) verbatim-structured**

Insert a "## Fase 5 — Pre-PR gates" intro (every gate green before the PR opens), then the 5a loop with these exact numbered steps (per ronde, on `git diff origin/main...HEAD`):

```
1. Reviewer A — lokale /code-review (effort `high`; `max` in de laatste ronde) → Rapport A.
2. Reviewer B — Codex via `mcp__codex__codex` (sandbox: read-only, cwd = repo-root); prompt
   geeft de diff mee + vraagt findings als {bestand, regel, ernst, probleem, voorgestelde fix}.
   Bewaar de threadId → Rapport B.
3. Echte rebuttal (cross-check):
   - Rapport A → naar Codex via `mcp__codex__codex-reply` (zelfde thread): bevestig/weerleg
     elke code-review-finding + voeg missers toe.
   - Rapport B → naar een Claude-adjudicator-agent (mét de diff): bevestig/weerleg elke
     Codex-finding + voeg missers toe.
   - Netto must-fix = findings die de weerlegging van de ander overleven + nieuw-gevonden
     wederzijds-erkende issues.
4. Claude past de overlevende must-fixes toe als één `fix(review): …` commit per ronde.
   False positives zelf verifiëren tegen de echte code (≈2 FP/review). Typecheck + tests
   opnieuw; breekt een fix iets → terugdraaien + melden.
5. Stop: beide reviewers 0 must-fix → klaar. Anders volgende ronde (herreview via
   codex-reply op de nieuwe diff). HARDE CAP 3. Residu na ronde 3 → stop + rapporteer aan
   Sebastiaan. Nooit eindeloos.
6. Rapport per ronde: tabel finding → toegepast / verworpen (met reden) / mens-nodig.
   Niets blokkeert ooit automatisch werk; Claude is de schifter.
```

- [ ] **Step 2: Write Fase 5b/5c/5d (identical to ship-feature v2)**

From spec §"Fase 5b/5c/5d". 5b Schone prod-build (altijd): `Remove-Item -Recurse -Force .next` → `next build` → metadata-route filename-collisie-check; rode build → stop/fix/herhaal. 5c Browser-verify (conditioneel UI-paden `app/`,`components/`): acceptatiecriteria end-to-end in browser, light+dark+mobiel; geen UI → "overgeslagen" melden. 5d Eval-gate (conditioneel `lib/v0/`): goedkope hard-dimensie-eval vóór merge; pure UI/crawler-PR → "overgeslagen" melden.

- [ ] **Step 3: Write Fase 6 (PR, by reference)**

"Doe `ship-feature` §5: verifieer branch (`git rev-parse --abbrev-ref HEAD`), `gh pr create` met de repo's PR-template, test-plan afgeleid uit de SPEC-acceptatiecriteria, geschreven voor een reviewer die niet in de chat zat." Don't duplicate.

- [ ] **Step 4: Write Fase 7 (Ultra-gate, human-triggered)**

From spec §"Fase 7". Must state: na convergentie + PR **pauzeert** de skill en meldt letterlijk: *"Binnenloop schoon na N rondes. Draai nu `/code-review ultra <PR#>` als finale waterdicht-stempel."* `/code-review ultra` is billable + mens-only — de agent mag dit NIET zelf starten. Daarna: agent leest bevindingen in, triageert, fixt must-fixes, doet zo nodig één `codex-reply`-bevestigingsronde, dan pas merge.

- [ ] **Step 5: Write Fase 8 (merge/cleanup/safe-to-close, by reference)**

"Doe `ship-feature` §6-8: squash-merge (`gh pr merge <num> --squash --delete-branch`), autonome cleanup (lokale branch `-D`, worktree remove, orphan dev-servers killen), en de verplichte safe-to-close ✅/⚠️ rapportage." Don't duplicate.

- [ ] **Step 6: Verify**

Run:
```bash
grep -nE "Fase 5|5a|5b|5c|5d|Fase 6|Fase 7|Fase 8|mcp__codex__codex|codex-reply|/code-review|ultra|CAP 3|ship-feature .6-8|squash" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
```
Expected: all phase headings + `mcp__codex__codex`, `codex-reply`, `/code-review`, `ultra`, the cap-3 line, and the ship-feature references present.

- [ ] **Step 7: No commit** (global file). Continue.

---

## Task 5: Tail — Codex-engine note, red-flags, project notes + final acceptance review

**Files:**
- Modify: `C:\Users\solys\.claude\skills\big-ship\SKILL.md`

- [ ] **Step 1: Write the Codex-engine note**

From spec §"Codex-engine-beslissing". Short box: use `mcp__codex__codex` (read-only) + `codex-reply`, NOT the CLI (`/codex:review`/`/codex:adversarial-review` are `disable-model-invocation: true` and review-only). Headless/cron caveat: MCP absent → Codex-helft vervalt veilig, loop degradeert naar `/code-review` only, niets blokkeert hard.

- [ ] **Step 2: Write the red-flags table (ship-feature style)**

A `| Sign | Reaction |` table. Include at minimum these rows:
```
| Implementeren zonder toernooi-sign-off | Stop. Fase 2 sign-off eerst. |
| Review-loop draait >3 rondes | Cap is 3. Stop, rapporteer residu. |
| Agent probeert /code-review ultra zelf te starten | Kan niet — billable + mens-only. Pauzeer en vraag Sebastiaan. |
| Codex-finding blind toegepast | Eerst tegen de echte code verifiëren (≈2 FP/review). |
| big-ship gebruikt voor een 3-file feature | Te zwaar. Gebruik ship-feature. |
| Edits in de hoofd-checkout terwijl worktree open is | Verkeerde cwd. Schrijf onder de worktree-root. |
```

- [ ] **Step 3: Write project-specific notes (chatmanta)**

Short section: V1 hard rules (multi-tenancy, RLS, service-role discipline, anti-hallucinatie) override any spec/plan; branch `feat/seb/<slug>` (never push main); `check-migration` for next `NNNN`; PR-template at `.github/pull_request_template.md`. Note most of this rides along via the `ship-feature` reference.

- [ ] **Step 4: Final acceptance-criteria read-through**

Open the spec's "Acceptance criteria" checklist and the finished SKILL.md side by side. For EACH criterion, confirm a concrete location in SKILL.md satisfies it. Run a consolidated check:
```bash
grep -cE "Fase [0-8]" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"   # expect >= 8 phase mentions
grep -nE "approaches|toernooi|N = 3|N=3|3 approach" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"  # tournament N=3
grep -nE "echte rebuttal|rebuttal" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"  # cross-check
grep -nE "mcp__codex__codex|codex-reply" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"  # MCP engine
grep -nE "Wanneer NIET|ship-feature" "C:/Users/solys/.claude/skills/big-ship/SKILL.md"  # when-not + reuse
```
Expected: every grep returns matches. List any acceptance criterion with no home and fix it inline before finishing.

- [ ] **Step 5: Confirm the skill is discoverable**

Run:
```bash
ls -la "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
head -5 "C:/Users/solys/.claude/skills/big-ship/SKILL.md"
```
Expected: file exists; frontmatter parses (starts with `---`, has `name:` and `description:`). Note to user that the skill appears in the skills list on the next session (or after a skills reload).

- [ ] **Step 6: Commit the plan + spec docs (worktree only)**

The SKILL.md stays uncommitted (global). Commit only the worktree docs:
```bash
git -C "C:/Users/solys/Documents/Code/chatmanta-big-ship" add docs/superpowers/plans/2026-05-29-big-ship-skill.md
git -C "C:/Users/solys/Documents/Code/chatmanta-big-ship" commit -m "docs(big-ship): implementatieplan voor de big-ship skill"
```

---

## Self-Review (run by plan author, completed)

**1. Spec coverage:** Walked each spec acceptance criterion → mapped to a task:
- frontmatter + when-not → Task 1; flow → Task 1; Fase 1/2/5a/7 full → Tasks 2/4; 5b–5d identical to v2 → Task 4; four locked decisions → embedded across Tasks 1/2/4 + verified in Task 5; MCP-engine + headless caveat → Task 5 Step 1; human checkpoints → Task 2 (toernooi), Task 3 (spec/plan), Task 4 (ultra); red-flags → Task 5; chatmanta notes → Task 5. No gaps.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". Prose content is delegated to named spec sections by design (DRY) — the spec is the committed source of truth, not a placeholder.

**3. Type/name consistency:** Phase numbering 0–8 consistent between flow diagram and detail sections. Tool names consistent: `mcp__codex__codex` / `mcp__codex__codex-reply` / `/code-review` / `/code-review ultra` / `Workflow`. Cap value "3 rondes" consistent everywhere (vs v2's 2). `feat/seb/<slug>` branch convention consistent.

No issues outstanding.
