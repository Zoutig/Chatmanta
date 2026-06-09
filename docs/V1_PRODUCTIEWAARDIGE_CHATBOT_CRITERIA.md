# Productiewaardige V1-chatbot — Criteria (ChatManta)

> Status: brainstorm-synthese, 2026-06-02. Samengesteld via een 13-agent workflow (12 productie-dimensies + 1 kritiek op de externe inspiratie-doc), daarna door mij geconsolideerd, ontdubbeld en geherprioriteerd met eigen oordeel.
>
> Dit document is géén kookboek en géén launch-checklist-met-vinkjes. Het is een *kader* dat zegt: waaraan moet de chatbot écht voldoen vóór er échte klantdata in mag, en welke daarvan blokkeren de launch versus welke mogen handmatig/later. Verifieer elke "have/partial/missing"-claim vóór je erop bouwt — ze zijn gegrond in de codebase zoals die op 2026-06-02 was, maar de codebase beweegt.

---

## 0. Kernoordeel over de inspiratie-doc (`chatmanta_rag_criteria.md`)

De doc is een **degelijke RAG-antwoordkwaliteits-checklist** en een **onbruikbare productiewaardigheidsdefinitie**. Ze dekt ~30% van wat een V1-launch met echte klanten nodig heeft. De andere ~70% — multi-tenancy/auth, AVG/DPA, kostenbeheersing, observability/alerting, provider-fallback, onboarding, incident-response, widget-beveiliging — ontbreekt vólledig.

Het gevaar zit niet in wat de doc zegt, maar in waar ze je geruststelt. Alle 20 punten gaan over de antwoord-laag — precies de laag die ChatManta **al grotendeels heeft opgelost** (de productie-gate eval vond v0.8.1 al "productiewaardig"). Als je deze doc als je definition-of-done neemt, poets je de laag die al glanst en ship je een juridische/security/kosten-tijdbom.

Twee claims uit de doc zijn voor ChatManta aantoonbaar **onjuist**:

1. *"Kwaliteit komt NIET primair uit de prompt maar uit retrieval/chunking/filtering."* — Halve waarheid, hier gevaarlijk. ChatManta's drie zwaarste recente regressies (v0.9 nukte het "bel 112"-advies, v0.9.1 fabriceerde €295, v0.9.2 antwoordde NL op een EN-vraag) waren allemaal **prompt- en gate-logica-gedreven, niet retrieval-gedreven**. De les is niet "negeer de prompt" — het is dat prompt + gate-logica een gekoppeld systeem zijn dat regressie-gating nodig heeft. Daarom was de *eval-infra* (niet de bot) het echte v0.8-bottleneck.
2. *"Hallucinaties <5% / retrieval accuracy >90%"* als losse meetbare drempels — zonder definitie, meetmethode of labelprotocol. ChatManta's eigen eval liet zien dat `recall@k` onbetrouwbaar is als signaal (stale dev-org labels) en dat judge-noise ±0.3 punt is. Een rond getal zonder operationalisatie is een marketingclaim, geen gate.

En wat de doc structureel mist: **over-refusal is even schadelijk als hallucinatie.** Een geweigerd correct antwoord ("bel 112" werd ge-nukt) kost net zo goed klantvertrouwen. ChatManta's asymmetrische veto (veiligheid = hard veto, answer-quality = drempel ~90%) erkent die spanning; de doc kent maar één kant van het spectrum.

**Verdict:** nuttig om de RAG-pijplijn scherp te houden, onbruikbaar als V1-kader. Niet overnemen.

---

## 1. Herkadering — wat "productiewaardig V1" écht betekent voor ChatManta

Productiewaardig = het moment waarop er **echte klantdata + echte eindgebruikers** in mogen. Dat verschuift het zwaartepunt weg van "geeft de bot goede antwoorden?" (grotendeels opgelost) naar zeven harde lagen:

| Laag | Kernvraag | Doc dekt dit? |
|---|---|---|
| **A. Multi-tenancy & auth** | Kan klant A nooit data van klant B zien? | ❌ niet genoemd |
| **B. Kosten & misbruik** | Kan één aanvaller/virale dag de rekening opblazen? | ❌ niet genoemd |
| **C. Privacy / AVG** | Mogen we deze data juridisch verwerken? | ❌ niet genoemd |
| **D. Antwoord-veiligheid** | Verzint of weigert de bot onterecht? | ✅ kern van de doc |
| **E. Betrouwbaarheid** | Werkt het ook als OpenAI/DB hapert? | ⚠️ alleen "snelheid" |
| **F. Ops & onboarding** | Kan Niels een klant live zetten; kan ik terugrollen? | ❌ niet genoemd |
| **G. UX-must-haves** | Voelt de widget af voor een bezoeker? | ⚠️ deels |

Lagen A/B/C/F zijn waar de echte V1-arbeid zit. Laag D is grotendeels klaar en moet vooral *bewezen* worden op de juiste versie.

---

## 2. De v1-blocker-kern (geconsolideerd) — de harde launch-gate

De 12 dimensie-agents flagden samen ~50 "v1-blockers". Dat is geen launch-plan, dat is verlamming. Hieronder de **ontdubbelde** kern. Let op de cross-cutting blockers die in 4-6 dimensies tegelijk opdoken (Upstash, per-org budget, Supabase Auth, AVG) — díe zijn het kritieke pad.

### A. Multi-tenancy & auth-fundament *(de bestaansreden van V1)*
- **A1. Supabase Auth end-to-end bewezen.** `lib/auth.ts` (`requireAuth`/`requireOrgMember`) + `0001_core_tenancy.sql` zijn compleet maar **nooit met een echte sessie gedraaid** ("dormant = ongetoetst"). — *missing*
- **A2. Twee fysiek gescheiden Supabase-projecten** (V0-sandbox vs V1-productie). Zolang ze één DB delen kan een V0-gebruiker via service-role-wrappers naar échte klantdata switchen. — *missing*
- **A3. Geen org-resolutie via cookie/query-param in V1-paden.** `v0_active_org` en `?org=` worden in V0 bewust zónder autorisatie geaccepteerd; één import daarvan in een V1-route = de sandbox-kwetsbaarheid in productie. Grep/CI-gate vereist. — *missing*
- **A4. Vector-search org-isolatie hard.** ⚠️ **Concreetste lek:** `runRagQuery` (eval-pad) laat `orgId` weg en defaultt stil naar `DEV_ORG_ID` (rag.ts ~1178). Veilig in V0, fataal zodra dat pad een V1-productieflow raakt. — *partial → fix vereist*
- **A5. Service-role discipline + SA-1.** `_serviceRoleClient()` alleen via `lib/supabase/admin.ts`-wrappers; elke V1-action met client-ID roept `requireOrgMember()` aan vóór de service-role-call. Grep-gate. — *partial*
- **A6. Supabase Pro + PITR + geen auto-pause** voor het V1-project. Gratis plan pauzeert na 7 dagen inactiviteit en heeft geen backups → onacceptabel met echte data. — *missing*

### B. Kosten- & misbruik-containment *(denial-of-wallet)*
- **B1. Per-org EUR dag-budget als harde runtime-cap.** Bij overschrijding weigert de chat-route de LLM-call (HTTP 402/429 + nette degradatie), niet alleen telemetrie. AGENTS.md noemt dit "non-negotiable". Bestaat nog niet — alleen `query_log.cost_usd` logging. — *missing*
- **B2. Upstash rate-limit live op prod** (`USE_UPSTASH=true` + Redis-vars). In-memory tellers tellen per serverless-instance → effectieve limiet = N× ingesteld. Code is klaar; flag staat op prod nog niet aan. — *missing/partial*
- **B3. Graceful degradatie bij budget-/limiet-uitputting** op álle surfaces (widget-iframe, testtool, API). — *missing*
- **B4. Injection-detectie in `block`-mode op het publieke embed-pad** (`INJECTION_MODE=block`), met op echte data getunede patronen. Nu default `log-only`. — *partial*
- **B5. System-prompt-leakage geblokkeerd** (reveal-prompt-patronen actief in block-mode; named eval-fixtures). — *partial*

### C. Privacy / AVG-basislijn *(juridische go/no-go)*
- **C1. Verwerkersovereenkomst (DPA) per klant**, ondertekend vóór live. `processor_agreement_signed`-flag bestaat (migr 0038) maar er is geen document/template. — *partial*
- **C2. Sub-processor-lijst gedeeld** (OpenAI/Anthropic/Supabase/Vercel/Firecrawl/Resend, met doel + regio + VS-transfer-grondslag/SCCs). — *partial*
- **C3. PII-redactie écht bedraad in het log-pad.** `redactPii()` dekt e-mail/IBAN/telefoon/BSN maar wordt **niet** aangeroepen op `query_log.question` in `logQuery()` — de `piiRedactionEnabled`-flag stuurt het chat-logpad niet aan. Grootste technische privacy-schuld. — *partial*
- **C4. Geautomatiseerde retentie-cleanup via Vercel Cron.** `lib/controlroom/server/retention.ts` is compleet maar bewust niet aan een cron gekoppeld; `vercel.json` is leeg. Retentiebeleid dat niet draait ís geen beleid. — *partial*
- **C5. Widget-bezoeker disclosure + verwijderpad.** `visitor_id` + transcript = pseudonieme PII; geen disclosure, geen delete-endpoint, geen opt-out. — *missing*

### D. Antwoord-veiligheid *(de gate — grotendeels klaar, moet bewezen)*
- **D1. Hard-fact-gate stabiel op de geshipte versie** — 0 over-refusals op correct-beantwoordbare vragen én 0 doorgelaten verzonnen getallen/prijzen/datums. De named regressie-cases (112-handoff, €295-fabricatie) staan als fixtures en zijn groen. — *partial*
- **D2. Source-link sanitizer op álle paden** incl. cache (PR #149). — *have* ✅
- **D3. No-LLM fallback-pad bij nul relevante chunks** (threshold ≈0.4). — *have* ✅
- **D4. Productie-gate eval PASS op `runs=3`** (niet n=1) op de versie die daadwerkelijk live draait (`LATEST_BOT_VERSION`), met groene regressie-diff-baseline. — *partial*
- **D5. Per-klant corpus-kwaliteitscheck bij onboarding** (lite: ≥5 in-corpus + 3 out-of-corpus per nieuwe org). De offline gate draait op fake demo-data; een echte klant heeft een ander corpus. Bestaat nog niet. — *missing*

### E. Betrouwbaarheid
- **E1. `callLLM()` provider-fallback geïmplementeerd.** `lib/ai/llm.ts` gooit nu letterlijk `'not implemented yet — Fase 4'`. V1 migreert naar Claude Haiku 4.5 primair + OpenAI fallback; zonder deze laag is er geen provider-switch én geen resilience. — *missing*
- **E2. TTFT-baseline gemeten + realistische SLO.** `query_log.first_token_ms` is live (migr 0041), maar p95 was ~7,8s bij n=1 — de doc-grens "<2s" is zonder architectuurwijziging niet haalbaar. Herijk de drempel (bv. p95 ≤5s) en onderbouw. — *partial*
- **E3. Uptime-monitoring + server-side error-alerting.** UptimeRobot op `/api/v0/widget/ping` + zicht op server-side crashes (nu blind; alleen client-errors gaan naar `admin_error_groups`). — *missing*

### F. Ops, deploy & onboarding
- **F1. Geautomatiseerde verificatie-build** (CI: `next build` op schone `.next/`). Geen `.github/workflows/` aanwezig; nu puur handmatige discipline → faalt onder tijdsdruk. — *partial*
- **F2. Migratie-discipline schoon** op het prod-project (`migrate:status` = 0 gaps/dubbelingen). Repo heeft al dubbele `0039_*`/`0040_*`. — *partial*
- **F3. Klant-provisioning-flow voor Niels** (niet-technisch): org aanmaken → crawl/upload → embed-snippet met key + origin-allowlist → live testen, zónder dat Sebastiaan in de DB hoeft. Huidige onboarding werkt alleen op V0-demo-orgs. — *partial*
- **F4. Bot-versie rollback zonder code-push** (`LATEST_BOT_VERSION` via Vercel env-var i.p.v. hard-coded export). Gezien 3 regressies in de v0.9-cyclus is dit reëel. — *missing* (v1-target, zie §4)

### G. UX-must-haves voor de widget
- **G1. Directe antwoorden zonder AI-opvultekst** (BLUF, geen "Bedankt voor je vraag"). Prompt-afgedwongen (v0.7.3 OUTPUT-DISCIPLINE) maar labiel — geldt niet op smalltalk/general-knowledge-paden. — *partial*
- **G2. Streaming zichtbaar** (eerste tokens direct, geen `<thinking>`-lekken). — *partial*
- **G3. Foutmeldingen + lege-state in de widget** (retry-knop, token-refresh, welkomst + startvragen). — *have* ✅
- **G4. Mobiel/iframe correct** (matchMedia via postMessage, niet via iframe-viewport). — *have* ✅
- **G5. Feedback-knop per antwoord** (duim ↑/↓ → operator-inbox). — *have* ✅

---

## 3. Volledige criterialijst per dimensie *(de uitgebreide lijst)*

Notatie: **status** = `have` ✅ / `partial` ◐ / `missing` ✗ ; **prio** = `BLOCKER` / `target` (voor launch, maar niet de harde technische go/no-go) / `post-v1`.

### 3.1 Anti-hallucinatie & antwoord-grounding
1. ◐ BLOCKER — Hard-fact-gate kalibratie: 0 false-positieve weigeringen op correct-beantwoordbare vragen (de "112"-klasse).
2. ◐ BLOCKER — Hard-fact-gate dekking: geen verzonnen geld/percentage/datum/telefoon/e-mail/URL (de €295-klasse).
3. ✅ BLOCKER — Source-link sanitizer actief op streaming + cache + eval-pad (PR #149).
4. ✅ BLOCKER — Fallback-pad zónder LLM-call bij nul chunks boven threshold.
5. ◐ target — History-entity-adoptie geblokkeerd (planted-fact via multi-turn); breid uit naar ≥3 multi-turn cases.
6. ◐ target — Overconfidence vermeden: verplichte hedging bij weak/medium retrieval (nu prompt-only, geen mechanische garantie).
7. ✗ post-v1 — Conflicterende bronnen: recency-/conflict-detectie (vereist metadata-infra, buiten Minimal Build Scope).
8. ◐ target — Citatie-getrouwheid: elk inline `[N]` mapt op een echte source-index.
9. ✗ target — `hardFactSupport` naar `eval_runs` schrijven zodat de gate het binair kan gebruiken (gap V0_8 §3.2).

### 3.2 Retrieval-kwaliteit & context-engineering
1. ◐ BLOCKER — Org-isolatie hard in álle retrieval-RPCs (fix `runRagQuery` `DEV_ORG_ID`-default).
2. ✅ BLOCKER — Similarity-threshold ≈0.4 (niet 0.7) — empirisch voor `text-embedding-3-small` + NL.
3. ✅ BLOCKER — Hybrid search (RRF, Dutch FTS) actief voor de productieversie.
4. ◐ BLOCKER — Hard-fact-gate robuust (safetyAware + numericFallback=false), zie 3.1.
5. ✅ BLOCKER — Soft-delete/`included`-filter in RPCs dekt documenten én website-pagina's.
6. ◐ target — Char-based chunker → token-based (tiktoken) voor V1 (P95 tokens/chunk ≤400).
7. ✅ target — Parent-document-retrieval correct gehydrateerd; UI-badge bij niet-geoptimaliseerde chunks.
8. ◐ target — `recall@k` ≥0.70 / MRR ≥0.75 op label-gecorrigeerde set (alleen na label-cleanup betrouwbaar).
9. ✅ target — Context-compressie: `MAX_CONTEXT_CHARS`-cap correct ná reranking.
10. ◐ target — Answer-cache-correctheid: geen stale hits na in-place fix (cache-knop of versie-bump-invalidatie).
11. ✗ target — `chatbot_id`-isolatie in RPCs (BLOCKER zodra een klant een 2e chatbot krijgt; voor 3 testklanten met 1 chatbot elk → target).
12. ✅ post-v1 — Selective HyDE als productie-default.

### 3.3 Ingestie, crawler, document-parsing & KB-levenscyclus
1. ◐ BLOCKER — Gescande-PDF-detectie met begrijpelijke foutmelding (geen stille lege KB-entry).
2. ✅ BLOCKER — Idempotente ingest (geen dubbele chunks bij her-crawl/her-upload).
3. ✅ BLOCKER — Verwijderde/uitgesloten content valt direct uit retrieval.
4. ✅ BLOCKER — SSRF-guard op crawl-URL (localhost/private/metadata + DNS-resolutie).
5. ◐ target — Lege/noise-pagina's niet geïngest (Firecrawl `onlyMainContent` expliciet checken).
6. ✅ target — URL-deduplicatie (map + sitemap) bij discovery.
7. ◐ target — Documentformaten met duidelijke grenzen; geen stille truncatie; magic-byte-validatie (post-v1).
8. ◐ target — Handmatige her-crawl + zichtbare `last_crawled_at` (geen auto-freshness in V1).
9. ✅ target — KB-gap-detectie (zero-hit-tab + `/intake`-quiz, PR #156).
10. ◐ target — Firecrawl = single-point-of-failure: niet stil falen, operator ziet de oorzaak.
11. ◐ target — Kwaadaardige-upload-basis (extensie-whitelist + grootte server-side afgedwongen).

### 3.4 Conversatie- & UX-kwaliteit
1. ◐ BLOCKER — Directe antwoorden (BLUF), ook op smalltalk-/general-knowledge-paden.
2. ◐ BLOCKER — Streaming zichtbaar, TTFT-perceptie, geen tag-lekken.
3. ✅ BLOCKER — Fout-/lege-state + retry + token-refresh in de widget.
4. ✅ BLOCKER — Mobiel/iframe-gedrag (postMessage-detectie).
5. ✅ BLOCKER — Feedback-knop per antwoord → operator-inbox.
6. ◐ target — Multi-turn referentie-resolutie + trust-boundary (geen user-asserted feiten adopteren).
7. ✅ target — Taal-spiegeling (EN↔NL) als klant-instelling (v0.9.3 fix).
8. ◐ target — Tone-of-voice per merk (let op DB-backed override-gotcha bij onboarding).
9. ✅ target — Klikbare, gesaniteerde bron-links.
10. ✗ target — Suggested follow-ups in de **embed-widget** (server-side bestaat; widget rendert ze niet).
11. ◐ target — Geen meta-talk over interne bronnen / geen repetitie.

### 3.5 Security, multi-tenancy & toegangscontrole
1. ✗ BLOCKER — Supabase Auth e2e bewezen.
2. ✗ BLOCKER — Twee Supabase-projecten (fysieke V0/V1-DB-scheiding) + cross-import-gate.
3. ◐ BLOCKER — SA-1 object-level access op alle V1-actions.
4. ◐ BLOCKER — Service-role discipline (geen directe `SERVICE_ROLE_KEY` buiten `admin.ts` in de V1-laag).
5. ✗ BLOCKER — Geen V1-org-resolutie via cookie/query-param.
6. ✅ BLOCKER — Geen echte secrets in `NEXT_PUBLIC_*`.
7. ◐ target — Vector-search `chatbotId`-isolatie voorbereid.
8. ◐ target — Embed-token (HMAC, fail-closed) + origin-lock + rate-limit; `EMBED_TOKEN_SECRET` op prod.
9. ◐ target — Injection van log-only → block-mode (zie B4).
10. ✅ target — `is_jorion_admin` niet via UI instelbaar.
11. ◐ target — Rate-limit globaal (Upstash) — zie B2.

### 3.6 Privacy, AVG/GDPR & dataretentie
1. ◐ BLOCKER — DPA per klant (document, niet alleen flag).
2. ◐ BLOCKER — Sub-processor-transparantie.
3. ◐ BLOCKER — PII-redactie écht actief in `logQuery()`.
4. ◐ BLOCKER — Geautomatiseerde retentie-cron.
5. ✗ BLOCKER — Widget-bezoeker disclosure + verwijderpad.
6. ◐ target — EU-dataresidentie aantoonbaar (Supabase EU + PITR; VS-subprocessors via SCCs).
7. ◐ target — Recht op inzage/verwijdering (handmatig via admin volstaat voor 3 klanten).
8. ◐ target — Privacy-disclosure-link in widget (per-org configureerbaar).
9. ◐ target — Dataminimalisatie-default (`full_conversation_logging=false` voor echte klanten).
10. ✗ target — `chatmanta.com/privacy` (of `.nl/privacy`) live met verplichte elementen.

### 3.7 Adversariële robuustheid, misbruik & content-safety
1. ◐ BLOCKER — Directe prompt-injection geblokkeerd op embed-pad (block-mode).
2. ◐ BLOCKER — System-prompt-leakage geblokkeerd.
3. ◐ BLOCKER — Rate-limiting effectief op alle instances (Upstash).
4. ✗ BLOCKER — Cost-abuse begrensd via per-org EUR dag-budget.
5. ◐ BLOCKER — PII niet in plano in `query_log` (redactie + retentie-cron).
6. ◐ BLOCKER — Hard-fact-gate stabiel zonder regressies op de productieversie.
7. ◐ target — Indirecte corpus-injection (kwaadaardig document) gemitigeerd — **de gevaarlijkste, minst-gedekte vector** (detector draait nu alleen op user-input, niet op chunks). Bewust DEFERRED in de eval-spec.
8. ◐ target — Gevoelige topics (medisch/juridisch/financieel) → escalatie i.p.v. inhoudelijk advies.
9. ✅ target — Off-domein code-output deterministisch gestopt.
10. ◐ target — Origin-allowlist fail-closed (nu fail-open bij lege lijst/ontbrekende Referer).

### 3.8 Betrouwbaarheid, performance/latency & resilience
1. ✅ BLOCKER — No-LLM fallback ook bij OpenAI-uitval.
2. ◐ BLOCKER — TTFT-baseline + herijkte realistische drempel.
3. ✗ BLOCKER — Upstash globaal live.
4. ✗ BLOCKER — Per-org EUR dag-budget harde cap.
5. ✗ BLOCKER — `callLLM()` provider-fallback geïmplementeerd.
6. ✅ target — Embedding-timeout + retry (4s, max 1 retry).
7. ✅ target — Streaming-robuustheid: fout mid-stream → client-foutcode.
8. ◐ target — Cache-invalidatie-protocol bij versie-wissel.
9. ◐ target — Ingest-backpressure (50-pagina-crawl raakt geen 60s-timeout).
10. ✅ target — Fout-observability: `admin_error_groups` gevuld, geen stille 500s.

### 3.9 Kostenbeheersing & budget-governance
1. ✗ BLOCKER — Per-org EUR dag-budget als harde runtime-cap.
2. ◐ BLOCKER — Upstash live (globale teller).
3. ✗ BLOCKER — Graceful degradatie bij budget-uitputting.
4. ✗ BLOCKER — Deploy-checklist dwingt `USE_UPSTASH=true` + vars af (niet stille fallback).
5. ◐ target — Cost-attributie per org in EUR (na `callLLM()`).
6. ◐ target — Eval-kosten-discipline ($0-judge primair, harde cap op betaalde runs).
7. ◐ target — Transparante verbruiks-status in het klant-dashboard.
8. ◐ target — OpenAI Admin Key voor account-brede kostenreconciliatie.
9. ◐ post-v1 — Firecrawl-credit-cap + alerting.
10. ◐ post-v1 — Cache-hit-rate als kostenmonitoring.

### 3.10 Observability, monitoring & alerting
1. ✅ BLOCKER — Gestructureerde `query_log` volledig + never-throw.
2. ✅ BLOCKER — Fout-fingerprint-store (`admin_error_groups`, PR #139) + operator-toegang.
3. ◐ BLOCKER — Per-org EUR dag-budget afgedwongen + zichtbaar.
4. ✗ BLOCKER — Externe uptime-monitoring op `/api/v0/widget/ping`.
5. ◐ BLOCKER — Productie-gate gedraaid op de V1-kandidaat (incl. LLM-swap).
6. ✅ target — Per-org fallback-% zichtbaar + drempel-waarschuwing (≥10%).
7. ◐ target — TTFT/per-fase-latency in prod-log + SLO-definitie.
8. ✅ target — Request-ID traceerbaar widget → `query_log` → error-group.
9. ✅ target — Crawl-health-dashboard met faalredenen per klant.
10. ✅ target — Operator-inbox voor klantfeedback (Resend, PR #151).

### 3.11 Evaluatie, kwaliteitsgates & continue meting
1. ◐ BLOCKER — Productie-gate PASS op `runs=3` (niet n=1) met onverlaagde safety-drempels.
2. ◐ BLOCKER — Regressie-diff tegen opgeslagen groene baseline.
3. ◐ BLOCKER — Over-refusal én under-refusal beide meetbaar + binnen drempel.
4. ◐ BLOCKER — Gate-bewijs op de júiste versie (geen stale `LATEST`).
5. ✗ BLOCKER — Per-klant corpus-kwaliteitscheck bij onboarding (lite).
6. ✅ target — Online fallback-% + thumbs-down per klant-org.
7. ◐ target — Safety-dimensies volledig deterministisch (geen handmatige judge-stap).
8. ◐ target — Judge-methodologie reproduceerbaar (rubric-anchors actief).
9. ◐ target — Eval-kosten bewust begrensd + transparant.

### 3.12 Operatie, deployment, onboarding & go-live
1. ◐ BLOCKER — Geautomatiseerde verificatie-build (CI, schone `.next/`).
2. ◐ BLOCKER — Migratie-discipline schoon op prod.
3. ✗ BLOCKER — Supabase Auth + twee gescheiden DB's.
4. ◐ BLOCKER — Klant-provisioning-flow (Niels, niet-technisch).
5. ◐ BLOCKER — Upstash globaal actief + `EMBED_TOKEN_SECRET` op prod.
6. ✗ BLOCKER — AVG-basis (DPA + bezoeker-disclosure) vóór eerste klant.
7. ✗ BLOCKER — Supabase Pro (geen auto-pause + PITR).
8. ✗ target — Bot-versie rollback via env-var (geen code-push).
9. ✗ target — `widget.js` cache-busting (`Cache-Control: max-age ≤300`).
10. ◐ target — Graceful degradatie in de widget bij alle `AppError`-codes.
11. ✗ target — Monitoring/Sentry op publieke endpoints.
12. ✗ target — Runbook voor Niels (klacht/storing afhandelen zonder SQL/terminal).

---

## 4. Mijn eigen inzichten *(cross-cutting, bovenop de agent-synthese)*

1. **De inspiratie-doc meet de verkeerde 30%.** De antwoord-laag is al goed (v0.8.1 = productiewaardig per eval). De v1-arbeid zit in auth/AVG/kosten/ops — exact wat de doc niet noemt. Gebruik 'm als RAG-hygiëne-check, nooit als definition-of-done.

2. **Het concreetste, gevaarlijkste detail in de hele analyse:** `runRagQuery` defaultt `orgId` naar `DEV_ORG_ID`. Een sandbox-gemak dat een cross-tenant datalek wordt zodra het een V1-pad raakt. Dit is precies het soort bug dat een RAG-checklist nooit vangt omdat die niet in multi-tenancy denkt. Fix + grep-gate hoog op de lijst.

3. **De V1-LLM-swap maakt het bestaande gate-bewijs stale.** "v0.8.1 is productiewaardig" geldt op OpenAI `gpt-4o-mini`. V1 plant Claude Haiku 4.5 primair via `callLLM()`. Het moment dat je het model wisselt, is élk eval-verdict verouderd. Volgorde-val: bouw `callLLM()` → her-evalueer de kandidaat-versie → pas dán "productiewaardig" claimen. Niet andersom.

4. **Blocker-inflatie is zelf een risico.** ~50 blockers = verlamming. De échte harde gate is kleiner omdat de context het toelaat: 3 testklanten met 1 chatbot elk (→ `chatbot_id`-isolatie mag wachten), handmatig werkbaar bij die schaal (retentie-uitvoering, individuele verwijdering, onboarding-eval mogen lite/manueel). Scheid "kan niet zonder" van "moet vóór launch maar handmatig mag".

5. **Over-refusal hoort als first-class failure naast hallucinatie.** De doc kent één kant. ChatManta's hele v0.9-saga was een slingerbeweging tussen te veel weigeren (112-nuke, EN→NL) en te veel verzinnen (€295, planted-fact). De asymmetrische veto + expliciete refusal-calibratie is de juiste framing — houd beide kanten in dezelfde gate.

6. **Offline gate ≠ launch-readiness voor een specifieke klant.** De gate draait op fake demo-data; elke echte klant heeft een ander corpus, andere terminologie, mogelijk dunne RAG-dekking. De per-klant onboarding-corpuscheck (D5) is de brug — en die bestaat nog niet. Onderschatte blocker.

7. **De grootste structurele les van V0 staat in geen enkele checklist:** *de eval-infra was het bottleneck, niet de bot.* v0.8 was een "meet-release" — geen botverbetering maar een meetbaarheids-reparatie. Voor V1 betekent dat: investeer in de gate vóór je in de bot investeert, want zonder betrouwbare meting weet je niet of een "verbetering" een regressie is.

---

## 5. Wat de inspiratie-doc goed/fout had — beknopt

**Terecht (behouden):** RAG-antwoordkwaliteit volledig gedekt; retrieval/chunking/filtering boven prompt-engineering als algemene vuistregel; nadruk op een meetbaar eval-systeem; document-parsing apart benoemd; human-handoff als concept.

**Fout/overdreven:** "kwaliteit niet uit de prompt" als wet (zie inzicht 1+5); `<5%`/`>90%` zonder definitie of meetmethode; overconfidence/ontbrekende-data als losse aspecten zonder de over-refusal-tegenhanger; human-handoff (live-chat-routing) als V1-must-have = over-engineering voor 3 klanten; tone-of-voice als "architectuuraandachtspunt" terwijl het al DB-backed bestaat.

**Mist volledig:** multi-tenancy/auth/RLS · AVG/DPA/consent · kostenbeheersing/per-org budget · observability/alerting/uptime · provider-fallback · onboarding/provisioning · incident-response/rollback/backup · rate-limiting/denial-of-wallet · widget-/iframe-beveiliging · billing/verbruikstransparantie.

---

## 6. Aanbevolen volgorde *(sequencing, niet in scope-uitvoering)*

1. **Fundament eerst (A + F3/F2/F7):** twee Supabase-projecten + Auth e2e + Pro/PITR + provisioning. Zonder dit mag er geen echte data in — alles erna bouwt hierop.
2. **Geld-kraan dicht (B + E5):** `callLLM()` + per-org budget-cap + Upstash live + injection block-mode. Beschermt tegen denial-of-wallet zodra de widget publiek is.
3. **Juridisch groen (C):** DPA + sub-processors + PII-redactie bedraad + retentie-cron + bezoeker-disclosure.
4. **Bewijs op de juiste versie (D4/D5 + E1-keten):** her-evalueer de V1-kandidaat ná de LLM-swap; bouw de per-klant onboarding-check.
5. **Ops-net (E3 + F1 + F8 + observability-blockers):** CI-build, uptime-monitoring, rollback-via-env, Niels-runbook.

UX-must-haves (G) lopen parallel — de meeste zijn al `have`; G1/G2 vragen alleen verificatie op de uiteindelijke versie.
