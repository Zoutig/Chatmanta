# Plan: van v0.9 naar een productiewaardige, werkende bot — in V0 — overdracht aan code-agent

> **Aan de uitvoerende code-agent:** dit is een zelfstandig, uitvoerbaar vervolgplan. Je hebt de
> brainstorm-conversatie niet nodig — alle context, bevindingen en regels staan hieronder. Lees §A–§E
> vóór je begint; voer dan de fasen in volgorde uit. Werk in een aparte git-branch/worktree, commit klein en vaak.
>
> **Scope-beslissing (door Sebastiaan, 2026-05-27):** dit plan blijft **volledig binnen V0**, op **fake/
> geanonimiseerde demo-data**. Géén V1, géén auth, géén echte klant, géén echte PII. Doel = de bot-engine
> én de end-to-end demo-flow naar **productiewaardig V0-niveau** tillen. Dat is de "V0-done = launch-readiness"-
> lijn; de échte V1-kickoff (Supabase Auth, 2e prod-DB, klant-onboarding) is een **latere, aparte** stap en
> staat **buiten dit plan**.
>
> **Voorganger:** PR #113 (`feat(v0.9): bot-engine iter2`), gemerged 2026-05-27 als `279115d`. Eindstatus
> `PROMOTED`. De volledige sessie-data staat in `docs/PR113_SESSIE_HANDOFF.md` + `docs/evals/2026-05-26-*.md`.
> **Bron-/achtergronddocs (lezen aanbevolen):** `docs/PR113_SESSIE_HANDOFF.md`,
> `docs/PRODUCTIEWAARDIGE_BOT_VERVOLGPLAN_ANALYSE.md`, `docs/PLAN_PRODUCTIEWAARDIGE_BOT_ENGINE_HANDOFF.md`,
> `docs/evals/2026-05-26-v0.9-analysis.md`, `AGENTS.md` (hard rules).

---

## A. Context — waar staat ChatManta nu?

ChatManta is een RAG website-chatbot SaaS voor MKB. Kernregel: **anti-hallucinatie boven volledigheid**
(liever een eerlijk "dat weet ik niet" dan een zelfverzekerde leugen).

- `LATEST_BOT_VERSION = v0.9` (`lib/v0/server/bots.ts`), append-only op v0.8.1 + flag
  `hardFactDeterministicRefusal`. v0.9 vervangt bij een **ongegronde** hard-fact-hallucinatie
  (`hardFactSupported=false && retrievalStrength ∈ {weak, medium}`) het antwoord deterministisch door een
  eerlijk weiger/doorverwijs-template, i.p.v. een onbetrouwbare tweede LLM-poging.
- De omgeving is **V0**: een sandbox-RAG-leerplatform op **fake demo-data** (orgs `acme-corp`/`globex-inc`/
  `initech`/`dev-org`), zonder per-user auth. Active eval-corpus n=176. Nieuwe botversies zijn append-only
  `v0.x`-configs; v0.8.1 en alle voorgangers blijven byte-identiek.
- De eval-infra is volwassen: noise-floor + 95%CI, pairwise per `question_type`, deterministische must-not-
  en hard-fact-gates, twee benoemde threshold-sets (zie §B), en `$0`-diagnose-scripts (`audit:*`).

### De meetlat-stand ná v0.9 (let op: v0.9-cijfers zijn **n=1**)

De v0.9-proof-eval was runs=1 (de runs=3-herbevestiging is bewust overgeslagen onder de $10-cap — dit is de
**#1 openstaande caveat** en de eerste taak van dit plan). V0 Controlled Engine Gate na v0.9 (n=1 snapshot):

| dimensie | v0.9 | target | status |
|----------|------|--------|--------|
| avg correctness | 3.59 | ≥3.25 | ✓ |
| avg completeness | 3.66 | ≥3.5 | ✓ (net) |
| avg grounding | 3.84 | ≥3.62 | ✓ |
| production-ready rate | 0.50 | ≥0.50 | ✓ (op de drempel) |
| route-correct rate | 0.91 | ≥0.90 | ✓ (net) |
| **zero-correctness rate** | **0.09** | ≤0.02 | ✗ HARD |
| **must-not violations** | **4** | =0 | ✗ HARD |
| **unsupported hard facts** | **3** | =0 | ✗ HARD |
| source-citation rate | 0.50 | ≥0.75 | ✗ (eval-artefact, zie §Fase 2) |
| p95 total_ms | 11089 | ≤8000 | ✗ |
| p95 first_token_ms | 7831 | ≤1500 | ✗ |

**De drie HARD safety-gaten + de twee latency-gaten + het citation-meetartefact zijn wat "productiewaardig
in V0" nog in de weg staat.** Drie kwaliteitsdimensies (completeness/prod-ready/route-correct) staan net op
of boven de drempel maar zijn fragiel bij n=1 — die moeten op runs=3 stabiel blijven.

### De 4 must-not-cases (al gekarakteriseerd in PR #113 — start hier niet vanaf nul)

Alle 4 zitten op dev-org `v063-hardfact-*` en zijn **content/context-fouten, geen hard-fact-absentie**:
`tarief-per-gesprek` (€0,07), `max-doc-size` (10 MB), `grounding-rate` (85%), `aantal-pricing-tiers`
("vijf tiers"). De getallen **stáán in de dev-blueprint** (infra-cijfers) → `retrievalStrength=strong` /
`hardFactSupported=true` → **v0.9's `weak/medium`-gate vuurt daar niet**. De bot gebruikt een echt-bestaand
corpus-getal in de **verkeerde context**. Dit vergt een ánder mechanisme dan v0.9 (zie Fase 1).

---

## B. Wat "productiewaardig in V0" betekent (de definition-of-done)

> **Term-afbakening (verplicht — niet overinterpreteren):** "productiewaardige werkende bot" betekent hier
> de **V0 Controlled Engine Gate gehaald op fake/demo-data, op runs=3, mét end-to-end werkende demo-flow**.
> Het betekent **niet** dat ChatManta als totaalproduct klaar is voor echte klanten — dat vereist later
> V1-auth, tenant-isolatie, klant-specifieke source-audit + evalset, monitoring, rollback en budget/rate-
> limits, en valt buiten dit plan.

Productiewaardig in V0 = **alle vier** waar:

1. **V0 Controlled Engine Gate = PASS op runs=3** (niet n=1), met de HARD safety-gates onverlaagd:
   `must-not = 0`, `unsupported hard-fact = 0` (m.u.v. goedgekeurde calc-/echo-warning), `zero-correctness ≤ 0.02`.
2. **Geen regressie** op een eerdere botversie (append-only discipline; pairwise + per-org check).
3. **End-to-end demo-flow groen** voor de 4 demo-orgs: crawl → ingest → kennisbank → widget-embed-chat
   antwoordt correct → dashboard toont gesprekken + onbeantwoorde vragen (zie Fase 3).
4. **Alles gedocumenteerd** in de eval-docs + een korte "V0-done"-status.

### Twee gates (uit PR #104 — niet destructief overschrijven)

- **Aspirational Production Gate** = de hoge langetermijndrempels (bv. correctness ≥4.0, prod-ready ≥0.80).
  Blijft zichtbaar als lat voor later; **hoeft nu niet gehaald.**
- **V0 Controlled Engine Gate** = op de noise-floor herijkt; **bepaalt promotie binnen V0.** HARD safety-gates
  zijn in beide identiek en onverlaagd.

Beide blijven naast elkaar in het report staan zodat herijking transparant is en niet als "groen-rekenen" voelt.

---

## C. Hard rules — niet schenden (uit `AGENTS.md` + PR #104/#113-praktijk)

- **Geen echte klantdata in V0.** Tune alleen op fake/geanonimiseerde demo-data. (Echte PII = V1, buiten scope.)
- **Anti-hallucinatie boven volledigheid.** Bij geen relevante bron: eerlijk weigeren, niets verzinnen.
- **Geen prompt-only refusal/hallucination-fix.** Bewezen onbetrouwbaar (LLM blijft adopteren — zie de
  v0.8.1 history-entity-les en v0.9). Consolideer in een **bestaande** verify/regenerate/template-laag.
- **Geen nieuwe parallelle gating-laag** naast `decideRagStrategy` / `reclassifyAfterZeroHits` /
  `detectInjection` / threshold-filter / cascade / hard-fact-verifier / claim-verificatie / regenerate.
- **Append-only botversies.** Nieuwe versie = `{ ...vorige }`, flag-guarded; vorige versie byte-identiek.
- **Safety-gates blijven HARD.** Niet verlagen om groen te worden: must-not = 0, unsupported hard-fact = 0,
  zero-correctness ≤ 0.02. (Drempel-herijking op de noise-floor mág — alleen op aspirational
  kwaliteitsdrempels, nooit op de safety-gates.)
- **Niet versoepelen:** `claim-regenerate` OR→AND, `hardFactNumericFallback: false`, partial answering als default.
- **Kies één botfix per sessie/iteratie.** Meerdere gelijktijdige botwijzigingen zijn onbewijsbaar + risicovol.
- **Eval kost geld — zet vóór élke betaalde stap een kostenraming neer** (# vragen · # versies · # runs ·
  # bot-/judge-/pairwise-calls · USD-range). **Boven ~$8 of buiten een afgesproken cap → niet draaien zonder
  expliciete go van Sebastiaan** (billable, onomkeerbaar). Diagnose-scripts (`audit:*`) zijn $0.
- **Migratie-nummercheck vóór een nieuwe migration** (`ls supabase/migrations | sort | tail -3` + open PRs).
  Dit plan voegt waarschijnlijk geen migration toe, behalve mogelijk Fase 2 (latency-instrumentatie).

---

## D. De iteratie-loop (het bewezen patroon van #104 en #113)

Elke botversie-stap in dit plan volgt dezelfde lus. Wijk hier niet van af — hij is twee keer succesvol gebleken.

1. **Diagnose ($0):** lees uit `eval_runs` met de `audit:*`-scripts; karakteriseer de faalmodus (n, #orgs,
   echt-vs-artefact). Verifieer ≥5 cases handmatig (`bot_answer` + `judge_reasoning` + `bot_sources[].excerpt`).
2. **Beslisgate:** een botfix mag alleen als de faalmodus voldoet aan **ÁLLE** voorwaarden: ≥8 echte cases ·
   ≥2 orgs · niet primair eval/judge/label-artefact · één kleine wijziging in één bestaande laag verklaart
   ≥60% van de bucket · geen nieuwe parallelle gate · geen prompt-only refusal-fix · regressierisico helder
   en gemitigeerd. Anders: géén botfix (eval/meetlat-fix of "meer data").
3. **Bouw ($0):** append-only `{...vorige}`-config + flag; fix in de gekozen bestaande laag; pure beslis-helper
   waar mogelijk (tsx-getest, zie `shouldDeterministicallyRefuseHardFact` als sjabloon). `tsc --noEmit` +
   `test-bot-defaults.ts` PASS; vorige versie byte-identiek; smoke 1 case per bucket (~$0.01).
4. **Bewijs (betaald, met kostenraming + cap):** `eval:run` (LATEST vs kandidaat) + gerichte `--runs=3` op het
   effectgebied + `eval:report` + pairwise.
5. **Promoveer of houd vast:** PASS op de V0-gate + geen promoveer-niet-trigger → `LATEST_BOT_VERSION`
   verschuiven + assert in `test-bot-defaults.ts` ophogen. Anders vasthouden; documenteer als volgende iteratie.

**Promoveer-niet-triggers (enumeratie):** must-not stijgt / nieuwe violation · unsupported hard-fact stijgt
(buiten warning) · zero-correctness stijgt · factual daalt buiten ruis (~0.12 judge-noise) · andere org
regredieert op absolute C/P/G · safety-bucket verslechtert · verbetering alleen in small-n/judge-ruis ·
p95 explodeert. Een nieuwe/gestegen HARD safety-violation = **absolute blocker**.

---

## E. Open beslissing die het plan markeert (niet stilletjes invullen)

**Latency-drempels herijken vs een fast-path bouwen.** De gate eist p95 total ≤8000ms en first_token ≤1500ms,
maar de latency-diagnose (PR #113) liet zien: `generation_ms` (de `gpt-4o-mini` answer-call) is de onvermijdelijke
dominante stage, en first_token ≈ de som van de pre-answer-pijplijn (preprocess+decompose+rerank, p50 ~3800ms) —
géén streaming-bug. **first_token ≤1500ms lijkt vastgesteld vóór deze multi-stage pijplijn bestond en is
waarschijnlijk onrealistisch zonder model-/architectuurwijziging.** Twee opties; **Fase 2 kiest, met data:**

- **(Aanbevolen) Herijk de latency-drempels op de noise-floor** (net als de #104-kwaliteitsdrempels), met een
  transparante onderbouwing (oud → noise-floor → nieuw). Géén risicovolle keten-herschrijving in een V0-iteratie.
- **(Alleen als de diagnose een veilige winst toont) Bouw een flag-guarded fast-path** die preprocess/decompose/
  rerank conditioneel overslaat bij simpele factual queries — maar dit vereist éérst `adaptive_decision` op
  `eval_runs` (staat nu alleen op `query_log`, migration 0023), anders is path-onderbenutting niet meetbaar.

---

## Fase 0 — Basislijn vastpinnen: v0.9 op runs=3 (BETAALD, ~$5)

> De #1 caveat uit PR #113: v0.9 is bewezen op **n=1**; de aggregaat-deltas zijn "within measured noise". Vóór
> je er iets op bouwt, moet de v0.9-promotie hard zijn. Dit is de fundament-stap — sla 'm niet over.

### Task 0.1 — Worktree, branch & precheck ($0)
- [ ] Worktree + branch (nooit op `main`): `git worktree add ../chatmanta-v0-prod feat/seb/v0-naar-productiewaardig`.
- [ ] `.env.local` aanwezig + **actief** (`OPENAI_API_KEY` + Supabase service-role niet uitgecommentarieerd).
      Worktree wil een echte `npm ci` (junction volstaat niet voor een eval-run).
- [ ] `node --import tsx scripts/test-bot-defaults.ts` → PASS, `LATEST_BOT_VERSION = v0.9`.
- [ ] `npm run audit:retrieval` + `npm run audit:labels` → bevestig dat retrieval níet de bottleneck is en
      dat de active-corpus-telling (n=176) en labels nog kloppen (geen nieuwe legacy-drift).

### Task 0.2 — v0.9 runs=3-herbevestiging (BETAALD)
- [ ] **Kostenraming printen** (# vragen · # versies · # runs · bot-/judge-/pairwise-calls · USD-range). Verwacht
      ~$5 voor v0.8.1 vs v0.9, runs=3 op de safety-/effect-buckets (must-not/hard-fact/out_of_corpus + factual).
      Boven cap → STOP en vraag Sebastiaan.
- [ ] `npm run eval:run -- --runs=3` op de relevante buckets (of full-corpus runs=3 als budget het toelaat).
- [ ] `npm run eval:report` → vergelijk de runs=3-aggregaten + 95%CI met de n=1-cijfers uit §A.
- [ ] **Beslissing:**
      - v0.9 houdt z'n verbetering + geen HARD-regressie → v0.9 blijft LATEST; dit is de nieuwe, harde basislijn.
      - v0.9 valt binnen ruis terug of regredieert op een HARD-gate → documenteer; overweeg rollback naar v0.8.1
        (append-only, dus triviaal) en herzie Fase 1 op de v0.8.1-basislijn. **Vraag Sebastiaan bij rollback.**
- [ ] Schrijf `docs/evals/<datum>-v0.9-runs3-herbevestiging.md` (topline + per-bucket + CI + verdict).
- [ ] Commit: `docs(eval): v0.9 runs=3-herbevestiging — <verdict>`.

**Exit-criterium Fase 0:** er is een harde (runs=3) basislijn waarop de rest van het plan rust.

---

## Fase 1 — HARD safety-gaten dicht (de kern van "productiewaardig")

> Doel: `must-not 4→0`, `unsupported-hard-fact 3→0`, `zero-correctness →≤0.02`. Dit zijn de blokkerende HARD-gates.
> Volg de loop (§D): één botfix per iteratie. Begin met de must-not-4 — die zijn het scherpst gekarakteriseerd
> en zijn de expliciete v0.next-kandidaat uit PR #113. De eerste fix is hieronder tot taak-niveau uitgewerkt;
> daarna herhaal je de loop voor de resterende HARD-residu's.

### Task 1.1 — Diagnose de must-not-4 (content/context-misuse) ($0)
- **Files:** lees `lib/v0/server/rag.ts` (regenerate-laag), `lib/v0/server/hard-facts.ts`,
  `lib/v0/server/claims.ts`; gebruik `npm run audit:subtax` + `audit:taxonomy`.
- [ ] Bevestig per case (de 4 dev-org `v063-hardfact-*`) dat het getal **wél in het corpus** staat maar in de
      **verkeerde context** wordt gebruikt (niet `hardFactSupported=false`). Dit is waarom v0.9's gate niet vuurt.
- [ ] Bepaal de root-cause-klasse: `surrounding_context_overuse` (bot pakt een naburig infra-getal) vs
      `matched_span_misuse` (bot herinterpreteert een getal uit de juiste chunk). **Mist `eval_runs` de final
      assembled context hiervoor?** (`eval_runs` slaat alleen `bot_sources[].excerpt` op.) Zo ja: doe een kleine
      `$0`-instrumentatie op een dev-run (log de final context) of lees de runtime — **diagnose niet blind.**
- [ ] Toets de beslisgate (§D-stap 2). Reproduceerbaar over ≥2 orgs? De must-not-4 zijn dev-org-zwaar — als ze
      níet generaliseren buiten dev-org, overweeg of dit een **corpus-/label-kwestie** is (de dev-blueprint bevat
      infra-cijfers die geen klant-bot ooit zou moeten noemen) i.p.v. een botfix. Wees hier streng.

### Task 1.2 — Kies & bouw de minimale fix (append-only v0.10) ($0)
- **Files:** `lib/v0/server/bots.ts` (nieuwe versie ná `V0_9`; registreer in `BOTS` + `BOT_VERSIONS_ORDERED`);
  de gekozen bestaande laag; eventueel een pure helper + `scripts/test-*.ts`.
- [ ] Append-only `const V0_10 = { ...V0_9, version: 'v0.10', label, description, <flag> }`. **Nog niet**
      `LATEST_BOT_VERSION` wijzigen.
- [ ] Implementeer de fix **flag-guarded** in de bestaande laag, zodat v0.9 byte-identiek blijft. Waarschijnlijke
      richting (afhankelijk van Task 1.1): verscherp de context-/claim-grounding zodat een getal alléén geciteerd
      wordt als het in de **juiste** context-span staat — geen nieuwe gate, geen prompt-only fix.
- [ ] Pure beslis-helper waar mogelijk (sjabloon: `shouldDeterministicallyRefuseHardFact` in `hard-facts.ts`),
      met een eigen tsx-test (`scripts/test-*.ts`) die de must-not-4 reproduceert + de regressie-mitigatie borgt
      (een gegrond, correct geciteerd getal mag NIET geweigerd worden).
- [ ] `npx tsc --noEmit` + `node --import tsx scripts/test-bot-defaults.ts` + de nieuwe test → PASS; v0.9 ongewijzigd.
- [ ] Smoke 1 case per must-not-slug (~$0.01): `npm run v0:chat -- --org dev-org --v v0.10 --q "<must-not vraag>"`.
- [ ] Commit: `feat(v0.10): <fix> via <bestaande laag>; append-only, v0.9 byte-identiek`.

### Task 1.3 — Bewijs (BETAALD) + promotie-beslissing
- [ ] **Kostenraming printen**, cap respecteren. `npm run eval:run` (v0.9 vs v0.10) + gerichte `--runs=3` op de
      must-not-/hard-fact-/out_of_corpus-buckets + `eval:report` + pairwise.
- [ ] Toets de promoveer-niet-triggers (§D). Vereist: **must-not daalt (richting 0) zonder nieuwe violation**,
      geen HARD-regressie, geen org regredieert.
- [ ] PASS → `LATEST_BOT_VERSION = v0.10` + rationale-comment + assert ophogen. FAIL maar verbetert → vasthouden,
      documenteer. Schrijf `docs/evals/<datum>-v0.10-analysis.md`.
- [ ] Commit: `docs(eval): v0.10 promotie-analyse — <verdict>`.

### Task 1.4 — Herhaal de loop voor de resterende HARD-residu's
- [ ] Na de must-not-fix: hermeet `unsupported-hard-fact` en `zero-correctness` op runs=3. Een deel kan al
      meebewegen of binnen ruis verdwijnen. Voor wat overblijft én de beslisgate haalt: nieuwe append-only
      iteratie (v0.11, …). **Eén fix per iteratie.** Stop met itereren zodra de drie HARD-gates op runs=3 groen zijn
      of zodra de beslisgate géén legitieme botfix meer aanwijst (dan is het meetlat-/corpus-werk, geen botversie).

**Exit-criterium Fase 1:** `must-not = 0`, `unsupported-hard-fact = 0`, `zero-correctness ≤ 0.02` op runs=3 —
óf een gedocumenteerde, onderbouwde conclusie dat een resterend residu een meet-/corpus-artefact is.

---

## Fase 2 — Kwaliteits- & meetgaten dicht

> Doel: de niet-safety gate-fails sluiten zonder groen te rekenen. Veel hiervan is **meetlat-werk** ($0 of goedkoop),
> geen botfix. Volg de beslisgate strikt: bouw alleen een botversie als de data het draagt.

- **Citation-rate (0.50, gate ≥0.75) = eval-artefact, geen botzwakte.** De diagnose (PR #113) toonde: de bot
  emitteert markers in 64% van de antwoorden, maar `source_citation_binding` meet claim-herleidbaarheid op een
  afgekapt ~800-char excerpt, niet de `[N]`-markers; 54% van de "false"-cases is gegrond (G≥3). **Fix de meting,
  niet de bot:** geef de judge een langer/volledig bron-excerpt voor de binding-beoordeling, óf herclassificeer
  `source-citation rate` als meet-artefact i.p.v. promotie-drempel. $0–goedkoop. Geen botversie.
- **Latency (p95 total/first_token).** Voer de open beslissing uit §E uit: draai eerst de latency-diagnose-update
  (eventueel `adaptive_decision` aan de eval-snapshot toevoegen — dit is mogelijk een **migration**, doe dan de
  nummercheck), en kies dan herijken (aanbevolen) of een flag-guarded fast-path. Documenteer transparant.
- **Completeness / production-ready / route-correct** staan net op/boven de drempel maar zijn fragiel bij n=1.
  Bevestig op runs=3 dat ze **stabiel** boven de drempel blijven. Als ze terugvallen: dat is input voor een
  volgende grounding-iteratie (loop §D), geen drempelverlaging.

**Exit-criterium Fase 2:** alle niet-safety gate-dimensies zijn PASS op runs=3, óf transparant + verdedigbaar
herijkt op de noise-floor (safety-gates onaangeroerd).

---

## Fase 3 — End-to-end functioneren op demo-data verifiëren

> "Werkende bot" ≠ alleen goede eval-scores. De volledige demo-keten moet werken. Dit is grotendeels
> verificatie + kleine fixes, geen botversie. Gebruik de browser-/playwright-skill voor de UI-checks.

- [ ] **Crawl → ingest → kennisbank.** Voor minstens 1 demo-org: draai de crawler-flow (sitemap-ontdekken →
      pagina's kiezen → batch-scrape) en bevestig dat de kennisbank vult. **Open check:** `FIRECRAWL_API_KEY` op
      Vercel prod (een live crawl faalt zonder; zie crawler-status). Lokaal kan met de bestaande demo-content.
- [ ] **Widget-embed-chat.** Test het embeddable widget (`/embed`, `/api/v0/chat`, `/widget.js` — publiek/
      token-gated sinds PR #105): laadt het, antwoordt de bot correct op een demo-vraag, en werkt de eerlijke
      fallback bij een out_of_corpus-vraag? Test op de 4 demo-orgs.
- [ ] **Dashboard.** Verschijnen de gesprekken, bronnen en onbeantwoorde/laag-vertrouwen-vragen in het
      klantendashboard? Klopt de org-resolutie (dashboard leest de `v0_active_org`-cookie, niet `?org=`)?
- [ ] **Cache-discipline:** als een UI-wijziging niet zichtbaar is, clear `.next/` + herstart dev-server vóór
      je een bug jaagt (bekende Turbopack/.next stale-cache-valkuil).
- [ ] Documenteer de end-to-end checklist + eventuele kleine fixes (kleine UI/CSS/crawler-fixes mogen volgens
      staande afspraak direct; datamodel/migratie/security/widget-API blijven eerst-overleggen).

**Exit-criterium Fase 3:** crawl→ingest→widget-chat→dashboard werkt aantoonbaar voor de demo-orgs, met
correcte antwoorden én correcte fallback.

---

## Fase 4 — Definition-of-Done "productiewaardig in V0"

- [ ] Bevestig dat **alle vier** §B-criteria waar zijn: V0 Controlled Engine Gate PASS op runs=3 (safety hard),
      geen regressie, end-to-end demo-flow groen, alles gedocumenteerd.
- [ ] Werk de relevante `cc_milestones` (V0-milestones) bij indien van toepassing.
- [ ] Schrijf een korte `docs/evals/<datum>-V0-DONE.md`: welke botversie is LATEST, welke gates groen op runs=3,
      welke (indien aanwezig) drempels herijkt + onderbouwing, en de end-to-end-checklist.
- [ ] **Eindstatus** = één van: `V0 PRODUCTIEWAARDIG — engine-gate PASS @ runs=3 + e2e groen` ·
      `BIJNA — resterende <X> blockers gedocumenteerd voor volgende iteratie` · `NEED MORE DATA`.
- [ ] Stel vast (niet bouwen): dit is de "V0-done = launch-readiness"-lijn. De volgende stap is een **aparte**
      V1-kickoff (zie `docs/superpowers/specs/2026-05-25-v1-codebase-strategie-design.md`) — buiten dit plan.

---

## PR & afronding (per fase met een botversie of een afgeronde fase)

- [ ] `graphify update .` (output gitignored). Branch bevestigen (`git rev-parse --abbrev-ref HEAD`).
- [ ] `.github/pull_request_template.md` volledig invullen (voor een reviewer die niet in je sessie zat).
- [ ] `git push -u origin feat/seb/v0-naar-productiewaardig`; `gh pr create --fill`. **Nooit direct naar `main`.**
- [ ] Na merge opruimen: `git branch -D`, remote delete, `git worktree remove`, kill orphan dev-server (poort 3000/3001).

---

## Eindoutput die je oplevert

1. `docs/evals/<datum>-v0.9-runs3-herbevestiging.md` — de harde basislijn (Fase 0).
2. Per botversie: append-only config in `bots.ts` + `docs/evals/<datum>-v0.1X-analysis.md`.
3. Fase 2/3-bevindingen (citation-meetfix, latency-beslissing, end-to-end-checklist).
4. `docs/evals/<datum>-V0-DONE.md` met de eindstatus.

**Wees streng:** promoveer alleen op data (V0-gate PASS @ runs=3 + geen promoveer-niet-trigger). Schend geen
hard rule uit §C. Eén botfix per iteratie. Bij twijfel of een stap een hard rule of de scope-grens (V0, fake
data) raakt, of bij een geplande rollback / boven-cap eval: **stop en vraag Sebastiaan.**

---

## Snelle commando-referentie

```bash
# Diagnose ($0 — lezen uit eval_runs, geen LLM-calls):
npm run audit:retrieval   # recall@k / MRR — bevestigt retrieval ≠ bottleneck
npm run audit:labels      # STALE / TE_STRENG / ECHTE_MISS / UNLABELED triage
npm run audit:taxonomy    # failure-taxonomy + hard-fact echo-warn recompute
npm run audit:subtax      # unsupported_claim sub-taxonomy
npm run audit:latency     # per-stage p50/p95 + bottleneck-labels
npm run audit:citations   # citation-binding integriteitscheck

# Invarianten / unit (geen kosten):
node --import tsx scripts/test-bot-defaults.ts   # LATEST_BOT_VERSION-invariant

# Eval (BILLABLE — altijd eerst kostenraming + cap):
npm run eval:seed         # corpus upsert (overslaan als stabiel)
npm run eval:run          # default = 2 nieuwste versies; gebruik --runs=3 / --types=
npm run eval:report       # genereert eval-out/eval-<timestamp>.md + de twee gates
npm run eval:run-all      # seed → run → report (volledige cyclus)

# Demo-data manipuleren:
npm run v0:chat -- --org <slug> --v <versie> --q "<vraag>"
npm run v0:ingest / v0:list / v0:reset / v0:reingest-parents / v0:seed-orgs
```

**Belangrijke runtime-locaties:** `lib/v0/server/bots.ts` (versie-registry, `LATEST_BOT_VERSION`) ·
`lib/v0/server/rag.ts` (regenerate-laag) · `lib/v0/server/hard-facts.ts` (verifier + deterministische refuse) ·
`lib/v0/server/claims.ts` · `scripts/v0-eval-report.ts` (gates + thresholds + echo-warn) ·
`adaptive_decision` zit op `query_log` (migration 0023), NIET op `eval_runs` (relevant voor latency, Fase 2).
