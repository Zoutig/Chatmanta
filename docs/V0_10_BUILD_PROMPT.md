# v0.10 — Build-prompt (geef dit + de spec aan een nieuwe sessie)

> Plak de tekst hieronder als opdracht aan een verse Claude Code-sessie. Het is een **wrapper**
> rond de leidende spec `docs/V0_10_BUILD_CRITERIA_AUTONOOM.md` — niet een tweede spec. Beide
> staan op deze branch (`feat/seb/v0-10-autonoom`), dus de paden resolven.

---

```
/goal — Bouw ChatManta-botversie v0.10 (autonome nacht-build)

Je werkt in de ChatManta-codebase en kent de projectcontext. Dit is een wrapper rond één
leidend spec-bestand — niet een tweede spec.

## Bron van waarheid
`docs/V0_10_BUILD_CRITERIA_AUTONOOM.md` is je VOLLEDIGE, leidende opdracht: P1–P4 (prereqs),
C1–C13 (build-items, elk met "Klaar wanneer" + "Verifieer met"), §6 (Definition of Done). Lees
het bestand eerst volledig. **Conflicteert iets in deze wrapper met de MD, dan wint de MD.**
Deze wrapper voegt alleen de uitvoeringsbeslissingen + een paar repo-feiten toe die in de MD
onvoldoende scherp staan.

## Eerste actie (vóór je ook maar één bestand analyseert)
De branch `feat/seb/v0-10-autonoom` BESTAAT AL — aangemaakt off `origin/main` met déze spec +
prompt erop gecommit. Her-maak de branch NIET.
1. `git fetch origin`
2. Maak je worktree op de bestaande branch: `git worktree add ../chatmanta-v0-10
   feat/seb/v0-10-autonoom`. Kopieer `.env.local` erin en draai `npm ci` (worktrees hebben eigen
   node_modules; Turbopack-dev wil een echte install). Gebruik een vrije poort (`next dev -p 3001`).
3. **PRE-FLIGHT FAIL-FAST (kritiek):** draai één smoke-`npm run v0:chat`. Komt er GEEN echt
   antwoord terug (ontbrekende `OPENAI_API_KEY` in de worktree-`.env.local`, lege `node_modules`,
   etc.) → **STOP en rapporteer**. Ga NIET de nacht in met een kapotte setup — dan draait elke
   eval key-loos en is alles stil verspild. Pas door als de smoke een normaal antwoord geeft.
4. HARD-VERIFY vóór analyse: `git show HEAD:lib/v0/server/bots.ts | Select-String
   'LATEST_BOT_VERSION'` → moet `V0_9_3` tonen, en de hoogste migratie is `0045_*` (volgende
   veilige nummer = 0046). Klopt dit niet → STOP en rapporteer; bouw nooit op een tree waar
   v0.9.3 ontbreekt (anders kopieert P3 een stale snapshot en meet C11 de over-refusal tegen
   verkeerde code).

## Pre-flight: #168 is al gemerged (P2 = geen bouwwerk meer)
PR #168 (judge ziet volledige parent_content i.p.v. ≤800-char preview) zit al in `origin/main`
(commit `ce25dbc`) en dus in je base: caps `JUDGE_SOURCE_PER = 8000` / `JUDGE_SOURCE_TOTAL =
24000` in `scripts/v0-hard-eval-run.ts`. P2 is daarom **verifiëren + her-ijken**, geen nieuwbouw:
bevestig de caps en stel je baselines (v0.9.2/v0.9.3) empirisch opnieuw vast — vertrouw geen
onthouden verdict-getal (de oude "v0.9.2 = JA ~93% / v0.8.1 = NEE" is pre-#168). Zie MD §P2.

## Orchestratie — GEEN skill met sign-off-gates
Dit is een onbewaakte nacht-run. Gebruik **GEEN** `big-ship` (tournament-/spec-/ultra-sign-off-gates
stallen VÓÓR de bouw → de nacht is verspild voor er één C-item staat) en **GEEN** `ship-feature`
(spec/plan-sign-off kan onbewaakt pauzeren). Deze MD ÍS al je spec+plan. **Voer 'm zelf
stage-voor-stage uit als één sequentiële implementer** (P1→P4→C1→C13). Zet subagents alleen in als
**advies** op beslispunten (RAG-tuning C11, security AVG-laag C7–C9), en sluit af met een
adversariële **review-loop** (/code-review ⇄ Codex = de "Code Review Agent"). Bouw nooit een gate
die op een mens wacht. GEEN parallelle file-editors — die racen op `bots.ts` en breken de
tsc/build-gates. §3–§5 is **vaste, gesloten scope**; de ~45-criteria analyse-docs zijn achtergrond.

## Scope (gesloten)
- Bouw ALLEEN P1–P4 + C1–C13. Respecteer per criterium de build-vs-verify-marker: **C5 en C13
  zijn verify-only** (test/spot-check, geen nieuwbouw); **C6/C10 bedraden of verharden bestaande
  code** — niet her-architecteren. Kleinste correcte wijziging die "Klaar wanneer" +
  "Verifieer met" haalt.
- De brede kwaliteits-wishlist uit eerdere prompts (meertaligheid/taal-spiegeling,
  tone-of-voice-in-dashboard) is **al geshipt** (PR #166/#164, #155) → **verifieer dat het nog
  werkt op de v0.10-snapshot (valt onder C13), herbouw het NIET.** Staat iets niet als
  C/P-criterium in de MD, dan is het geen scope.
- §5 SHOULD-items en alles met `→V1` zijn **uitgesteld** — alleen aanraken als álle MUSTs groen
  zijn met budget/tijd over, anders loggen als "post-v0.10" in HANDOFF.md.

## Operationele loop-regels (herlees deze elke iteratie — ze overstemmen "blijf doorgaan")
- **Append-only.** Maak een nieuwe `V0_10`-config in `lib/v0/server/bots.ts`. De `V0_9_3`- en
  eerdere snapshots zijn BEVROREN. Zitten je vingers op een v0.9.x-snapshot → stop.
  `LATEST_BOT_VERSION` blijft v0.9.3 tot §6.4 (ná een acceptabele gate), en wordt dan ALLEEN op
  je branch omgezet — nooit gemerged/gedeployed.
- **Terminal state = een DRAFT PR op `feat/seb/v0-10-autonoom`.** Ná een groene gate ben je
  KLAAR: NIET mergen, geen `gh pr merge`, geen deploy/`vercel`, geen push naar main, PR niet
  ready-for-review zetten. "Blijf doorgaan" betekent nooit "merge". Mergen/deployen doet een
  mens 's ochtends (§2 Launch-DoD).
- **Budget.** Eval-spend ≤ **$15** voor de nacht, `--max-cost 2.50` per gate-run, judge = jij
  in-sessie ($0 — itereer op de $0 deterministische hard-eval; de betaalde
  answer-quality-gate alleen voor tussencheck + eindverificatie). **$20 = absolute noodrem, niet
  je budget.** Bij ~$15: stop billable eval-runs, log de rest in HANDOFF.md, ga door met $0-eval
  + code. Het gat $15→$20 is voor incidentele niet-eval-calls (smoke-tests), NIET voor extra
  gate-rondes.
- **Serialiseer eval en edit.** Edit `bots.ts` nooit (en draai /code-review --fix of Codex
  nooit) terwijl een `eval:run`/`eval:hard:run` loopt — tsx crasht met exit 9 en de run is
  onbruikbaar. Behandel elke exit-9 als tooling-botsing, NIET als bot-regressie: opnieuw
  draaien, niet her-tunen.
- **Migraties.** Nieuwe migratie nodig (C7/C8/C9)? Volgende veilige nummer is **0046** (check met
  de `check-migration` SKILL — niet `npm run check-migration`, dat bestaat niet — lokaal + open
  PRs). RLS + `organization_id NOT NULL` in DEZELFDE file. "Skip permissions" geldt voor
  commando's, NIET voor de AGENTS.md hard rules. Heeft C3/C7 een per-org instelling nodig
  (`daily_budget_usd`, `piiRedactionEnabled`) en bestaat die kolom/flag nog niet → kies de
  kleinste optie (env/const-default) en log een migratie pas als de MD het echt vereist; geen
  stille settings-uitbouw.
- **Calibratie-baseline: bevestig uit bewijs, niet uit geheugen.** De oude getallen (v0.9.2 = JA
  ~93%, v0.8.1 = NEE) zijn pre-#168 en mogelijk stale. Lees de werkelijke gate-output
  (`eval-out/hard/`) en stel je ijkpunt daarop vast vóór je C11/C12 tunet. Regressie-diff = tegen
  v0.9.2/v0.9.3.
- **Over-refusal-meting eerst betrouwbaar maken (P4).** De huidige over-refusal-maat is een regex
  op run[0] die false-positief is op goede "neem contact op"-antwoorden → onbetrouwbaar op n=30.
  Doe P4 (tel op het échte refusal-event + majority-of-N) VÓÓR je C11 tunet, en lees elke
  over-refusal-hit handmatig na. **≤5% is met n=30 niet hard te certificeren** — verwacht dus de
  §6.3-fallback (over-refusal aantoonbaar < v0.9.3 + 0 fabricatie + gap-analyse), dat is een
  volwaardige uitkomst, geen mislukking.
- **Veiligheid boven JA.** Lukt over-refusal omlaag niet zonder fabricatie te herintroduceren →
  blijf NIET de gate losser zetten om een JA te forceren. Neem de §6.3-Fallback. Een verzonnen
  PASS is een failure; een eerlijk gedocumenteerde gap is succes.

## Stop-conditie / Definition of Done
De stop-conditie is **Agent-DoD §6 van de MD, niet een groene eval.** Draai de betaalde
eind-gate maximaal ~2× binnen de $15-cap. Geen schone `PRODUCTIEWAARDIG: JA` haalbaar? Niet
eindeloos door-itereren — neem de **§6.3-Fallback**: lever v0.10 dat op élke deterministische as
≥ v0.9.3 is (no-fabricated-specifics ≥ v0.9.3, over-refusal < v0.9.3, niet trager) + een eerlijke
gap-analyse in HANDOFF.md. Verzin nooit een PASS. Voor `[CODE + HANDOFF]`-items (C2/C6/C8) =
"klaar" = code + faal-pad-test + exacte HANDOFF.md-stap; live provisioning (accounts,
prod-env-vars) is GEEN blocker en doe je nooit zelf. "Volledig autonoom" = geen sign-off nodig
voor de C1–C13-items (de MD pre-autoriseert ze, inclusief de migratie/cron/privacy-items), maar
het schrapt de per-criterium "Verifieer met"-gates niet en autoriseert geen werk buiten §3–§5.

## Deliverables op je branch
Alle commits (klein, per criterium, met schone `tsc --noEmit` + schone `Remove-Item -Recurse
-Force .next; npm run build` vóór elke commit) + `HANDOFF.md` (per handoff-item:
wat/waarom/exacte stap/hoe te verifiëren) + `V0_10_BUILD_REPORT.md` (wat groen, wat
BLOCKED-HANDOFF, gate-uitkomst, eval-spend, open beslissingen + de before/after
eval-vergelijking v0.9.3↔v0.10) + bewaar gate-output in `eval-out/hard/`. Optioneel: een draft
PR. Begin nu met de Eerste actie.
```
