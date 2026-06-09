# Reconciliatie van het "v1-lite engine"-advies tegen de huidige ChatManta-codebase

> **Aan de code-agent die het advies (`CHATMANTA_V1_LITE_ENGINE_ADVIES_VOOR_CODE_AGENT.md`) schreef.**
> Dit is een gegronde tegenlezing van jouw advies tegen de **werkelijke** code op `origin/main`,
> gemaakt via `/intake` (recon + overlap-radar + lens-kritiek, geverifieerd met `git show origin/main:…`).
> Doel: jouw instinct waarderen én je laten werken vanuit de huidige realiteit i.p.v. een ~2 weken oude snapshot.
> Geverifieerd op **2026-06-01** tegen `origin/main` (HEAD `cc92531`).

---

## TL;DR

**Je instinct klopt — maar het is al gebouwd, en drie van je concrete aanbevelingen zijn gevaarlijk of achterhaald.**

- De "v1-lite engine" die je voorstelt (*"v0.4 retrieval-fundament + v0.7 output-discipline + v0.8/v0.9
  deterministische guards + simpele telemetry"*) **ís de huidige append-only keten al**. De productie-`LATEST`
  op `main` is **v0.9.3** en erft precies dat via de `{...vorige}`-spread.
- Je advies is geschreven tegen **v0.1–v0.9.1** en mist **v0.9.2** (decompose-gate — exact jouw §7.7) en
  **v0.9.3** (taal-spiegeling), plus de **gemergede productie-gate eval** (PRs #143/#158/#161/#162/#163) die
  jouw kernvraag — *"welke versie is het meest productiewaardig?"* — al empirisch beantwoordde: **v0.8.1, niet
  de nieuwste** (v0.9/v0.9.1 introduceerden juist safety-regressies).
- **Drie harde punten** (zie §2): de naam "v1" is gereserveerd voor iets anders; "claim-verification uitzetten"
  onthoofdt stil de anti-hallucinatie-guards; "detectInjection is dode code" is feitelijk onjuist.

**Verdict: reconcileren, niet (her)bouwen.** Hooguit één afgebakend, append-only experiment of een
onderhoudbaarheids-opschoning blijft over (§5) — beide laag-rendement.

---

## 1. De huidige staat (geverifieerd) — wat al bestaat

| Jouw "v1-lite" wil… | Realiteit op `origin/main` | Bewijs |
|---|---|---|
| parent-document retrieval (§6.1) | **Al aan**, geërfd sinds v0.4 | `bots.ts` `parentDocumentRetrieval:true` |
| controlled LLM-rerank (§6.2) | **Al aan** | `bots.ts` `rerank:'llm'` |
| output-discipline v0.7.x (§6.4) | **Al aan** (BLUF + anti-preamble + weiger-carve-out) | `V0_7_1/2/3`-blokken in `bots.ts` |
| hard-fact / history / off-domain guards (§6.5–6.7) | **Al aan** (volledige stack) | `hardFactDeterministicRefusal`, `historyEntityVerification`, `offDomainCodeRefusal`, `hardFactRefusalSafetyAware` |
| knowledge-gap logging (§6.8) | **Al aan** | `knowledgeGapLogging:true` (v0.6+) |
| query-decomposition conditioneel (§7.7) | **Al gedaan** — v0.9.2 `decomposeHeuristicGate` skipt ~90% single-hop (−820ms p50 TTFT) | `bots.ts:1155-1159`, PR #159 |
| HyDE niet standaard (§7.6) | **Al selective** (alleen bij zwakke top1) | `selectiveHyDE:true` + trigger |
| adaptief i.p.v. "alles aan" (§7.5) | **Al adaptief** (`adaptiveRag` fast/standard/careful) | `bots.ts` v0.6 |

> **Belangrijkste enkele observatie:** v0.9.2 (de meest recente latency-ingreep) beschrijft zichzelf
> expliciet als *"claim-verify/regenerate/cascade en rerank blijven volledig áán — geen retrieval- of
> anti-hallucinatie-impact"* (`bots.ts:1158`). Het project doet latency-werk **mét de guard-stack aan** — dat
> is precies de discipline die jouw advies elders ondermijnt (§2.2).

De productie-gate eval (`docs/superpowers/specs/2026-05-29-productie-gate-eval-design.md`, Lagen 0–4 gemerged)
is het meetinstrument dat exact jouw §9.5 ("promoveer alleen op must-not / unsupported-hard-fact / pairwise,
niet op ruis") al operationaliseert. En `docs/PLAN_V0_NAAR_PRODUCTIEWAARDIG_HANDOFF.md` is een uitvoerbaar plan
dat "naar productiewaardig in V0" framet als **residu-gaten dichten op dezelfde keten** — niet een engine
herbouwen.

---

## 2. Drie harde punten (VETO / feitelijke correctie)

### 2.1 Terminologie-VETO — "v1" / "v1-lite" mag niet

In dit project betekent **"V1" = Supabase Auth + productie-multi-tenancy** (`organization_members`-check,
SA-1). Dat is **nog niet gestart** en wordt alleen door Sebastiaan getriggerd
(`docs/superpowers/specs/2026-05-25-v1-codebase-strategie-design.md`; `AGENTS.md` V1-scope-regel). Een
`BotConfig` raakt **nul** auth-/tenancy-vlak. Iets "v1-lite" noemen impliceert V1 starten = categoriefout.

→ **Noem het een nieuwe V0 bot-versie** (de eerstvolgende legale naam ná `main` = **v0.9.4**). Niet `v1.0`.

### 2.2 Anti-hallucinatie-VETO — "claim-verification/regenerate uitzetten" onthoofdt de guards

Dit is de belangrijkste vondst. `claimRegenerateEnabled`, `adaptiveHardFactVerification` en `claimVerification`
zijn **geen "dure optionele stappen"** — ze zijn de **execution-gates** van de deterministische weiger-templates:

- `claimVerification` omhult de hele verify-stap die `hardFactSupported` produceert (≈ `rag.ts:2417`).
- `adaptiveHardFactVerification` is de **enige** plek die `hardFactSupported` zet (≈ `rag.ts:2448`) én forceert
  dat verify nooit door het latency-budget wordt overgeslagen (juist op trage queries, waar hallucinatie-risico
  piekt).
- `claimRegenerateEnabled` gate't **beide** weiger-templates: history-entity/anti-adoptie (≈ `rag.ts:2652`) en
  hard-fact (≈ `rag.ts:2702`).

Zet je een hiervan uit, dan **blijft de detectie draaien maar vuurt de weigering nooit** → een verzonnen
prijs/datum/naam streamt alsnog naar de bezoeker. Stil falen. De embedding-kosten hiervan zijn ~$0,0001/vraag;
de safety-winst is onbegrensd.

> **Onafhankelijke bevestiging uit de codebase zelf:** `scripts/test-bot-defaults.ts:167-168` (de append-only
> invariant-test) assert letterlijk `adaptiveHardFactVerification=true` en `claimRegenerateEnabled=true`
> met commentaar *"vereist voor de fix"*. Het project bewaakt deze flags al als lynchpins.

→ **Houd `claimVerification` + `adaptiveHardFactVerification` + `hardFactDeterministicRefusal` +
`claimRegenerateEnabled` aan** op elke productie-kandidaat. Wil je echt iets trimmen voor kosten: dat is de
verkeerde plek (zie §3).

### 2.3 Feitelijke correctie — `detectInjection` is GEEN dode code

Je advies (§3 / §7-impliciet) behandelt injection-detectie als prunebaar. **Onjuist.** Geverifieerd op `main`:

- `app/api/v0/chat/route.ts:267` — `detectInjection(question)` wordt aangeroepen.
- `route.ts:272` — `injectionMode = isCookieAuthed(req) ? getInjectionMode() : 'block'`.
- `route.ts:274` — bij detectie op de **publieke embed-route** (geen demo-cookie) → **hard block**
  (`INJECTION_BLOCKED_MESSAGE`, fail-closed). Alleen de ingelogde admin-testtool is log-only (bewust, om
  patronen te tunen zonder de operator te blokkeren).

Het is gewired in de **chat-route**, niet in `runRagQueryStreaming` — daarom leest een `rag.ts`-only grep het
ten onrechte als "dood." **Niet snoeien.**

---

## 3. Het kosten/latency-argument klopt niet

- **"Minder LLM-calls = goedkoper"** is misgediagnosticeerd: de `gpt-4o-mini` antwoord-call **domineert** kosten
  én latency (p95 generatie ~6.530ms). De optionele stappen zijn al weg-gegated of kosten ~$0.
- **`self-reflect` en `follow-ups` vuren vandaag al niet.** `selfReflect` heeft nul call-sites / geen LLM
  bedraad; `generateFollowUps` levert `shouldGenerateFollowupsInline=false` op elk adaptive-pad. Uitzetten =
  **no-op**, geen meetbare winst.
- **De echte latency-winst is al geboekt** door v0.9.2's decompose-gate (−820ms p50 TTFT) — **mét** de
  guard-stack aan. Dat is het patroon dat werkt.
- De **`≤1500ms first-token`-gate is model-gebonden** en onbereikbaar door stages te snoeien (embedding +
  retrieval + generatie-start blijven over). Latency-herijking staat bewust apart (Fase 2 in het handoff-plan).

→ Koppel het latency-gesprek los van het guard-snoei-gesprek. Verantwoord een lite-config **nooit** op
"minder LLM-calls" zonder eerst de per-stage kosten-/tijd-share te **meten** (kan $0 via
`eval_runs.stage_timings_ms` + `bot_cost_usd`).

---

## 4. Per-aanbeveling: houden / al-gedaan / no-op / gevaarlijk

| Advies | Status op `main` | Actie |
|---|---|---|
| §6.1 parent-retrieval | ✅ al aan | houden |
| §6.2 controlled rerank | ✅ al aan | houden |
| §6.3 trust-boundary history | ✅ al in systemPrompt (v0.5+) | houden |
| §6.4 output clarity | ✅ al aan (v0.7.x) | houden |
| §6.5 hard-fact guards | ✅ al aan | houden — **niet** de afhankelijke flags uitzetten (§2.2) |
| §6.6 safety-aware 112 | ✅ al aan (`hardFactRefusalSafetyAware`, v0.9.1) | houden |
| §6.7 off-domain refusal | ✅ al aan (`offDomainCodeRefusal`) | houden |
| §6.8 knowledge-gap logging | ✅ al aan | houden |
| §7.1 cache uit | conditioneel; ~0% hit **op de eval-corpus** (bewust gevarieerd + cache-uit) | herverifieer op echte `query_log` vóór je iets sloopt; laag-prioriteit |
| §7.2 follow-ups uit | **al uit op runtime** | no-op |
| §7.3 self-reflect uit | **al inert** (dode code) | no-op |
| §7.4 cascade niet-default | al gegated door `cascadeMinTopSim`/retrieval-strength — jouw eigen zorg is al afgedekt | houden zoals het is |
| §7.5 adaptive RAG eruit | ⚠️ **niet doen:** reverteert gekalibreerde drempels 0,50/0,56 → 0,45/0,62 (verschuift de hard-fact-guard firing-window) én herstart alle dure stages elke vraag | houden |
| §7.6 HyDE niet-standaard | **al selective** | komt overeen |
| §7.7 decomposition conditioneel | **al gedaan** (v0.9.2 decompose-gate) | komt overeen |
| §7.8 CoT-tags niet als contract | tags worden al geparsed/gestript, **nooit zichtbaar** voor bezoeker | geen actie |
| §7.9 inline citations niet tonen | ⚠️ de `[1][2]`-markers **overleven** in de answer-tekst | **enige echt-zinnige bezoeker-UX-wijziging** — verifieer eerst of de widget-renderer ze al stript |

---

## 5. Wat er legitiem overblijft (als Sebastiaan iets wil)

Geen "nieuwe engine." Hooguit één van deze, beide laag-risico en eerlijk laag-rendement:

### 5a. Onderhoudbaarheids-opschoning (het beste alternatief)
Je §9.1-doel ("pipeline die je in 10 min uitlegt") wordt het best gediend door **dode code te verwijderen**
(self-reflect-plumbing; beslissen of injection óók in `runRagQueryStreaming` moet) + de echte pipeline
documenteren. **Geen nieuwe bot-versie.** Let op: append-only verbiedt het muteren van erfvelden, dus "lite"
als nieuwe versie voegt juist **meer** flags toe (leest niet simpeler).

### 5b. Eén afgebakend, append-only experiment
Een nieuwe versie (`v0.9.4`) die **alléén de écht-dode stages** uitzet via **nieuwe** gating-flags
(default-uit op alle voorgangers, geërfd vanaf de huidige LATEST v0.9.3), pairwise gemeten vóór promotie.
Maar: die stages kosten al ~$0 → de meetbare winst is ≈ nul.

**De append-only "hoe" (niet onderhandelbaar als je tóch bouwt):**
1. **Niet** een erfveld op een oudere versie verlagen (muteert een bevroren snapshot → `test-bot-defaults.ts`
   faalt). De enige legale prune = een **nieuwe boolean gating-flag** (default-uit op priors) + een downstream
   branch in `rag.ts`.
2. Erf van **v0.9.3** (huidige LATEST), niet van een oudere versie — anders verlies je stil
   `hardFactRefusalSafetyAware` (112-uitzondering), `offDomainCodeRefusal` en de bron-link-sanitizer.
3. Raak 5 plekken: declareer const → `BOTS` → `BOT_VERSIONS_ORDERED` → (optioneel) `LATEST_BOT_VERSION` →
   assert-blok in `test-bot-defaults.ts`. `EVAL_DEFAULT_VERSIONS = slice(-2)` → registreer als enige tail zodat
   de default pairwise = {v0.9.3, nieuw}.
4. **Bump `LATEST_BOT_VERSION` pas ná** een pairwise eval die bewijst dat de prune niet-regressief is op
   safety (must-not + unsupported-hard-fact). Tot dan blijft productie-default v0.9.3 (mét guards).
5. Meet $0/goedkoop: `eval:run` op {v0.9.3, nieuw} → diff `stage_timings_ms` + `bot_cost_usd`. **Geen** promotie
   op een geprojecteerde delta.

---

## 6. Vragen die eerst beantwoord moeten (door Sebastiaan)

1. **Wat is het echte doel?** Kosten en latency zijn hierboven misgediagnosticeerd, en "welke versie is
   productiewaardig" is al beantwoord (v0.8.1, via de prod-gate eval). Als het doel "uitlegbaarder/
   onderhoudbaarder" is → dat is de opschoon-route (§5a), geen lite-versie.
2. **Is er een concreet bezoeker-probleem** (bv. de inline `[1][2]`-markers, §7.9) dat een echte UX-fix
   rechtvaardigt? Dat is het enige punt uit je lijst dat klant-zichtbaar effect heeft.
3. **Rebase eerst.** Elk nieuw-versie-werk moet op `origin/main` (v0.9.3) starten, anders botst een nieuwe
   "v0.9.x" met de al-gemergede v0.9.2/v0.9.3.

---

## Bronnen (geverifieerd `origin/main`, HEAD `cc92531`, 2026-06-01)

- `lib/v0/server/bots.ts` — `LATEST_BOT_VERSION = v0.9.3` (regel 1257); `decomposeHeuristicGate` (210, v0.9.2 @ 1155-1159); v0.9.2-beschrijving "guards blijven áán" (1158).
- `app/api/v0/chat/route.ts:267/272/274` — injection gewired + fail-closed op publieke route.
- `scripts/test-bot-defaults.ts:157` (`v0.9.3`), `:167-168` (guard-flags "vereist voor de fix").
- `rag.ts` ≈ 2417 / 2448 / 2652 / 2702 — guard execution-gates (controleer regelnummers in jouw checkout).
- Productie-gate eval: PRs #143/#158/#161/#162/#163; `docs/superpowers/specs/2026-05-29-productie-gate-eval-design.md`.
- Handoff-plan: `docs/PLAN_V0_NAAR_PRODUCTIEWAARDIG_HANDOFF.md`.
- V1-strategie (gereserveerde betekenis van "V1"): `docs/superpowers/specs/2026-05-25-v1-codebase-strategie-design.md`.
