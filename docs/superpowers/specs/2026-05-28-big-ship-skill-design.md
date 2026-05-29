# Spec — `big-ship` skill

**Datum:** 2026-05-28
**Status:** ontwerp, wacht op review
**Type:** personal skill (`~/.claude/skills/big-ship/SKILL.md`) — leeft buiten de chatmanta-repo
**Auteur-context:** Sebastiaan (solo), brainstorm-sessie 2026-05-28
**Worktree:** `../chatmanta-big-ship` op branch `feat/seb/big-ship-skill` (off origin/main #119)

---

## What

`big-ship` is de grote broer van `/ship-feature`: een end-to-end ritueel voor **grote
bouwprojecten** die te omvangrijk zijn voor één spec + plan — bijvoorbeeld een compleet
dashboard of een nieuwe botversie. Het hergebruikt het midden van `ship-feature`
(worktree-bootstrap, implementeren, PR, merge, cleanup, safe-to-close) en voegt twee zware
boekensteunen toe:

1. **Vooraf** — een uitgebreidere, multi-agent ontwerp-fase die de codebase verkent en
   meerdere volledige aanpakken tegen elkaar laat strijden vóór er code komt.
2. **Achteraf** — een adversariële review-**loop** waarin de lokale `/code-review` en de
   Codex-review elkaars werk nakijken (echte rebuttal) en verbeteringen terugvoeren naar
   Claude Code, tot de build waterdicht is.

Het doel is maximale ontwerp-degelijkheid vóór de build en maximale hardening erna, met
behoud van de checkpoint-discipline van `ship-feature`.

## Verhouding tot "ship-feature v2" (parallel werk)

> **Context:** een tweede CC-sessie bouwt parallel aan een tune-up van de *bestaande*
> `ship-feature` skill: *"Ship-feature v2 — automatische Codex review-en-fix-lus +
> verificatiegates"* (spec op branch `feat/seb/ship-feature-codex-review`, commit `5977809`).
> Die v2 voegt tussen *implement* en *PR* een **Pre-PR gates**-blok toe: 5a Codex
> review-en-fix-lus (Codex-only, 2 rondes, via MCP-tool), 5b schone prod-build, 5c
> browser-verify (conditioneel UI), 5d eval-gate (conditioneel `lib/v0/`).

**Beslissing (2026-05-28): naast elkaar.** `big-ship` en `ship-feature v2` zijn twee aparte
skills:

- **`ship-feature` (v2)** = normale niet-triviale features. Eén reviewer (Codex), 2 rondes.
- **`big-ship`** = grote builds. Hergebruikt v2's **gate-mechanica, engine en
  rapportagevorm** één-op-één, maar verzwaart de loop met een **tweede reviewer** (lokale
  `/code-review`, echte rebuttal), 3 rondes, plus een **ultra-gate**. En het zet er de zware
  multi-agent ontwerp-voorkant voor.

**Afhankelijkheid:** big-ship's fase 5 is een superset van v2's 5a–5d. Zolang v2 nog niet
gemerged is, schrijft big-ship de gate-definities zelf volledig uit, maar houdt ze
*identiek* aan v2's vorm zodat ze niet divergeren. Landt v2, dan kan big-ship ernaar
verwijzen i.p.v. dupliceren.

## Wanneer wel / niet gebruiken

**Wel:** grote, multi-dag builds met meerdere subsystemen — compleet dashboard, nieuwe
botversie, een feature die een eigen milestone-breakdown verdient.

**Niet:**
- Normale niet-triviale feature/bugfix (3+ files) → `/ship-feature` (v2).
- One-file fix / typo / read-only onderzoek → geen skill.

## Vier vastgelegde beslissingen (brainstorm 2026-05-28)

1. **Ultra-handling:** *auto-loop + 1 ultra-gate*. De binnenloop draait volautomatisch op
   agent-uitvoerbare reviews (lokale `/code-review` + Codex via MCP). `/code-review ultra` is
   billable + alleen mens-startbaar, dus die komt één keer aan het eind als finale
   waterdicht-stempel die Sebastiaan zelf triggert.
2. **Cross-check:** *echte rebuttal*. Elke reviewer krijgt het rapport van de ander te zien,
   mag bevindingen weerleggen (false positives schrappen) én missers toevoegen. Alleen wat
   de weerlegging overleeft wordt toegepast.
3. **Ontwerp-fase:** *approaches + judge*. N agents schrijven elk een volledige andere
   aanpak; een judge-agent scoort; winnaar wordt gesynthetiseerd met de beste ideeën van de
   rest.
4. **Loop-stop:** *schoon, max 3 rondes*. Loop tot beide reviewers 0 must-fix teruggeven,
   met een harde cap van 3 rondes.

## Codex-engine-beslissing: MCP-tool, niet de CLI

**Beslist (overgenomen van ship-feature v2, geverifieerd in codex 1.0.4 plugin-bestanden):**
gebruik `mcp__codex__codex` (sandbox `read-only`) voor de review + `mcp__codex__codex-reply`
voor de herreview-rondes op dezelfde thread.

Onderbouwing:

| Criterium | MCP-tool | CLI (`codex-companion.mjs` / `/codex:*`) |
|---|---|---|
| Automatisch in-flow aanroepbaar door het model | Ja, directe tool-call | `/codex:review` + `/codex:adversarial-review` = `disable-model-invocation: true` (slash-only) |
| Auto-fix-lus | Read-only review → **Claude schift + fixt** → herreview | review-pad **verbiedt** auto-fix (`codex-result-handling`); review-only |
| Herreview met geheugen | `codex-reply` houdt thread vast | elke call vers — hele diff opnieuw |
| Gestructureerde findings | Ja, Claude stuurt de prompt | Verbatim tekst |

De CLI-review is architectonisch gebouwd om auto-fixen te verbieden — het tegenovergestelde
van wat de loop nodig heeft. De MCP-tool past native op "review → schift → fix → herreview".

**Randvoorwaarde:** de Codex MCP-server moet draaien (interactief = ja). In headless/cron-runs
kan hij ontbreken; dan vervalt de Codex-helft van de cross-check veilig (gerapporteerd, niets
blokkeert hard) en draait de loop op `/code-review` alleen.

## Architectuur — de flow

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

**Hergebruik-principe:** big-ship *verwijst* naar `ship-feature` voor fases 0, 6 en 8 i.p.v.
te dupliceren. Fases 5b/5c/5d zijn identiek aan v2 (uitgeschreven tot v2 mergt, dan verwijzen).
Alleen de nieuwe fases (1, 2, 5a-loop, 7) en de milestone-variant van 3/4 worden volledig
uitgeschreven.

## Componenten — de nieuwe fases in detail

### Fase 1 — Verken (fan-out)

Doel: de ontwerpen baseren op de échte codebase, niet op aannames.

- Dispatch parallelle **read-only** agents (Explore / `superpowers:dispatching-parallel-agents`
  of de Workflow-tool), elk op een andere slice: bestaande dashboard-patronen, datamodel +
  RLS, relevante `lib/v0`-modules, vorige botversies, eval-infra waar relevant.
- Elke agent levert een gestructureerde mini-map. Synthetiseer tot één **terrein-brief**.
- **Schaalt mee:** als het doel-gebied al goed bekend is, mag deze fase ingekort of
  overgeslagen worden — log dat dan expliciet.

### Fase 2 — Ontwerp-toernooi (approaches + judge)

- Spawn **N = 3** approach-agents parallel. Elk krijgt de terrein-brief + het doel en
  produceert een **volledige** aanpak vanuit een andere hoek (MVP-first / risk-first /
  architectuur-first): architectuur, datamodel-wijzigingen, milestone-breakdown, risico's,
  geschatte kosten/complexiteit.
- Een **judge-agent** scoort alle N op: fit-to-goal, eenvoud, risico, kosten, en
  **naleving van de V1 hard rules + blueprint** (multi-tenancy, RLS, service-role discipline,
  anti-hallucinatie, V1 Minimal Build Scope).
- **Synthese:** neem de winnaar, ent de beste ideeën van de runners-up erop.
- **Mens-checkpoint:** leg de gesynthetiseerde aanpak aan Sebastiaan voor ter goedkeuring
  vóór fase 3. Grote ontwerpbeslissing = expliciete sign-off, geen stilzwijgen.
- **Uitvoering:** via de Workflow-tool (parallel + judge-patroon). De skill-instructie is de
  expliciete opt-in voor Workflow.

### Fase 3 — Spec + Plan (milestone-gestructureerd)

- Net als `ship-feature` §2/§3 (SPEC.md met What / acceptance criteria / out-of-scope /
  edge cases), maar het PLAN is een **milestone-breakdown**: elke milestone = een coherent,
  onafhankelijk verifieerbaar blok met eigen acceptance-subset.
- Out-of-scope-discipline expliciet (eerste-pass overshoot 2× = signaal; trim).
- Schrijf naar `docs/superpowers/specs/`. Mens-sign-off vóór implementeren.

### Fase 4 — Implementeer per milestone

- Loop `ship-feature` §4 per milestone: implementeer, typecheck + tests ná elke milestone
  (niet pas op het eind), commit klein. Eén logische commit-groep per milestone.
- Voor zeer grote builds: optioneel parallelle sub-agents per onafhankelijke milestone
  (`superpowers:subagent-driven-development` / `dispatching-parallel-agents`).
- Stale `.next`/Turbopack-cache mimt bugs → clear vóór debuggen (chatmanta-valkuil).

### Fase 5a — Review-loop (het hart; verzwaarde versie van v2's 5a)

Per ronde, op de branch-diff (`git diff origin/main...HEAD`):

1. **Reviewer A — lokale `/code-review`** (effort `high`; `max` in de laatste ronde) →
   **Rapport A** (gestructureerde findings).
2. **Reviewer B — Codex via `mcp__codex__codex`** (`sandbox: read-only`, `cwd` = repo-root),
   prompt geeft de diff mee + vraagt findings als `{bestand, regel, ernst, probleem,
   voorgestelde fix}`. Bewaar de `threadId` → **Rapport B**.
3. **Echte rebuttal (cross-check):**
   - Rapport A → naar Codex via `mcp__codex__codex-reply` (zelfde thread): bevestig/weerleg
     elke code-review-finding + voeg missers toe.
   - Rapport B → naar een **Claude-adjudicator-agent** (mét de diff): bevestig/weerleg elke
     Codex-finding + voeg missers toe.
   - Netto **must-fix** = findings die de weerlegging van de ander overleven, plus
     nieuw-gevonden wederzijds-erkende issues.
4. Claude Code past de overlevende must-fixes toe als één `fix(review): …` commit per ronde.
   False positives verifieert de agent zélf tegen de echte code (AGENTS.md: ~2 FP/review).
   Typecheck + tests opnieuw — een fix mag niets breken (anders terugdraaien + melden).
5. **Stop-conditie:** beide reviewers 0 overlevende must-fix → loop klaar. Anders volgende
   ronde (herreview via `codex-reply` op de nieuwe diff). **Harde cap 3.** Bij residu na
   ronde 3: stop, rapporteer wat overblijft aan Sebastiaan — nooit eindeloos.
6. **Rapport:** per ronde een tabel `finding → toegepast / verworpen (met reden) / mens-nodig`.
   Niets blokkeert ooit automatisch werk; Claude is de schifter.

### Fase 5b/5c/5d — overige Pre-PR gates (identiek aan ship-feature v2)

- **5b Schone prod-build (altijd):** `Remove-Item -Recurse -Force .next` → `next build` →
  metadata-route filename-collisie-check (`icon.tsx`/`favicon`/`opengraph-image` als gewone
  componenten onder `app/`). Rode build → stop, fix, herhaal.
- **5c Browser-verify (conditioneel UI):** acceptatiecriteria end-to-end in de browser
  (light + dark + mobiel viewport). Geen UI-oppervlak → expliciet "overgeslagen" melden.
- **5d Eval-gate (conditioneel `lib/v0/`):** draai de goedkope hard-dimensie-eval vóór merge.
  Pure UI/crawler-PR → "overgeslagen" melden.

### Fase 7 — Ultra-gate (mens-getriggerd, één keer)

- Na convergentie van fase 5 + aangemaakte PR (fase 6) **pauzeert** de skill en meldt:
  *"Binnenloop schoon na N rondes. Draai nu `/code-review ultra <PR#>` als finale
  waterdicht-stempel."*
- Sebastiaan vuurt `/code-review ultra` af (billable, mens-only — agent mag dit niet zelf).
- Agent leest de ultra-bevindingen in, triageert, past must-fixes toe, en doet zo nodig
  **één** Codex-bevestigingsronde (`codex-reply`) dat de fixes houden. Pas daarna door naar
  merge (fase 8).

## Defaults (vetoë-baar, vastgelegd in deze sessie als akkoord)

- **Vorm:** één bestand `~/.claude/skills/big-ship/SKILL.md`, zoals `ship-feature`.
- **Hergebruik:** verwijzen naar `ship-feature` voor fases 0/6/8; 5b–5d identiek aan v2.
- **N approach-agents:** 3.
- **PR-strategie:** één feature-branch + één PR met milestone-gestructureerde commits
  (geen losse sub-PR's per milestone) voor v1.
- **Inner-loop `/code-review` effort:** `high` per ronde, `max` in de laatste ronde vóór PR.

## Edge cases

- **Codex MCP niet beschikbaar** (headless/cron, server down): 5a meldt "Codex-helft
  overgeslagen — MCP niet bereikbaar", de cross-check degradeert naar `/code-review` alleen,
  niets blokkeert.
- **Ultra niet beschikbaar / geen GitHub-remote:** fase 7 degradeert naar een laatste extra
  Codex-ronde + expliciete melding dat de ultra-stempel ontbreekt. Skill faalt niet hard.
- **Review-loop convergeert niet binnen 3 rondes:** stop, rapporteer residu, vraag
  Sebastiaan om beslissing (mergen-met-bekende-issues vs doorgaan).
- **Fix breekt typecheck/tests:** ronde-herverificatie vangt dit; Claude draait de fix terug
  en meldt 'm als "verworpen — brak de build".
- **Toernooi-agents convergeren op dezelfde aanpak:** judge mag dat melden; minder synthese
  nodig, direct door.
- **Doel blijkt te groot voor één big-ship-run:** decomponeer in sub-projecten (elk eigen
  big-ship of ship-feature cyclus) — net als de brainstorm-skill decompositie-regel.

## Out of scope (v1 van de skill)

- Gefaseerde multi-PR-builds (per milestone een eigen PR). Bewust uitgesteld; één PR voor nu.
- Automatisch starten van `/code-review ultra` door de agent — kan niet (billable, mens-only).
- Een eigen kosten-/budget-bewaking in de loop bovenop de bestaande review-kosten.
- Wijzigingen aan ship-feature v2 zelf of aan de globale settings/hooks — dat is het terrein
  van de parallelle v2-sessie.

## Acceptance criteria

De skill is "done" wanneer:

- [ ] `~/.claude/skills/big-ship/SKILL.md` bestaat met geldige frontmatter (`name`,
      `description` die de trigger-conditie + "niet voor kleine changes → ship-feature" dekt).
- [ ] De 8-fase-flow staat erin, met fases 0/6/8 als expliciete verwijzing naar
      `ship-feature` (niet gedupliceerd).
- [ ] Fase 1 (Verken), 2 (Toernooi), 5a (Review-loop), 7 (Ultra-gate) zijn volledig
      uitgeschreven, inclusief de exacte tools/commando's per stap.
- [ ] 5a beschrijft de 2-reviewer-rebuttal-lus exact: `/code-review` + `mcp__codex__codex` →
      kruislingse rebuttal → `fix(review):`-commit → typecheck/tests → `codex-reply` herreview
      → stop bij schoon óf 3 rondes → rapport-tabel. Expliciet: niets blokkeert automatisch.
- [ ] 5b–5d zijn identiek aan ship-feature v2 (build-gate altijd; browser/eval conditioneel
      met juiste triggers en "overgeslagen"-rapportage).
- [ ] De vier vastgelegde beslissingen zijn correct verankerd (auto-loop + 1 ultra-gate,
      echte rebuttal, approaches+judge N=3, schoon/max-3-rondes).
- [ ] De MCP-engine-keuze (`mcp__codex__codex` + `codex-reply`) staat erin, met de
      headless/cron-randvoorwaarde (MCP afwezig → Codex-helft vervalt veilig).
- [ ] Mens-checkpoints zijn expliciet gemarkeerd: toernooi-winnaar sign-off, spec/plan
      sign-off, ultra-gate trigger.
- [ ] Een "Wanneer NIET gebruiken" sectie verwijst naar `ship-feature` voor normale features.
- [ ] Een red-flags-tabel in de stijl van `ship-feature`.
- [ ] Chatmanta-specifieke noten (V1 hard rules, branch-conventie, migratie-check) staan erin
      óf worden via de ship-feature-verwijzing meegenomen.
```
