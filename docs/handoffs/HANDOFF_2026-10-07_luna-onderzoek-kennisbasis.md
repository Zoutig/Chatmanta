# Handoff — Luna-pipeline-onderzoek: kennisbasis voor vervolgonderzoek — 2026-10-07

## ⚡ Resume in 30 seconds
> Plak in een verse sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta-luna-test`:
> **"Lees `docs/handoffs/HANDOFF_2026-10-07_luna-onderzoek-kennisbasis.md` en `docs/LUNA_ONDERZOEK_RESULTATEN.md`; dan start ik een nieuw onderzoek."**
> (Kopie van deze handoff staat ook in `~/.claude/handoffs/`, voor het geval de worktree wordt opgeruimd.)

- **Branch:** `feat/seb/luna-retrieval` (gepusht, géén PR) · **Worktree:** `C:\Users\solys\Documents\Code\chatmanta-luna-test`
- **State:** PR #263 **gemerged** (squash `6437855`, 2026-10-07). v0.12e is `LATEST_BOT_VERSION` en draait live in productie (Vercel-deploy `success`). V1-answer_cache is gepurged: 0 rijen, epoch +1 voor alle 4 V1-orgs. `feat/seb/luna-retrieval` is herbouwd op main (4 commits + deze handoff), gepusht, nog géén PR.
- **NEXT ACTION:** PR maken voor `feat/seb/luna-retrieval` (labels + r1-r3-experimentversies + docs + handoff), base `main`. Daarna start het vervolgonderzoek: zie Next steps 5.

## 🎯 Goal
Onderzoek hoe de RAG-pipeline het best rond **gpt-6-luna** (antwoordmodel, redeneren uit) gebouwd wordt, en een **launch-ready** chatbot opleveren. Zie spec `docs/superpowers/specs/2026-10-05-luna-pipeline-onderzoek-design.md`, plan `docs/superpowers/plans/2026-10-05-luna-pipeline-onderzoek.md`, en **alle cijfers in `docs/LUNA_ONDERZOEK_RESULTATEN.md`** (leidend document, per sectie gedateerd).

## ✅ Done (chronologisch, met commits)
- **Ablatie v0.12a1-a3** (rerank / decompose+HyDE / alles uit). Eerste run ongeldig door Windows-port-exhaustion; na een échte reboot geldig. → a3 leek gelijkwaardig + sneller.
- **Judge-fix**: de judge zag een afgekapte excerpt (≤800 / ~250 tekens) → nu `parentContentFull`, en sinds `58c5c99` ook `contentFull` voor chunks zonder parent.
- **Sol-ronde v0.11b vs a3**: a3 niet promoveren. **Kernvondst**: `MAX_CONTEXT_CHARS=12000` liet maar ~3 parents door, dus a3 testte "top-3 op similarity" in plaats van "Luna kiest uit 8".
- **v0.12b** (`890690e`): opt-in `maxContextChars` (32k) + `dedupeParents` → ~7 bronnen; de a3-regressies hersteld.
- **Vpb-rekenfout ontleed** (sectie in de resultatendoc): antwoord-eerst-prompt + Luna zonder redeneren + verifier-ruis + regenerate die opnieuw rekent.
- **Prompt-herziening v0.12c → c2 → d → e** (`4b50a01` … `61be138`). Daarnaast STIJL v4, `</answer>`-lek-fix en per-org eval-toon (`getEvalToneForOrgId`).
- **v0.12e** is de beste versie:
  - hard-eval gate **JA** (63/63, 53/53, 0 veto; klacht 6/6 stabiel);
  - Sol prod-ready 42% (v0.11b 30%), C 4,25, too_curt 74→20;
  - TTFT p90 4,3 s.
- **Promotie** `1be9d1b`: `LATEST_BOT_VERSION = V0_12E` → **PR #263** (tsc, unit 257/257, build en V1-eval 15/15 groen).
- **Faalanalyse** van de 108 Sol-afkeuringen: vooral meetlat (verouderde gold/legacy/persona-eisen) en retrieval-misses; maar 2 echt fout.
- **39 eval-labels** tegen de corpus gecorrigeerd (`17d966a`, al toegepast in de DB via `eval:seed` + `eval:relabel`).
- **Retrieval-spoor r1-r3** (`cc286a2`, `5ae559b`): meer context vindt meer feiten (46→62%), maar levert géén betere antwoorden en het klacht-veto komt terug → **v0.12e blijft**.
- Totale OpenAI-spend ≈ **$8,95**.

## 🚧 Where I left off (the live thread)
- Merge van #263 is geblokkeerd voor Claude. Alles daarna (cache-purge, PR voor `luna-retrieval`) is nog niet gedaan.
- Er hangt geen half-geschreven code. De worktree is schoon. Alles is gecommit en gepusht.

## ▶️ Next steps (ordered)
1. ~~Merge #263~~ ✅ en ~~V1-cache purgen~~ ✅ (2026-10-07). Optioneel: één vraag via de V1-widget testen om v0.12e live te zien.
2. PR voor `feat/seb/luna-retrieval` → base `main` (al op main herbouwd). Vul de PR-template.
3. ~~Branch `feat/seb/luna-test` opruimen~~ ✅. Worktree `../chatmanta-luna-test` alleen verwijderen als je `eval-out/` niet meer nodig hebt (gitignored; daar staan alle ruwe runs en judge-JSON's).
4. Vervolgonderzoek (de nieuwe sessie) — kandidaten, in volgorde van verwachte waarde:
   - **a. Precisie i.p.v. meer context**:
     - corpus-opschoning (de ChatManta-dev-org bevat een gecrawlde catering-demosite `v0-demo1-website.vercel.app` die prijsvragen vervuilt);
     - een minimale relevantie per extra chunk;
     - betere chunking van tabellen/teamlijsten (tarieventabel en teamlijst worden slecht gevonden).
   - **b. Verifier-gat**: de hard-fact-verifier flagt getallen uit de vraag en afgeleide sommen als `unsupported` → de regenerate kan correcte rekenantwoorden breken. Idee: vraag-getallen en eenvoudige afleidingen als gegrond tellen.
   - **c. Meetlat**:
     - hard-eval-judge-cap van 24.000 tekens (`scripts/v0-hard-eval-run.ts` ~r198) omhoog of per bron;
     - persona-eisen die de bot niet kent (acme "werkgebied noemen", globex "controleer uw polis") als org-config in de prompt óf uit de rubric;
     - must-not "€249" bij `v061-hardfact-prijs-per-maand` en "85%" bij `v063-hardfact-grounding-rate` zijn te breed.
   - **d. Namen stellig tegenspreken** (Jan de Vries, Roel de Wit, Mark Visser): lukt de prompt maar half. Eerst moet de teamlijst wél in de context komen.
   - **e. Latency**: p95 totale latency 7-8 s (budget 5,5 s), TTFT is wel goed. Eventueel `OPENAI_SERVICE_TIER=priority` meten (Task 10 uit het plan staat nog open).

## 🧠 Decisions & rationale
- **v0.12e = standaard.**
  - Rerank, decompose en HyDE staan uit: Luna kiest met 32k context zelf beter. Dat scheelt ~1-2 s TTFT.
  - Rerank was alleen load-bearing onder de oude 12k-cap.
- **Hybrid search blijft aan in V0.** Uitzetten gaf meer feiten in de context, maar Luna raakte inhoudelijk afgeleid (catering-uitweidingen). V1 heeft geen hybrid-RPC (bewust, `supabase/migrations-v1/0002`); niet porten zonder plan.
- **Géén grotere context (topK 16 / 48k).** Netto niet beter, +43% kosten, en het klacht-veto komt terug doordat de schadeprocedure binnenkomt.
- **Klachten**: strenge lijn — geen vergoedingscategorieën noemen, ook niet voorwaardelijk, ook niet als de bron ze noemt. Gekozen als launch-veilig.
- **Matched-span uit** (vanaf v0.12c2/d): "baseer primair op MATCHED_SPAN" + dubbele tekst kostte plek; zonder passen er meer bronnen.
- **Eval-toon per org** (globex/initech `formal`): de judge-persona verwacht "u". Gevolg: Sol-scores van vóór 2026-10-06 22:00 (je-vorm) zijn niet 1-op-1 vergelijkbaar.
- **Geen nieuwe Sol-ronde na de labelreparatie** (keuze Seb).
- **Algemene-kennisvragen blijven geweigerd** (beleid, `generalKnowledgeEnabled:false`). De oude `general-*`-vragen zijn legacy-getagd.

## ⚠️ Dead-ends & gotchas (don't repeat)
- **Context-cap-landmijn**: check bij elke retrieval/ablatie eerst `bot_sources.length` per antwoord. Wat je denkt mee te geven komt misschien niet in de context.
- **Judge zag niet wat de bot zag**: altijd verifiëren dat de judge de volledige parent/chunk krijgt. Gefixt in `eval:run` (`includeFullParentContent`), maar de hard-eval heeft nog de 24k-cap.
- **Windows "Snel opstarten" aan** → Afsluiten reset de netwerkstack niet. TIME_WAIT-port-exhaustion (~20k sockets naar poort 53/443) gaf 74% `fetch failed`. Alleen "Opnieuw opstarten" helpt. Check: `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` en het aantal TIME_WAIT.
- **Sol-kosten**: ~$1,84-2,71 per 186 vragen (meer met volledige parents in de judge-prompt). Ramingen van $1,50 waren te laag.
- **Ramingen voor een her-run van een kapotte run** zijn te laag als de kapotte run vóór de LLM-call faalde.
- **`npm run eval:hard:run -- --help` start een échte run** (er is geen help-flag). Niet doen.
- **must-not-regex matcht ontkenningen** ("Sophie werkt niet" → "Sophie werkt"). Gebruik adoptie-frasen.
- **Bestanden in deze repo zijn CRLF in de working copy**: Python-replace met `\n` faalt stil. De Edit-tool werkt wel.
- **Merge en "LATEST wijzigen" triggeren de auto-mode-classifier** (Merge Without Review / Production Deploy). Een expliciet "merge het" / "zet LATEST" van Seb in de chat maakt het mogelijk.
- **Na een squash-merge niet rebasen** op main (alle oude commits worden opnieuw toegepast → conflicten). Herbouw de branch met `git checkout -B <branch> origin/main` + cherry-pick van alleen de nieuwe commits.
- **V1 answer_cache keyt op `'v1.0'`**: elke bot-config-wijziging vereist een cache-purge.

## ❓ Open questions / waiting on Sebastiaan
- Welke vervolgrichting (5a-e) voor het grote onderzoek? Mijn aanbeveling is **4a (precisie/corpus/chunking) + 4b (verifier)**: dat zijn de grootste resterende inhoudelijke gaten.

## 🗂️ Git & environment snapshot
- Branch `feat/seb/luna-retrieval`: 0 achter origin/main, schoon, alles gepusht.
- Open PRs: #261 (privacy, andere sessie), #207 (devcontainer). #263 is gemerged.
- Background tasks: geen.
- Dev server: niet actief.

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta-luna-test
git fetch origin; git checkout feat/seb/luna-retrieval
# .env.local en node_modules staan al in deze worktree
npm run typecheck; npm run test:unit
```

## 🧰 Tooling die er ligt (gebruik dit)
- `npm run eval:run -- --versions=… --slugs=… --runs=2 --interleave --no-judge --out=eval-out/dev/x.json`: goedkope bot-only-run (~$0,001/antwoord). Met judge: `--judge-model=gpt-6-sol` (duur) — zonder `--no-judge` schrijft hij naar `eval_runs`.
- `npm run eval:hard:run -- --versions=vX --no-multi-run --max-cost=0.2`: Laag-1 (~$0,07). Daarna moet de judge-queue door Claude (eval-runner-agent, $0) + `npm run eval:hard:report`.
- `npm run v1:eval`: 15 V1-cases (~$0,005).
- `npm run eval:seed` / `eval:relabel` (`_gold`, `_must_not`, `_legacy` in `eval-fixtures/label-corrections.json`).
- Sets:
  - dev-set (40): `eval-fixtures/dev-set-luna.json` (`slugsCsv`);
  - probe (17 lastige): `eval-out/dev/probe-slugs.txt`;
  - retrieval-gat-set (52): `eval-out/dev/retr-slugs.txt`.
- Hulpscripts in `eval-out/dev/` (**gitignored** — overweeg ze te promoveren naar `scripts/`):
  - `enrich.cjs`: volledige parent bij bronnen;
  - `factcov.cjs`: dekking van gold-feiten in de context, per versie + gepaard;
  - `misswhere.cjs`: waar ontbrekende feiten in de KB zitten;
  - `show.cjs`: antwoorden per slug naast elkaar;
  - `apply-labels.cjs`: labelvoorstel toepassen.
- Judge-JSON's met per-rij-scores: `eval-out/dev/*.claude-judge.json`; hard-eval: `eval-out/hard/2026100*-{verdicts,report}`.
- Werkwijze die goed werkte: probe (17×2, $0,04) → dev-set (40×2, ~$0,09) + hard-eval ($0,07) → Claude-judge via de `eval-runner`-agent (geblindeerd per vraag, $0) → pas dan Sol ($2-3).

## 📎 Context pointers
- Memory: [[luna-pipeline-onderzoek-2026-10]] · [[eval-cache-and-run-gotchas]] · [[v0-version-history]] · MEMORY.md
- Code:
  - `lib/v0/server/bots.ts` (V0_12E_SYSTEM_PROMPT, V0_12E, LATEST);
  - `lib/rag/run-rag-query.ts` (context-opbouw ~r2110-2150 met `maxContextChars`/`dedupeParents`, `parseV03Output`, verify/regenerate ~r2380-2760);
  - `lib/rag/style.ts` (STIJL v4);
  - `lib/v0/server/eval.ts` (judge-bronnen, per-org toon);
  - `lib/v0/server/eval-personas.ts`;
  - `app/v1/app/rag-config.ts` (V1 = LATEST + overrides).
- Docs: `docs/LUNA_ONDERZOEK_RESULTATEN.md` (alle tabellen), spec en plan in `docs/superpowers/`.
