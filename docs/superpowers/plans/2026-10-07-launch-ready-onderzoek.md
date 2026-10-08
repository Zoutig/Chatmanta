# Launch-ready-onderzoek (nacht-run) Implementation Plan

> **For agentic workers:** dit is een onderzoeksplan voor één autonome sessie (spec §5: géén sign-off-gates, géén big-ship/ship-feature). Voer inline uit, stap voor stap; subagents alleen voor jury-, schrijf- en brainstormwerk. Steps gebruiken checkboxes. Kandidaat-specifieke code (fase 2) wordt pas in Task 6 vastgelegd, omdat de kandidaten uit de brainstorm komen.

**Goal:** 's ochtends om 07:30 een gerangschikt advies + PR-klare winnende botversie die de gewogen foutscore (spec §2) minimaliseert met 0 kritieke fouten.

**Architecture:** append-only V0-botversies (v0.13a…) met opt-in flags in `lib/v0/server/bots.ts` / RagConfig; meting via `eval:run --no-judge` → enriched JSON → geblindeerde Claude-jury (subagents) → deterministische scorer `eval-out/launch/score.cjs`. Holdout + Sol alleen in de eindvalidatie.

**Tech Stack:** Next.js/TS, tsx-scripts (`--conditions=react-server`), Supabase V0, OpenAI (Luna `gpt-6-luna`, Sol `gpt-6-sol` judge), Firecrawl.

Spec: `docs/superpowers/specs/2026-10-07-launch-ready-onderzoek-design.md`. Werkmap: `C:\Users\solys\Documents\Code\chatmanta-luna-test`, branch `feat/seb/launch-ready-onderzoek`. **Alle paden relatief aan die worktree.** Elke commit: eerst `git rev-parse --abbrev-ref HEAD` checken.

## Bestanden

- Create `docs/NACHT_LOG_2026-10-07.md` — logboek/hervatpunt (status per fase, spend-teller, beslissingen).
- Create `eval-out/launch/` (gitignored) — runs, jury-JSON's, foutenkaart, brainstorm, backups-index.
- Create `eval-out/launch/score.cjs` — leest jury-JSON (per rij `errors: [{severity, type, note}]`) → gewogen score per versie, kritiek-telling, gepaard beter/slechter/gelijk.
- Create `scripts/launch-crawl-org.ts` — map + scrape + `ingestSinglePage` naar een opgegeven org-id.
- Create `eval-fixtures/seed-questions-holdout.json` + `eval-fixtures/seed-questions-<nieuwe-org>.json` — holdout (tag `holdout`), via `eval:seed`.
- Modify `lib/v0/server/active-org.ts` — nieuwe `OrgSlug` voor de onbekende klant.
- Modify `scripts/v0-hard-eval-run.ts` (~r198) — judge-bron-cap 24k → 64k.
- Modify `eval-fixtures/label-corrections.json` — must-not-reparaties.
- Modify `lib/v0/server/bots.ts`, `lib/rag/*` — kandidaten (Task 6).
- Create `docs/LAUNCH_READY_RAPPORT.md` — eindrapport.

---

### Task 0: Heartbeat, logboek, pre-flight

- [ ] CronCreate recurring `7,27,47 * * * *` met prompt: *"NACHT-HEARTBEAT launch-ready-onderzoek: als je midden in werk zit, negeer dit. Anders: lees C:\Users\solys\Documents\Code\chatmanta-luna-test\docs\NACHT_LOG_2026-10-07.md en het plan docs/superpowers/plans/2026-10-07-launch-ready-onderzoek.md, en ga verder bij de eerste open stap. Is het rapport af of is het na 07:30: doe niets."*
- [ ] Maak `docs/NACHT_LOG_2026-10-07.md` met kop, budgettabel (`run | $ | cumulatief`), fase-status.
- [ ] Pre-flight: `npm run v0:chat -- "Wat zijn jullie openingstijden?"` (of het juiste argformat uit `scripts/v0-chat.mjs`) → moet antwoord geven. TIME_WAIT tellen (`Get-NetTCPConnection -State TimeWait | Measure`), <5000. Faalt iets → log + diagnose; niet doorgaan op kapotte basis.
- [ ] `npm run typecheck` + `npm run test:unit` groen als basis.
- [ ] Commit logboek.

### Task 1: Meetlat-reparatie

- [ ] `scripts/v0-hard-eval-run.ts`: judge-bron-cap van 24000 naar 64000 tekens (constante rond r198).
- [ ] `eval-fixtures/label-corrections.json`: `v061-hardfact-prijs-per-maand` must-not "€249" → specifieke adoptiefrase of verwijderen; `v063-hardfact-grounding-rate` must-not "85%" → verwijderen (corpus-doel). `npm run eval:relabel`.
- [ ] Persona-eisen die de bot niet kan weten (acme "werkgebied noemen", globex "controleer uw polis"): in de **Claude-jury-rubric** niet als fout tellen tenzij de info in de context stond. (Sol-persona's ongewijzigd laten; in het rapport vermelden.)
- [ ] Jury-rubric vastleggen in `eval-out/launch/jury-rubric.md` (ernstklassen spec §2, output-JSON-schema per rij: `{id, errors:[{severity:'kritiek'|'ernstig'|'licht'|'toon', type, note}], gold_covered:bool}`).
- [ ] `eval-out/launch/score.cjs` schrijven: gewicht kritiek=veto (apart geteld), ernstig 3, licht 1, toon 0.25; per versie totaal + per categorie; gepaard per (slug, run) beter/slechter/gelijk + sign-test p.
- [ ] Commit (code + labels).

### Task 2: Onbekende klant (nieuwe org)

- [ ] Kies site: publieke NL MKB-site, 15-50 pagina's, met tarieven- én team/contactpagina, geen klant-PII. Check met `firecrawl_map`. Leg keuze + reden vast in log.
- [ ] Nieuwe org-rij in V0 `organizations` (id `00000000-0000-0000-0000-0000000000a5`, slug `holdout-klant`) via service-role insert in het crawl-script (patroon van `scripts/v0-seed-orgs.ts`); `OrgSlug` + `KNOWN_ORGS` uitbreiden; `npm run typecheck`.
- [ ] `scripts/launch-crawl-org.ts`: `mapSite(url, 50)` → per URL `scrapeOne` → `ingestSinglePage(sb, orgId, page, …)` (signatuur lezen in `lib/v0/crawler/processCrawl.ts:196`). Draaien; check `npm run v0:list`-equivalent: aantal docs/chunks > 0.
- [ ] Org-settings (toon) zetten zoals andere orgs (`v0_org_settings`), toon `formal` of `informal` passend bij site.
- [ ] Commit script + org-slug.

### Task 3: Holdout-set (op slot)

- [ ] 4-5 subagents parallel (één per org, incl. holdout-klant): lees de KB-inhoud van die org (documenten/parents uit DB, dump via script naar `eval-out/launch/kb-<org>.md`), schrijf ~30 (nieuwe org ~40) vragen in het `seed-questions-*.json`-schema (slug-prefix `ho-`, `question_type`, `expected_kind`, `gold_answer` met letterlijk KB-citaat, `must_not_contain` alleen als adoptiefrase, `conversation_history` bij multi-turn). Mix per spec §3. Verbod: vragen die al in bestaande sets staan.
- [ ] Ik controleer steekproefsgewijs gold tegen KB; schrijf naar `eval-fixtures/seed-questions-holdout.json`; seed met `npm run eval:seed` (check dat het script extra fixture-files oppikt; zo niet, kleine uitbreiding).
- [ ] Slugs naar `eval-out/launch/holdout-slugs.txt`. **Niet gebruiken vóór Task 9.**
- [ ] Commit fixtures.

### Task 4: Foutenkaart (fase 1a)

- [ ] Basismeting v0.12e op screening-set: `npm run eval:run -- --versions=v0.12e --slugs=<dev40+probe17+extra> --runs=2 --interleave --no-judge --out=eval-out/launch/base-v012e.json` → `node eval-out/dev/enrich.cjs` → Claude-jury (subagents, batches van ~20 rijen, geblindeerd) → `score.cjs`.
- [ ] Extra screening-vragen (~20) per bekend foutcluster (team/namen, tarieventabel, rekenen, klacht, on-topic-niet-in-KB, multi-turn-verwijzing), tag `scr-`, geseed zoals Task 3.
- [ ] Historische fouten verzamelen: Sol v0.12e-afkeuringen (`eval_runs`, judge gpt-6-sol, version v0.12e), hard-eval reports `eval-out/hard/2026100*`, dev-set/r2/r3 claude-judge JSON's, V1-eval-notities. Één subagent per bron → rijen met ernst + oorzaak (retrieval/prompt/verifier/fallback/corpus/meetlat) + waar het feit in de KB stond (`misswhere.cjs`).
- [ ] Clusteren → `eval-out/launch/foutenkaart.md`: cluster, n, gewogen gewicht, voorbeelden, oorzaak.
- [ ] Log + commit log.

### Task 5: Brainstorm (fase 1b)

- [ ] 5 subagents parallel, elk één lens (retrieval · corpus/ingest · prompt/model · verifier/veiligheid/fallback · gespreksgedrag). Input: foutenkaart + relevante code-pointers (`lib/rag/run-rag-query.ts`, `chunker.ts`, `ingest.ts`, `hard-facts.ts`, `claims.ts`, `bots.ts`, `style.ts`). Output per idee: welke clusters, mechanisme, verwachte winst, risico (welke fouten kan het veroorzaken), latency, kosten, bouwtijd, testbaarheid.
- [ ] Synthese → matrix foutcluster × idee in `eval-out/launch/brainstorm.md`; schrappen wat geen bewezen fout raakt; bundelen tot 5-8 kandidaten, gerangschikt op (verwachte gewogen winst)/(bouwtijd), met risico-notitie.
- [ ] Log + commit log.

### Task 6: Kandidaten bouwen (fase 2) — per kandidaat herhalen

- [ ] Versie `V0_13<x>` = `V0_12E` + opt-in flag(s), toevoegen aan versielijst (patroon `V0_13R1` in `bots.ts`); `LATEST_BOT_VERSION` blijft `V0_12E`.
- [ ] Logica in `lib/rag/*` achter de flag; unit-test in `lib/rag/__tests__/` voor pure logica (bv. verifier-vraaggetallen, relatieve drempel, tabel-chunking).
- [ ] KB-wijzigende kandidaten: eerst backup `eval-out/backups/<tijd>-<wat>.json` (rijen documents/chunks/parents van de geraakte org) + noteer terugzet-commando; voer uit; vergelijkbaarheid: v0.12e opnieuw meten op de nieuwe KB.
- [ ] `npm run typecheck` + `npm run test:unit`; `npm run v0:clear-cache` voor geraakte orgs; commit per kandidaat.

### Task 7: Screenen (fase 3) — per kandidaat

- [ ] Run screening-set ×2 (zoals Task 4), check `fetch failed` < 10% en `bot_sources.length` plausibel.
- [ ] Claude-jury geblindeerd: rijen van kandidaat + v0.12e gemengd, versielabel weg; `score.cjs`.
- [ ] Afvallen bij ≥1 kritiek of gewogen score niet lager; TTFT p90 checken. Ranglijst in log.

### Task 8: Combineren (fase 4)

- [ ] Greedy forward selection vanaf beste kandidaat; elke stap screenen; houden als gewogen score daalt zonder nieuwe kritiek.
- [ ] Controle: volledige stapel. Kies beste combinatie + voorzichtige variant. Log.

### Task 9: Eindvalidatie (fase 5, start uiterlijk 04:30)

- [ ] Holdout-run top-2 + v0.12e ×1 (×2 als budget/tijd), Claude-jury geblindeerd, `score.cjs`.
- [ ] Hard-eval: `npm run eval:hard:run -- --versions=<top2>,v0.12e --no-multi-run --max-cost=0.3`, judge-queue via eval-runner-agent, `eval:hard:report`.
- [ ] Sol-ronde: `npm run eval:run -- --versions=<top2>,v0.12e --judge-model=gpt-6-sol` op de standaard-set (budgetcheck vooraf: ~$3/versie; skip v0.12e-Sol als budget krap, gebruik bestaande run met caveat).
- [ ] Winnaar: typecheck, unit, `Remove-Item -Recurse -Force .next; npm run build`, `npm run v1:eval` met tijdelijke LATEST-override **alleen lokaal niet gecommit** — of via rag-config-override — documenteer methode.

### Task 10: Rapport (fase 6, start uiterlijk 06:30)

- [ ] `docs/LAUNCH_READY_RAPPORT.md` per spec §7; sectie toevoegen aan `docs/LUNA_ONDERZOEK_RESULTATEN.md`; memory bijwerken.
- [ ] Commit + push branch. CronDelete heartbeat. Log afsluiten.
