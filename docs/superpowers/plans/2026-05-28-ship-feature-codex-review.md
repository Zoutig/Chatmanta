# Ship-feature v2 — Codex review-en-fix-lus + verificatiegates — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de afgesproken verbeteringen in de globale `ship-feature` skill: een automatische Codex review-en-fix-lus (MCP, read-only, Claude schift+fixt), pre-PR gates (build/browser/eval), een soepele merge-fallback, en haal de frictie-gevende globale pre-push Codex-hook weg.

**Architecture:** Twee globale config-bestanden worden bewerkt (`~/.claude/skills/ship-feature/SKILL.md` chirurgisch via Edits; `~/.claude/settings.json` via een robuust Node-filter). Geen repo-code, dus geen worktree/PR-ritueel voor de implementatie zelf — alleen de spec + dit plan landen in chatmanta. Verificatie = read-back + JSON-parse + acceptatiecriteria-checklist (geen unit tests; dit is prose/config-editing).

**Tech Stack:** Markdown (skill), JSON (settings), Node.js (settings-edit + verificatie), PowerShell/Bash (backups). Spec: `docs/superpowers/specs/2026-05-28-ship-feature-codex-review-design.md`.

---

## File Structure

| Bestand | Verantwoordelijkheid | Wijziging |
|---|---|---|
| `~/.claude/skills/ship-feature/SKILL.md` | De skill-instructies | 7 chirurgische Edits: flow-diagram, nieuw stap-5-blok + PR-hernummer, Merge-rewrite, Cleanup-hernummer, Safe-to-close-hernummer, Red-flags, Project-notes |
| `~/.claude/settings.json` | Globale harness-config | 1 entry uit `hooks.PreToolUse` verwijderen (de `pre-push-codex-review`) |
| `~/.claude/skills/ship-feature/SKILL.md.bak`, `~/.claude/settings.json.bak` | Veiligheidsnet (geen git op globale files) | Aangemaakt vóór editen |
| `docs/superpowers/plans/2026-05-28-ship-feature-codex-review.md` | Dit plan | Commit op `feat/seb/ship-feature-codex-review` |

**Belangrijk:** de globale files staan NIET onder git. Daarom maken we backups (`.bak`) i.p.v. commits, en is verificatie read-back i.p.v. tests.

---

## Task 0: Backups van de globale files

**Files:**
- Create: `~/.claude/skills/ship-feature/SKILL.md.bak`
- Create: `~/.claude/settings.json.bak`

- [ ] **Step 1: Maak beide backups**

```bash
cp ~/.claude/skills/ship-feature/SKILL.md ~/.claude/skills/ship-feature/SKILL.md.bak
cp ~/.claude/settings.json ~/.claude/settings.json.bak
```

- [ ] **Step 2: Verifieer dat de backups bestaan en niet leeg zijn**

```bash
wc -l ~/.claude/skills/ship-feature/SKILL.md.bak ~/.claude/settings.json.bak
```
Expected: beide > 0 regels.

---

## Task 1: SKILL.md — 7 chirurgische Edits

**Files:**
- Modify: `~/.claude/skills/ship-feature/SKILL.md`

> Lees het bestand eerst volledig (Read) zodat de Edit-`old_string`s exact matchen. De strings hieronder zijn overgenomen uit de huidige versie; whitespace moet exact kloppen.

- [ ] **Step 1: Flow-diagram — voeg "pre-PR gates" toe**

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
worktree-bootstrap → spec → plan → implement → PR → merge → cleanup → safe-to-close
```
new_string:
```
worktree-bootstrap → spec → plan → implement → pre-PR gates → PR → merge → cleanup → safe-to-close
```

- [ ] **Step 2: Voeg het nieuwe "## 5. Pre-PR gates"-blok in én hernummer PR → 6**

Dit is één Edit die het einde van de Implement-sectie als anker gebruikt en in één klap sectie 5 invoegt + de PR-kop hernummert.

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
Stale Turbopack / `.next` cache mimics real bugs. If a UI change doesn't appear: clear `.next/`, restart dev server, retry — before any debugging.

## 5. PR
```
new_string:
```
Stale Turbopack / `.next` cache mimics real bugs. If a UI change doesn't appear: clear `.next/`, restart dev server, retry — before any debugging.

## 5. Pre-PR gates (all run before the PR is opened)

After implementation, before opening the PR. Each gate must be green first — the PR is born clean, review fixes land in the branch commits, not as messy follow-ups. Run in order. 5a and 5b always run; 5c and 5d are conditional.

### 5a. Codex review-and-fix loop (always)

Automated review where Codex reports and **you (Claude) triage and apply the fixes you agree with**. Nothing blocks the work automatically — you are the filter (chatmanta baseline: ~2 false positives per review; never apply blindly).

Engine: the `mcp__codex__codex` MCP tool with `sandbox: "read-only"` (Codex reports, never edits), plus `mcp__codex__codex-reply` for re-review rounds on the same thread. NOT `/codex:review` — it is `disable-model-invocation` and its result-handling contract forbids auto-fixing.

Per round:
1. **Review** — call `mcp__codex__codex` with `sandbox: "read-only"`, `cwd` = repo root, and a prompt that includes the branch diff (`git diff origin/main...HEAD`, or `@{u}...HEAD` when an upstream is set) and asks for findings as a structured list: `{file, line, severity, problem, suggested fix}`. Save the returned `threadId`.
2. **Triage** — for each finding, read the actual code at that location and classify: real bug vs false-positive, and auto-fixable vs needs-Sebastiaan.
3. **Apply** — apply the agreed, auto-fixable findings as one `fix(review): <summary>` commit for that round.
4. **Re-verify** — run typecheck + unit tests; a fix must not break anything. If it does, revert the fix and mark it "rejected — broke the build."
5. **Re-review** — `mcp__codex__codex-reply` with the saved `threadId` and the new diff.
6. **Stop** — when Codex reports no actionable findings, OR after 2 rounds (cost cap).
7. **Report** — a table to Sebastiaan: `finding → applied / rejected (with reason)`. "Needs-Sebastiaan" findings are reported, never silently applied.

There is no hard stop anymore: triage and decide, report — don't block.
If the Codex MCP server is unavailable (headless/cron, server down): report "review skipped — Codex MCP unreachable" and continue.
If the diff is empty: report "nothing to review" and skip the loop.

### 5b. Clean production build (always)

Runs after the Codex loop, on the fixed code:

```powershell
Remove-Item -Recurse -Force .next   # avoids the Windows dirty-.next native worker crash (0xC0000409)
npx next build
```

Then check for Next.js metadata-route filename collisions — `icon.tsx`, `favicon.*`, `opengraph-image.*`, `apple-icon.*` used as ordinary components under `app/` break the production build while dev hides it. Build fails → stop, fix, rebuild. No PR on a red build.

### 5c. Browser verification with Playwright (conditional — UI changes)

- **Trigger:** the change touches rendered UI (`app/`, `components/`).
- **Action:** verify the SPEC's acceptance criteria end-to-end in the browser, in light + dark theme and a mobile viewport.
- **No UI surface:** report "skipped — no UI change" explicitly. Never skip silently.

### 5d. Eval gate (conditional — bot-engine changes)

- **Trigger:** files under `lib/v0/` changed.
- **Action:** run the cheap hard-dimension eval if its script exists in `package.json` (added in PR #119); otherwise fall back to `npm run eval:run-all`. Confirm the exact script name in `package.json` before running.
- **Pure UI/crawler PR (no `lib/v0/` change):** skipped — cost-disciplined. Report the skip.

## 6. PR
```

- [ ] **Step 3: Hernummer + herschrijf de Merge-sectie (6 → 7) met de classifier-fallback**

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
## 6. Merge

Wait for review. If Codex / `/review` configured: run it. **Verify findings yourself** — false positives are ~2 per review on chatmanta; don't blindly apply. Categorize as auto-fixable vs needs-human before touching.

Squash-merge when approved: `gh pr merge <num> --squash --delete-branch`.
```
new_string:
```
## 7. Merge

Codex review already ran as gate 5a, so the branch is clean — no separate review step here.

Squash-merge when approved: `gh pr merge <num> --squash --delete-branch`.

If an auto-mode classifier or permission rule blocks the merge: **stop retrying.** Give Sebastiaan the exact command to run manually plus a one-line reason it was blocked, e.g.:

> Merge blocked by the auto-mode classifier. Run this yourself: `gh pr merge <num> --squash --delete-branch` — flagged because <reason>.

Don't loop on failed merge attempts.
```

- [ ] **Step 4: Hernummer de Cleanup-kop (7 → 8)**

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
## 7. Cleanup (autonomous — don't ask)
```
new_string:
```
## 8. Cleanup (autonomous — don't ask)
```

- [ ] **Step 5: Hernummer de Safe-to-close-kop (8 → 9)**

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
## 8. Safe-to-close check (autonomous — always run, always report)
```
new_string:
```
## 9. Safe-to-close check (autonomous — always run, always report)
```

- [ ] **Step 6: Red-flags-tabel — fix de stap-referentie + voeg gate-rijen toe**

Edit A — fix de verouderde stap-referentie. Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
| Cleanup done but no safe-to-close report | Run step 9 — the explicit ✅/⚠️ message is mandatory. |
```

> Let op: in de huidige file staat hier nog `Run step 8`. Match dus op de ECHTE inhoud:

old_string (werkelijk in de file):
```
| Cleanup done but no safe-to-close report | Run step 8 — the explicit ✅/⚠️ message is mandatory. |
```
new_string:
```
| Cleanup done but no safe-to-close report | Run step 9 — the explicit ✅/⚠️ message is mandatory. |
| Opened a PR without running gates 5a–5d | Stop. The gates run before the PR, not after. |
| Applied a Codex finding without reading the cited code | Re-read at the file:line first — ~2 FP/review baseline. |
| Treating a Codex finding as a hard BLOCK | There is no hard stop. Triage, decide, report — never auto-block. |
```

- [ ] **Step 7: Project-specific notes — voeg de gate-commando's toe**

Edit `~/.claude/skills/ship-feature/SKILL.md`:

old_string:
```
- PR template at `.github/pull_request_template.md` — fill fully
```
new_string:
```
- PR template at `.github/pull_request_template.md` — fill fully
- Gate 5b build: `Remove-Item -Recurse -Force .next; npx next build` — `.next` MUST be cleared first (dirty-`.next` native crash)
- Gate 5d eval: prefer the cheap hard-dimension eval (PR #119) once merged; until then `npm run eval:run-all`. Only triggers on `lib/v0/` changes.
- Gate 5a engine: `mcp__codex__codex` (read-only) + `mcp__codex__codex-reply`; the old global pre-push Codex hook has been retired (it caused false-positive BLOCKs)
```

- [ ] **Step 8: Verifieer alle SKILL.md-wijzigingen in één read-back**

```bash
grep -nE "pre-PR gates|## 5\. Pre-PR|### 5a\.|### 5b\.|### 5c\.|### 5d\.|## 6\. PR|## 7\. Merge|## 8\. Cleanup|## 9\. Safe-to-close|Run step 9|gates 5a–5d|mcp__codex__codex" ~/.claude/skills/ship-feature/SKILL.md
```
Expected: alle koppen/markers aanwezig, geen dubbele oude nummers. Controleer specifiek dat er GEEN `## 5. PR`, `## 6. Merge`, `## 7. Cleanup`, `## 8. Safe-to-close` of `Run step 8` meer in staat:

```bash
grep -nE "## 5\. PR|## 6\. Merge|## 7\. Cleanup|## 8\. Safe-to-close|Run step 8" ~/.claude/skills/ship-feature/SKILL.md || echo "OK — geen oude nummers meer"
```
Expected: `OK — geen oude nummers meer`.

---

## Task 2: settings.json — verwijder de pre-push Codex-hook

**Files:**
- Modify: `~/.claude/settings.json`

> De hook zit als entry in `hooks.PreToolUse` (de entry met `command` die `pre-push-codex-review.mjs` aanroept). We filteren 'm robuust met Node i.p.v. fragiele string-Edits, en pretty-printen met 2-space indent. Het script-bestand `~/.claude/hooks/pre-push-codex-review.mjs` blijft staan.

- [ ] **Step 1: Verwijder de entry via Node-filter**

```bash
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const f=path.join(os.homedir(),".claude","settings.json");
const j=JSON.parse(fs.readFileSync(f,"utf8"));
const arr=(j.hooks&&j.hooks.PreToolUse)||[];
const before=arr.length;
if(j.hooks&&Array.isArray(j.hooks.PreToolUse)){
  j.hooks.PreToolUse=arr.filter(e=>!JSON.stringify(e).includes("pre-push-codex-review"));
}
fs.writeFileSync(f, JSON.stringify(j,null,2)+"\n");
console.log("PreToolUse entries:", before, "->", j.hooks.PreToolUse.length);
'
```
Expected: `PreToolUse entries: 2 -> 1` (of N -> N-1).

- [ ] **Step 2: Verifieer dat JSON geldig is én de hook weg is**

```bash
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const j=JSON.parse(fs.readFileSync(path.join(os.homedir(),".claude","settings.json"),"utf8"));
const s=JSON.stringify(j);
console.log("valid JSON:", true);
console.log("pre-push-codex-review still present:", s.includes("pre-push-codex-review"));
console.log("pre-edit-worktree-check still present:", s.includes("pre-edit-worktree-check"));
'
```
Expected: `valid JSON: true`, `pre-push-codex-review still present: false`, `pre-edit-worktree-check still present: true` (de andere PreToolUse-hook moet blijven).

- [ ] **Step 3: Verifieer dat het script-bestand nog bestaat (we verwijderen het NIET)**

```bash
test -f ~/.claude/hooks/pre-push-codex-review.mjs && echo "script behouden — OK"
```
Expected: `script behouden — OK`.

---

## Task 3: Acceptatiecriteria-check tegen de spec

**Files:** geen (verificatie).

- [ ] **Step 1: Loop de acceptatiecriteria uit de spec na**

Open `docs/superpowers/specs/2026-05-28-ship-feature-codex-review-design.md` sectie 10 en vink elk criterium af tegen de echte files:

- [ ] SKILL.md heeft een benoemd stap-5 "Pre-PR gates"-blok met 5a–5d in volgorde, en 6–9 correct hernummerd.
- [ ] 5a beschrijft de MCP-lus exact (read-only review → schift → `fix(review):` → typecheck/tests → `codex-reply` → stop bij schoon óf 2 rondes → rapport-tabel; niets blokkeert automatisch).
- [ ] 5b dwingt `rm .next` + `next build` + metadata-collisie-check af.
- [ ] 5c/5d zijn expliciet conditioneel met juiste triggers (UI-paden / `lib/v0/`) + "overgeslagen"-rapportage.
- [ ] Merge-stap bevat de classifier-block fallback (stop + exact commando + reden).
- [ ] `pre-push-codex-review`-hookblok is uit `settings.json`; script-bestand blijft.
- [ ] Skill noemt de headless/cron-randvoorwaarde (MCP afwezig → gate vervalt veilig).

- [ ] **Step 2: Meld eventuele gaten en fix ze inline.** Geen gaten → ga door.

---

## Task 4: Commit dit plan op de branch

**Files:**
- Modify (git): `docs/superpowers/plans/2026-05-28-ship-feature-codex-review.md`

> Alleen de repo-doc wordt gecommit. De globale files (SKILL.md, settings.json) staan niet onder git — die zijn al toegepast + via `.bak` reversibel.

- [ ] **Step 1: Verifieer de branch**

```bash
git rev-parse --abbrev-ref HEAD
```
Expected: `feat/seb/ship-feature-codex-review`.

- [ ] **Step 2: Commit het plan**

```bash
git add "docs/superpowers/plans/2026-05-28-ship-feature-codex-review.md"
git commit -m "docs(ship-feature): implementatieplan auto Codex review-en-fix-lus + gates"
```

---

## Self-Review (uitgevoerd door de planschrijver)

**1. Spec-coverage:** Elke spec-sectie heeft een task. §4 engine → Task 1 Step 2 (5a-tekst). §5 flow → Task 1 Steps 1-2. §6 gates → Task 1 Step 2. §7 merge → Task 1 Step 3. §8 hook-pensioen → Task 2. §9 artefacten → File Structure. §10 acceptatie → Task 3. §11 edge cases → opgenomen in 5a-tekst (MCP onbereikbaar / lege diff / fix breekt build / cap). §12 risico's → backups (Task 0) + read-only + cap in 5a. Geen gaten.

**2. Placeholder-scan:** Geen "TBD/TODO". `<summary>`, `<num>`, `<reason>` zijn opzettelijke invul-tokens in skill-prosetekst (geen code-placeholders). De eval-gate gebruikt bewust een fallback i.p.v. een verzonnen script (hard-dimensie-eval nog niet in main).

**3. Type/naam-consistentie:** Sectienummers consistent: 5 (gates) → 6 (PR) → 7 (Merge) → 8 (Cleanup) → 9 (Safe-to-close). Red-flags verwijst naar "step 9" en "gates 5a–5d" — matcht de koppen. `mcp__codex__codex` / `mcp__codex__codex-reply` consistent gespeld.
