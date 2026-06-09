# v0.10 — "V1-Ready" criteria (alles wat al in de V0-omgeving kan)

> Status: brainstorm-synthese, 2026-06-02. Afgeleid uit `docs/V1_PRODUCTIEWAARDIGE_CHATBOT_CRITERIA.md` (de volledige 12-dimensie-analyse). Lees dat document voor de volledige onderbouwing per criterium; dit document is de **uitsnede** ervan: wat kunnen we nú al bouwen/bewijzen in de bestaande V0-codebase, zodat er een **v0.10** ontstaat die volledig klaarstaat voor het moment dat de V1-omgeving (Supabase Auth + 2 gescheiden DB's + echte multi-tenancy) er is.
>
> **Doel van v0.10:** doe alles wat niét op auth/multi-tenancy wacht. Dan is de enige resterende V1-arbeid straks het *inpluggen* van auth + DB-scheiding — niet het opnieuw hardenen van de bot, de widget, de privacy-laag, de kosten-caps of de eval-gate.

---

## ⚠️ ZELFKRITIEK & HERZIENE KERN (2026-06-02 — lees dit eerst)

Een adversariële 5-lenzen self-critique (gegrond in de codebase) + git-verificatie legde drie concrete fouten en één scope-probleem in de lijst hieronder bloot. Dit blok corrigeert ze en is leidend; §3–§5 blijven als volledige (ongetrimde) inventaris staan.

### A. De lijst is ~3–4× te groot — de echte kern is ~10 items
~20 MUST + ~25 SHOULD is geen solo-sprint, het is verlamming. Striktere regel: een MUST mag alleen in v0.10 als het een **actief risico op de huidige publieke widget** dekt (denial-of-wallet, AVG op live bezoeker-traffic, onzichtbare downtime) of een isolatie-bug vooruithardt. De rest is "vóór de eerste echte klant" = V1-voorbereiding.

**Herziene v0.10-kern (de enige MUSTs):**
1. **Stage 0 — provisioning + CI** (zie B): Upstash-account+Redis-DB, UptimeRobot, DEPLOY.md compleet, GitHub Actions `next build`.
2. **Basis-versie vastzetten** (zie D): v0.9.3 bevestigen als basis + de judge-excerpt-cap fixen zodat de automated AQ-gate weer bruikbaar is.
3. **Upstash live op prod + startup-assert** (crash bij ontbrekende `EMBED_TOKEN_SECRET`/`USE_UPSTASH` — een checklist die een mens volgt faalt onder tijdsdruk). Consolideert 4 oude losse MUSTs.
4. **Per-org dag-budget-cap in USD** (niet EUR — zie C) + graceful 429.
5. **PII-redactie bedraden in `logQuery()`** — letterlijk één import + één aanroep.
6. **Retentie-cron** — cron-route + `vercel.json`-entry (de service `retention.ts` is al af).
7. **Widget-bezoeker disclosure + delete-endpoint** (voeg de SHOULD "privacy-link" hierin samen).
8. **`runRagQuery`/`logQuery` orgId niet-optioneel maken** — ~6–9 functies hebben `= DEV_ORG_ID`-default; ~halve dag + grep-inventaris, géén one-liner.
9. **Hard-fact-gate stabiel op v0.9.3** (0 over-refusals op de 112-klasse — let op de 13% over-refusal, zie D — + 0 fabricaties).
10. **Gate runs=3 als AFSLUITING** (zie E): bevroren v0.10-bot → gate → pas dán `LATEST_BOT_VERSION` verzetten.

**Naar V1 verschoven (uit v0.10):** `callLLM()`-laag (greenfield ~200–400 regels; bouw + activeer + her-evalueer als één V1-blok, niet als dode V0-prep), per-klant onboarding-corpuscheck (vereist een echt klant-corpus), Sentry/TTFT-dashboard/token-chunker/rollback-via-env (nuttig, niet vóór de eerste klant). Migratie-"opschoning" → losse diagnosetaak, geen gate-item.

### B. Niet alles is "pure code" — sommige items vereisen éérst een account/instance (antwoord op de Upstash-vraag)
Ja: Upstash moet je eerst **aanmaken**. De SDK (`@upstash/ratelimit`/`@upstash/redis`) staat al in `package.json`, maar de Redis-instance niet — en de fallback bij ontbrekende vars is een stille `console.warn` + in-memory (de beveiliging faalt zónder dat er iets crasht). Externe-setup-items:

| Item | Soort | Eerste stap |
|---|---|---|
| **Upstash** | code-ready + **infra aanmaken** (gratis) | Account → Redis-DB (EU/Frankfurt) → REST URL+TOKEN in Vercel → `USE_UPSTASH=true` |
| **UptimeRobot** | **account** (gratis) + 0 code | Account → monitor op `/api/v0/widget/ping` → alert-mail |
| **Vercel Cron (retentie)** | code + **plan-check** | Hobby = max 2 crons, alléén dagelijks (geen sub-uur; brak ooit de crawler-deploy). Dagelijkse retentie past; anders externe pinger (cron-job.org) |
| **Sentry** (SHOULD) | **install + account** (gratis tier) | `@sentry/nextjs` nog niet geïnstalleerd; ~2u werk, geen "env invullen" |
| **OPENAI_ADMIN_KEY** (optioneel) | **org-admin-key** | Graceful fallback bestaat → geen blocker |

→ **Stage 0 vóór de codebouw:** provisioneer Upstash + UptimeRobot en vul DEPLOY.md compleet (mist nu `EMBED_TOKEN_SECRET`/`USE_UPSTASH`/`UPSTASH_*`/`CRON_SECRET`/`OPENAI_ADMIN_KEY`/`FIRECRAWL_API_KEY`). ~30–60 min, deblokt alle Thema-3/5-MUSTs.

### C. Drie concrete fouten in de oude lijst
- **Injection block-mode was GEEN ontbrekend bouwwerk** — `app/api/v0/chat/route.ts:272` doet al `injectionMode = isCookieAuthed(req) ? getInjectionMode() : 'block'`: het publieke embed-pad blokkeert injection al hardcoded. → degradeer naar 3A-**verificatie** + unit-test. (Patroon-*tuning* is een post-launch-SHOULD; "tunen op echte data" is nu sowieso circulair want er is nog geen echte traffic.)
- **Budget-cap in EUR had een verborgen dependency** — V0 rekent alleen in USD (`costForModelUsd`, `query_log.cost_usd`); de EUR-tabel hangt aan de niet-geïmplementeerde `callLLM()`. → cap in **USD** (de meting bestaat al), geen callLLM-prereq.
- **Migratie "opschoning" is geen rename-klus** — de custom migrate-tool gebruikt filenames als run-state; hernoemen van al-toegepaste files breekt `migrate:status`. → eerst `migrate:status` lezen, dan een `00xx_dedup_guard.sql` óf accepteer-als-benign — niet hernoemen.

### D. v0.9.3 als basis — ja, met twee kanttekeningen (en NIET terug naar v0.8.1)
Je instinct klopt: **v0.9.3 is de juiste basis.** Geverifieerd tegen git + de prod-gate-memory:
- `LATEST_BOT_VERSION = V0_9_3.version` op origin/main (live op prod). *(NB: deze lokale branch loopt 17 commits achter en toont nog v0.9.1 — pull/rebase op origin/main vóór je v0.10 start.)*
- v0.9.3 is al door een gate-run gehaald (2026-06-02): de automated JA was **ongeldig** door een judge-excerpt-cap-bug (ook de bevestigd-JA v0.8.1 zakte → scoring kapot, niet de bot), maar op élke **vertrouwbare deterministische as is v0.9.3 ≥ v0.8.1**: no-fabricated-specifics 7/7 vs 4/7, overall 81% vs 78%, sneller (p50 5670 vs 6569 ms).
- **De aanname "v0.8.1 is de beste" is achterhaald.** Onder de gehardde gate (PR #165) is **v0.8.1 = NEE** (verzint "€4,20/uur parkeerkosten") en **v0.9.2 = JA (93%)**. Val dus NIET terug op v0.8.1.

Twee kanttekeningen vóór je v0.10 erop bouwt:
1. **Open eval-fix (prereq):** stuur de judge de volledige retrieved chunk-tekst (of injecteer de hardFact-bron-regels) i.p.v. de ≤1200-cap — anders blijft élke gegrond-getal-case een false-fail en is de automated AQ-gate onbruikbaar.
2. **Watch-item (deterministisch, niet judge-afhankelijk):** v0.9.3 heeft **13% over-refusal (4/30) vs v0.8.1 3% (1/30)** — de #167-gestroomlijnde prompt is iets weiger-gretiger op beantwoordbare vragen. Dit is een legitiem **v0.10-tuningdoel** op zichzelf (raakt MUST #9).

### E. Sequencing-correctie
Gate runs=3 is de **afsluiting** (DoD), niet stap 3 — hij kan pas op een bevroren bot-config. CI-build is **stap 0**, niet stap 4. Gecorrigeerde volgorde: **(0)** provisioning + CI → **(1)** geld-kraan/misbruik (Upstash + USD-budget-cap + startup-assert; injection = alleen verifiëren) → **(2)** AVG-codelaag (PII + retentie-cron + bezoeker-delete) → **(3)** bot-config afsluiten (hard-fact-gate + over-refusal-tuning + orgId-fix) → **(4)** UX-verificatie op de bevroren bot → **(5)** ops-rest → **(6)** gate runs=3 → `LATEST_BOT_VERSION` verzetten.

---

## 0. Belangrijke nuance over "v0.10"

ChatManta's bot-versies zijn append-only config-snapshots in `bots.ts` (geen mutatie van bestaande snapshots). Maar een groot deel van het werk hieronder is **geen bot-config** — het is codebase + ops (PII-redactie in `logQuery`, retentie-cron, budget-cap, Upstash, CI-build, env-vars). Lees "v0.10" daarom als een **release-mijlpaal** = (nieuwe bot-snapshot `v0.10` voor de prompt/gate-onderdelen) **+** een set codebase/ops-wijzigingen die niet ge-versioneerd zijn. Niet alles hieronder landt in `bots.ts`.

---

## 1. Het scheidingsprincipe

Een criterium is **V1-only** als het de nieuwe productie-omgeving zelf vereist: een echte ingelogde gebruiker, een aparte productie-database, of per-user membership. Een criterium is **V0-haalbaar** als het volledig te bouwen/bewijzen is binnen de huidige codebase tegen het V0-org-model (org via cookie/`?org=`), ook al wordt diezelfde mechaniek straks door auth gevoed.

Cruciaal inzicht: de meeste "blockers" uit de hoofd-analyse zijn **mechanisme-blockers, geen omgeving-blockers**. Een per-org budget-cap, PII-redactie, een retentie-cron, Upstash-rate-limiting, injection-block-mode — die werken allemaal tegen het V0-org-model. Wanneer V1 landt verandert alleen *waar de orgId vandaan komt* (auth i.p.v. cookie); de logica zelf is dan al gebouwd en getest. Dat maakt ze v0.10-werk, niet V1-werk.

---

## 2. V1-ONLY — buiten v0.10-scope (kan pas als de V1-omgeving er staat)

Deze blijven bewust liggen tot de V1-omgeving gebouwd is. Ze zijn klein in aantal maar zwaar in gewicht.

| # | Criterium | Waarom V1-only |
|---|---|---|
| V1-1 | **Supabase Auth end-to-end** (`requireAuth`/`requireOrgMember` met echte sessie) | Vereist een echte ingelogde gebruiker; bestaat alleen in de V1-omgeving. |
| V1-2 | **Twee fysiek gescheiden Supabase-projecten** (V0-sandbox vs V1-prod) | Ís het opzetten van de V1-omgeving. |
| V1-3 | **SA-1 object-level access afgedwongen op echte V1-server-actions** | De V1-actions bestaan nog niet; de *discipline/pattern* is wel al klaar (`getOrgScopedAdminClient`). |
| V1-4 | **Org-resolutie uitsluitend uit geverifieerde sessie** (geen cookie/`?org=`) in V1-paden | De V1-routes bestaan nog niet. *Wel V0-prepbaar:* de grep/CI-gate die cross-imports blokkeert (zie 3B-prep). |
| V1-5 | **Echte per-user multi-tenancy + `organization_members`** | Definieert de V1-omgeving. |
| V1-6 | **`chatbot_id`-isolatie in vector-search** (meerdere chatbots per org) | Pas zinvol bij V1 multi-chatbot; testklanten hebben 1 chatbot elk. Schema-prep optioneel V0. |
| V1-7 | **Supabase Pro + PITR voor het V1-productie-project** | Hoort bij het nieuwe prod-project; bestaat nog niet. |
| V1-8 | **Klant-provisioning die geauthenticeerde orgs aanmaakt** (`data-key` i.p.v. `data-org`) | Het auth-deel hangt aan V1; de UI/flow-schil is deels V0-prepbaar. |
| V1-9 | **DPA + sub-processor-acceptatie getekend met echte klanten** | Proces/juridisch; pas relevant zodra echte data stroomt (V1). *Wel nu voor te bereiden:* template + lijst (zie 3B). |
| V1-10 | **Claude Haiku 4.5 als primair model activeren + her-evalueren** | Modelkeuze + her-eval is een V1-beslissing. *Wel V0-prep:* de `callLLM()`-laag bouwen + testen (zie 3B-prep). |

Alle overige ~95 criteria uit de hoofd-analyse zijn V0-haalbaar. Die vormen v0.10.

---

## 3. v0.10-scope — V0-haalbaar

### 3A. Al aanwezig (`have`) → alleen verifiëren & vastzetten op de v0.10-versie

Geen nieuw bouwwerk; wel: bevestigen dat ze groen blijven op de uiteindelijke v0.10-bot en in de v0.10-DoD opnemen.

- Source-link sanitizer op streaming + cache + eval (PR #149)
- No-LLM fallback-pad bij nul chunks boven threshold ≈0.4
- Similarity-threshold 0.4 + hybrid search (RRF, Dutch FTS) + parent-retrieval + selective HyDE
- Soft-delete/`included`-filter in alle retrieval-RPCs
- Idempotente ingest · SSRF-guard · URL-dedup · KB-gap-detectie (`/intake`, PR #156)
- Off-domein code-output deterministisch gestopt
- Widget: fout-/lege-states + retry + token-refresh · mobiel/iframe (postMessage) · feedback-knop → operator-inbox (PR #151) · klikbare gesaniteerde bron-links · taal-spiegeling (v0.9.3)
- `is_jorion_admin` niet via UI · geen secrets in `NEXT_PUBLIC_*`
- `query_log` volledig + never-throw · error-fingerprint-store (PR #139) · request-ID-trace · per-org fallback-% + drempel · crawl-health-dashboard
- Embedding-timeout/retry · streaming-robuustheid (fout mid-stream → client-foutcode)
- `/privacy`-pagina live (PR #160)

### 3B. Bouwen in v0.10 (`partial`/`missing`) → het echte werk

Gegroepeerd per thema. Prio: **MUST** = v0.10 is niet "V1-ready" zonder dit; **SHOULD** = sterk gewenst voor launch maar handmatig/uitstel mogelijk; **PREP** = de-risking voor V1.

#### Thema 1 — Antwoord-veiligheid & gate-bewijs (de bot zelf)
- **MUST** — Hard-fact-gate stabiel op de v0.10-bot: 0 over-refusals op correct-beantwoordbare vragen (de "112"-klasse) én 0 doorgelaten verzonnen getallen/prijzen/datums (de €295-klasse). Named regressie-fixtures groen.
- **MUST** — Productie-gate eval PASS op `runs=3` (niet n=1) op de versie die `LATEST_BOT_VERSION` wordt, met groene regressie-diff-baseline.
- **MUST** — Over-refusal én under-refusal beide gemeten + binnen drempel in de gate-output.
- **SHOULD** — `hardFactSupport` naar `eval_runs` schrijven zodat de gate het binair kan gebruiken (gap V0_8 §3.2).
- **SHOULD** — Overconfidence-hedging mechanisch afdwingen bij weak/medium retrieval (nu prompt-only).
- **SHOULD** — Multi-turn history-entity-adoptie: ≥3 multi-turn planted-fact-cases toevoegen.

#### Thema 2 — Privacy/AVG (de V0-codelaag — bijna volledig haalbaar!)
- **MUST** — `redactPii()` écht bedraden in `logQuery()` op `query_log.question` (+ de `piiRedactionEnabled`-flag laten sturen). Grootste technische privacy-schuld; pure V0-codefix.
- **MUST** — Geautomatiseerde retentie-cleanup via Vercel Cron (`retention.ts` is al compleet; alleen cron-route + `vercel.json`-entry).
- **MUST** — Widget-bezoeker disclosure + verwijderpad (delete-endpoint voor `v0_threads`/`v0_thread_messages` per visitor-id).
- **SHOULD** — Privacy-disclosure-link in de widget (per-org configureerbaar) → naar `/privacy`.
- **SHOULD** — Dataminimalisatie-default: mechanisme voor `full_conversation_logging=false` als veilige default voor echte orgs.
- **SHOULD** — Handmatig recht-op-verwijdering: admin-actie/CLI per visitor-id/thread + `last_data_deletion_at` vullen.
- **PREP (proces)** — DPA-template + sub-processor-lijst opstellen (OpenAI/Anthropic/Supabase/Vercel/Firecrawl/Resend + regio/SCCs). Tekenen = V1, opstellen = nu.

#### Thema 3 — Kosten- & misbruik-containment (publieke widget bestaat al in V0)
- **MUST** — Per-org EUR dag-budget als harde runtime-cap in de chat-route: bij overschrijding LLM-call weigeren (402/429) i.p.v. alleen `cost_usd` loggen.
- **MUST** — Graceful degradatie bij budget-uitputting op alle surfaces (widget-iframe, testtool, API) — nette melding, geen 500.
- **MUST** — Upstash rate-limit live op prod (`USE_UPSTASH=true` + Redis-vars) zodat de teller globaal is over serverless-instances. Code is klaar; alleen aanzetten + verifiëren.
- **MUST** — Deploy-checklist die `USE_UPSTASH`/`UPSTASH_*`/`EMBED_TOKEN_SECRET` afdwingt (startup-assert of health-check), geen stille in-memory fallback.
- **MUST** — Injection-detectie in `block`-mode op het publieke embed-pad (`INJECTION_MODE=block`), patronen getuned op echte/realistische data.
- **SHOULD** — System-prompt-leakage geblokkeerd (reveal-prompt-patronen actief + named eval-fixtures).
- **SHOULD** — Indirecte corpus-injection mitigeren (sanitatie/instructie op chunk-content; nu draait de detector alleen op user-input).
- **SHOULD** — Origin-allowlist fail-closed maken (nu fail-open bij lege lijst/ontbrekende Referer) of admin-waarschuwing bij lege allowlist + actieve widget.
- **SHOULD** — Gevoelige topics (medisch/juridisch/financieel) → escalatie/doorverwijzing i.p.v. inhoudelijk advies (config + prompt + eval-fixtures).

#### Thema 4 — Betrouwbaarheid & resilience
- **MUST** — Upstash live (zie Thema 3) — telt ook als reliability-blocker.
- **MUST** — TTFT-baseline meten op realistisch verkeer + herijkte, onderbouwde SLO (de doc-grens <2s is zonder architectuurwijziging niet haalbaar; mik bv. p95 ≤5s).
- **SHOULD** — Cache-invalidatie-protocol bij in-place versie-wijziging (knop per org of automatische invalidatie bij versie-bump; `v0:clear-cache` is kapot).
- **SHOULD** — Ingest-backpressure: 50-pagina-crawl/grote upload raakt de 60s Vercel-timeout niet (queue/cron i.p.v. directe serverless-call).
- **PREP** — `callLLM()`/`streamLLM()`-provider-abstractielaag bouwen + unit-testen (gooit nu `'not implemented yet'`). Optioneel V0 al routeren via OpenAI-provider (gedragsbehoudend) om 'm te bewijzen. De Claude-primair-swap + her-eval blijft V1 (V1-10).

#### Thema 5 — Observability & ops
- **MUST** — Externe uptime-monitoring (UptimeRobot o.g.) op `/api/v0/widget/ping` (endpoint bestaat al) + e-mail-alert bij downtime.
- **MUST** — Per-org budget afgedwongen + zichtbaar (overlap met Thema 3).
- **SHOULD** — TTFT/per-fase-latency-percentielen per org in een dashboard + SLO-definitie (data zit al in `query_log.first_token_ms` + `phase_timings_ms`).
- **SHOULD** — Server-side exception-tracking (Sentry of gelijkwaardig) op publieke endpoints — nu zijn alleen client-errors gedekt.
- **MUST** — Geautomatiseerde verificatie-build (GitHub Actions: `next build` op schone `.next/`) — geen `.github/workflows/` aanwezig; nu puur handmatige discipline.
- **MUST** — Migratie-discipline opschonen (dubbele `0039_*`/`0040_*`) + `migrate:status` schoon.
- **SHOULD** — Bot-versie rollback zonder code-push: `LATEST_BOT_VERSION` via Vercel env-var i.p.v. hard-coded export.
- **SHOULD** — `widget.js` cache-busting (`Cache-Control: max-age ≤300`).
- **SHOULD** — Runbook voor Niels (klacht/storing afhandelen zonder SQL/terminal).

#### Thema 6 — Retrieval/ingestion-hardening
- **MUST** — Org-isolatie-discipline V0-proof maken: `runRagQuery` mag `orgId` niet naar `DEV_ORG_ID` defaulten; `orgId` overal niet-optioneel. (V0-codefix die de V1-isolatie vooruit hardt.)
- **SHOULD** — Gescande-PDF-detectie met begrijpelijke foutmelding (geen stille lege KB-entry); magic-byte-validatie (post-v1).
- **SHOULD** — Lege/noise-pagina's niet ingesteren (Firecrawl `onlyMainContent` expliciet checken).
- **SHOULD** — Documentformaten met duidelijke grenzen; geen stille truncatie.
- **SHOULD** — Her-crawl-zichtbaarheid (`last_crawled_at`) + Firecrawl-foutoorzaak niet stil.
- **PREP (target)** — Token-based chunker (tiktoken) i.p.v. char-based (P95 tokens/chunk ≤400).

#### Thema 7 — UX-afronding (widget is V0)
- **MUST** — Directe antwoorden (BLUF) ook op smalltalk-/general-knowledge-paden; verifiëren op de v0.10-bot.
- **MUST** — Streaming zichtbaar zonder tag-lekken; verifiëren op de v0.10-bot.
- **SHOULD** — Suggested follow-ups renderen in de **embed-widget** (server-side bestaat al; widget toont ze niet — concrete, kleine win).
- **SHOULD** — Tone-of-voice per merk (let op DB-backed override-gotcha) + geen meta-talk/repetitie.
- **SHOULD** — Graceful degradatie in de widget voor álle `AppError`-codes (RATE_LIMIT/NOT_FOUND/LLM_TIMEOUT) → leesbare melding.

#### Thema 8 — Eval/quality-gate-rijpheid
- **MUST** — Gate-bewijs op de júiste versie (geen stale `LATEST`); gedateerde gate-run opgeslagen voor de v0.10-bot.
- **SHOULD** — Per-klant onboarding-corpuscheck (lite-harness: ≥5 in-corpus + 3 out-of-corpus) bouwen — werkt tegen het V0-org-model, klaar voor echte klanten in V1.
- **SHOULD** — Safety-dimensies volledig deterministisch (geen handmatige judge-stap in de safety-gate).
- **SHOULD** — Judge-rubric-anchors gevuld/gereviewd + eval-kosten-raming/cap in de tooling.

#### V1-prep-laag (bouw in V0, activeer in V1)
Deze leveren in V0 nog geen functioneel verschil maar maken de V1-overgang triviaal:
- Grep/CI-gates die straks cross-imports blokkeren (`lib/v0/supabase` buiten `lib/v0/`, `v0_active_org`/`active-org` buiten `lib/v0/`, `SERVICE_ROLE_KEY` buiten `admin.ts`). Nu te schrijven, falen nog niet omdat V1-code er niet is.
- `callLLM()`-laag (Thema 4 PREP).
- DPA-template + sub-processor-lijst (Thema 2 PREP).
- Org-isolatie-discipline (Thema 6 MUST) — hardt de V1-multi-tenancy vooruit.

---

## 4. Aanbevolen v0.10-bouwvolgorde

1. **Geld-kraan & publiek oppervlak dicht** (Thema 3 MUST + Thema 5 uptime): per-org budget-cap + graceful degradatie + Upstash live + injection-block + deploy-checklist + uptime-monitor. Dit is het grootste *reële* risico zolang de widget publiek is, en volledig V0-haalbaar.
2. **AVG-codelaag groen** (Thema 2 MUST): PII-redactie bedraden + retentie-cron + bezoeker-disclosure/verwijderpad. Bijna alles is een kleine codefix bovenop bestaande infra.
3. **Gate-bewijs op v0.10** (Thema 1 + Thema 8 MUST): hard-fact-gate stabiel + productie-gate `runs=3` + regressie-diff-baseline op de nieuwe `LATEST`.
4. **Ops-net & isolatie-prep** (Thema 5 + 6 MUST + V1-prep): CI-build + migratie-opschoning + `runRagQuery`-orgId-fix + grep-gates + `callLLM()`-laag.
5. **UX & resterende SHOULDs** (Thema 4/6/7): TTFT-baseline, cache-protocol, follow-ups in widget, rollback-via-env, runbook.

---

## 5. Definition of Done — v0.10 = "V1-Ready"

v0.10 is af wanneer:
- Elk **MUST** uit 3B groen is en elk **3A**-item geverifieerd op de v0.10-bot.
- De publieke widget niet meer als denial-of-wallet of injection-vector te misbruiken is (budget-cap + Upstash + block-mode aantoonbaar actief op prod).
- De AVG-codelaag écht draait (PII-redactie in `logQuery`, retentie-cron actief, bezoeker kan verwijderd worden) — niet enkel als intentie-flag.
- De productie-gate een gedateerde PASS heeft op `runs=3` voor de versie die live staat.
- De V1-prep-laag klaarstaat (grep-gates, `callLLM()`, isolatie-discipline, DPA-template) zodat de **enige** resterende V1-arbeid is: Supabase Auth e2e + 2 DB's + Pro/PITR + de auth-koppeling van provisioning aanzetten (de lijst in §2).

Met andere woorden: na v0.10 is "V1 bouwen" gereduceerd tot het inpluggen van auth + DB-scheiding tegen een codebase die op elke andere as al productiewaardig en bewezen is.
