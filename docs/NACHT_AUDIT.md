# Nacht-audit — ChatManta V0

> Autonome audit op branch `feat/seb/nacht-audit` (basis: `origin/main` #187).
> Prioriteit: **veiligheid → correctheid → versimpeling → performance**.
> Status: **7 PR's GEMERGED** (#188, #191, #192, #193, #194, #196 → main). Keuzes beslist (1A/skip/V1). A/B/D + crawler-finalisatie gedaan; C uitgesteld. Cache-fix gevalideerd (statisch + prod-data).

_Fases A–E compleet (nacht) + vervolgsessie. 6 fixes geshipt en gemerged. #191 vereiste een rebase op nieuwe main (#189 off-topic/v0.10 had `runRagQuery` óók aangepast — nog steeds dood, dus deletie geldig). Zie de "Vervolg-sessie" sectie onderaan voor A/B/D + de resterende follow-ups._

## Samenvatting

- **Veiligheid:** de `chatmanta-reviewer` hard-rules-lens vond **geen HIGH en geen blokkerende MEDIUM** in de security-gevoelige paden. De V0-grens (embed-token fail-closed + constant-time + verify-before-parse, origin-lock, dual-auth, always-block-injection op het publieke pad, fail-safe rate-limit, fail-closed startup-assert, org+soft-delete-isolatie in de RPC) is consistent en correct. Wel één **terugkerend hardening-thema** (door 3 onafhankelijke agents gemeld): **prompt-injection via chat-history én via gecrawlde content** wordt niet door `detectInjection` gefilterd. Codex (gpt-5.5) nuanceerde dat er al mitigaties zijn (systeemprompt-instructie + structurele labels + post-gen-detectie), dus een **plausibel** defense-in-depth-gat, geen open gat → report-only (S1) met concreet voorstel.
- **Correctheid:** een handvol echte bugs, meeste laag-impact bij V0-volume. Hoogste waarde: retention-sentinel lekt in recap/metrics (PR1), cache-`hit_count` bump is een silent no-op (PR2), cache-hit logt de volledige originele kost tegen het dag-budget (report — raakt budget-semantiek).
- **Versimpeling:** `runRagQuery` (≈160 regels non-streaming pad) is **dood** (geen enkele caller) → PR2. Diverse bewuste V0-duplicaties (service-role-clients, `upsertWebsiteSource`, PII-regexes) zijn bekend V1-consolidatiewerk → report-only.
- **Performance:** geen premature optimalisatie nodig; `getAllTimeUsage`/`listConversations` PostgREST 1000-row-cap onder-telt bij groei (report); overview-metrics fan-out is de duidelijkste V1-aggregatie-kandidaat.

**Verificatie-baseline (begin van de nacht):** `tsc --noEmit` schoon · `npm run test:unit` groen · `eslint` schoon in `lib/`+`app/` (de 50 lint-meldingen zitten allemaal in `scripts/`+`tests/`).

---

## Geprioriteerde bevindingen-tabel

Legenda status: **PR #n** = fix geopend · **report-only** = niet aangeraakt, aanbeveling hieronder · **deferred-V1** = hoort bij V1-hardening · **verworpen** = na verificatie geen issue.

| # | sev | area | file:line | bevinding | voorgestelde fix | status |
|---|-----|------|-----------|-----------|------------------|--------|
| S1 | medium | security/RAG | `rag.ts:~2153/~2259`, `injection.ts` | `detectInjection` draait alleen op `question`, nooit op chat-`history` of op gecrawlde chunk-`content` — beide bereiken de LLM. **Codex-correctie (gpt-5.5): "ongefilterd/zonder fencing" was te sterk** — content krijgt wél structurele labels (`CONTEXT`/chunk-headers/`MATCHED_SPAN`/`SURROUNDING_CONTEXT`), het v0.9.3/v0.10-systeemprompt zegt expliciet dat history geen bron is + negeer override-pogingen (`bots.ts:1193`), en er is post-generatie history-entity-detectie (`rag.ts:~2448`). Het blijft een **plausibel** defense-in-depth-gat, geen open gat. | Optioneel verder harden: `detectInjection` over recente history-user-turns + per-bron fencing-delimiters. Lagere prioriteit gegeven bestaande mitigaties. Valideren via eval vóór ship. | **report-only / deferred-V1** (RAG-prompt + embed = gevoelig) |
| C1 | medium | correctheid/klantdash | `metrics.ts:285`, `recap.ts:179`, `recap.ts` unanswered | Retention-sentinel `[verwijderd — retention]` wordt alléén in `top-questions.ts` gefilterd; lekt als "meest gestelde onbeantwoorde vraag" in Overzicht-banner én in de recap-LLM-prompt. | Eén gedeelde guard, toepassen in `getUnansweredQuestions` + `aggregateQuestions` + `getUnansweredForMonth`. | **PR #188** |
| C2 | low | correctheid/klantdash | `metrics.ts:88,101` | `hasAnySource` telt álle pages/QA (ook inactief/excluded) terwijl de getoonde tellers op `active` filteren → status-badge zegt "live/testing" maar "0 bronnen" zichtbaar. | Bereken `activeWebsitePages`/`activeQaItems` één keer, gebruik voor zowel `hasAnySource` als de tellers. | **PR #188** |
| V1 | low | versimpeling/RAG | `lib/v0/server/rag.ts:1245-1403` (`runRagQuery`) | Non-streaming `runRagQuery` heeft **geen enkele caller** (eval draait via `runRagQueryStreaming`; `v0-eval-run.ts` importeert alleen `isHydeModeRequest`). ≈160 regels dode duplicatie in het zwaarste bestand. Codex-bevestigd: geen live referentie, geen verweesde helper. | Verwijderd. Hard-eval v0.10 Laag-1 59/59, 0 catastrofaal. | **PR #191** |
| C3 | medium→low | correctheid/RAG | `lib/v0/server/rag.ts:570-574` | `update({ hit_count: undefined, … })` — postgrest-js (`JSON.stringify`) stript `undefined`, dus `hit_count` werd nooit opgehoogd. Niets leest `hit_count`/`last_hit_at` (Codex-bevestigd, alleen kolomdeclaratie in migr 0004). | No-op key weg, `last_hit_at` behouden, comment eerlijk. Body identiek vóór/na. | **PR #191** |
| C4 | low | correctheid/errors | `lib/errors/app-error.ts:38-67` | ~~`httpStatusFor` switch heeft geen `default`~~ — **VERWORPEN na verificatie**: de switch declareert returntype `: number` zonder default → TS bewijst exhaustiveness, dus de functie compileert nú alleen omdat álle codes gedekt zijn. Een nieuwe `AppErrorCode` zónder case maakt het functie-einde bereikbaar → **compile-fout** (returntype bevat geen `undefined`). Een `default: return 500;` toevoegen zou die compile-time-bescherming juist wéghalen (nieuwe code → stil 500 i.p.v. tsc-fout). Geen runtime-`undefined`-risico. | Geen — huidige patroon is correct. | **verworpen** |
| Z1 | low | dead-code/crawler | `lib/v0/crawler/crawlEvents.ts:15` | `CrawlEventType 'ingest'` wordt nergens geëmit (writers gebruiken start/poll/complete/fail; ingest = `complete`+decision `ingested`). Lees-kant leest `event_type as string`. | Drop `'ingest'` uit de union. | **PR #192** |
| SEC1 | medium | security/rate-limit | `lib/v0/server/rate-limit.ts:281-311` | `getClientIp` neemt de **eerste** `x-forwarded-for`-waarde (client-controleerbaar) → per-IP-bucket-ontwijking. Op Vercel niet exploiteerbaar (platform normaliseert XFF) + per-org-bucket vangt het af. `getClientIpFromHeaders` dupliceert de fout. | Bij V1: `x-real-ip`/platform-IP i.p.v. linker-XFF; helper deduppen. | **report-only / deferred-V1** |
| SEC2 | low | security/budget | `lib/v0/server/log.ts:353`, `budget.ts:75-101` | Cache-hit logt de **originele** `cost_usd` (uit `response_json`) terwijl de hit alleen een embed-lookup kost → het dag-budget telt fantoom-spend en kan te vroeg `BUDGET_EXHAUSTED` (402) geven. | `cost_usd=0` bij `fromCache`, óf `from_cache=true` uitsluiten in de budget-sum. Raakt budget-semantiek → bevestig intentie. | **report-only** |
| SEC3 | medium | security/AVG | `lib/observability/redact.ts:10-26` | `redactPii` dekt alleen e-mail, NL-IBAN, NL-telefoon (start 0), bare 9-cijfer BSN. Mist: namen, adressen, postcodes, niet-NL/`00…`-telefoon. Docstring claimt volledige AVG-dekking → overstated. | Voeg NL-postcode + intl-telefoon-patroon toe; zwak docstring-claim af naar "best-effort structured-PII". Met test. | **report-only** (kandidaat-PR, mits geen over-masking) |
| SEC4 | medium | security/cost | `app/klantendashboard/actions.ts` QA/settings | `upsertQAItemAction`/`setQAActiveAction`/`addQAFromTopQuestionAction`/`saveChatbotSettingsAction` fan-outen naar betaalde `ingestText`/`purgeAnswerCache` zónder `checkMutationLimit()` (die `docs.ts`/feedback/quiz wél hebben). Demo-cookie kan embedding-calls aanjagen. | `checkMutationLimit()` toevoegen aan de ingest-fan-out-actions. | **report-only** (kandidaat-PR) |
| C5 | medium | correctheid/klantdash | `conversations.ts:80-107` | `listConversations` haalt thread-messages ASC zonder `.limit()`; bij >1000 rijen (PostgREST-cap) vallen de **laatste** posities (eindantwoorden) weg → verkeerde status. `getConversationSuccessRate` doet het bewust DESC. | Mirror de DESC + set-if-absent-aanpak. | **report-only** (laag trigger bij V0-volume) |
| C6 | medium | correctheid/RAG | `lib/v0/server/rag.ts:2010-2096` | Het general-knowledge zero-hits-pad hardcodeert Nederlandse `GENERAL_OPENING/CLOSING` en negeert de `languageDirective` → EN/DE-bezoeker met 0 hits krijgt NL-omkadering. Zelfde klasse als v0.9.2 EN→NL. | Thread de resolved taal in de general-knowledge-opening/closing. Valideren via eval. | **report-only** (RAG-gevoelig) |
| C7 | medium | correctheid/RAG | `lib/v0/server/rag.ts:1780-1797` | Cache-key = (org, bot_version, vraag-embedding) — negeert tone/length/overrides. Een hit stempelt de **huidige** tone/length op een antwoord met de **gecachte** toon → Bot-prestaties-telemetrie (PR #173) liegt over toon. | Tone/length in de cache-key, óf log de gecachte tone/length i.p.v. de huidige. | **report-only** |
| Q1 | low | versimpeling | `log.ts`/`threads.ts`/`budget.ts` + ~20 sites | ~20 ad-hoc service-role-clients i.p.v. `lib/supabase/admin.ts`-wrappers (SA-5). Grep-gate `_serviceRoleClient` buiten admin.ts is wél groen. Bekend V1-fundament-item. | Consolideer bij V1-kickoff (niet nu — partial consolidatie botst met gepland werk). | **deferred-V1** |
| Q2 | low | versimpeling/crawler | `crawl.ts:260-312` ⇄ `admin-crawl.ts:58-99` | `upsertWebsiteSource` + url-helpers (`filterPublicUrls`/`normalizeUrl`/`hostnameOf`) staan verbatim dubbel (admin cl", clears `disabled_at`). | Extract `lib/v0/crawler/upsertWebsiteSource.ts` met `clearDisabled?`-flag. | **report-only** |
| Q3 | low | versimpeling/AVG | `observability/redact.ts` ⇄ `controlroom/pii.ts` | Twee PII-regex-sets (redactor vs detector), in sync gehouden door een test. | Eén bron-string, derive `/g`- en niet-`/g`-variant. | **report-only** |
| P1 | low | perf | `log.ts:148-176` (`getAllTimeUsage`), `metrics.ts:67-78` | Flat `.select()` kapt op ~1000 PostgREST-rijen → all-time-usage-footer onder-telt bij drukke org; overview-metrics doet ~9 round-trips over overlappende vensters. | DB-side aggregate-RPC (migratie → V1). | **report-only / deferred-V1** |

Kleinere/lagere bevindingen (multi-query quote-strip-regex C `rag.ts:668`, NUMBER_RE substring-grounding `hard-facts.ts:255`, history-entity ReDoS-oppervlak, `addQAFromTopQuestion` `Math.random`-id, QA `updatedAt`-stamping, `parseAccountOverrides` read-validatie, e-mail `reply_to` comma-injectie, attachment lege-MIME-skip) staan in de **detail-appendix** onderaan met confidence-niveau.

---

## Geopende PR's

- **PR #188** — `fix(klantendashboard): retention-sentinel uitfilteren + actieve-bron-consistentie` (C1 + C2). tsc + 64 unit tests + build groen. Niet gemerged.
- **PR #191** — `refactor(rag): verwijder dood runRagQuery + fix cache-stat no-op` (V1 + C3). tsc + lint + build + Codex-cross-check + hard-eval v0.10 (59/59) groen. Niet gemerged.
- **PR #192** — `refactor(crawler): verwijder dood 'ingest' CrawlEventType-lid` (Z1). **GEMERGED.**
- **PR #193** — `fix(rag): cache-hit echte marginale kost + gecachte toon` (1A/SEC2 + D/C7). **GEMERGED.**
- **PR #194** — `fix(crawler): atomische ingest-claim + wall-clock crawl-timeout` (A + B). Codex 4-rondes-cross-checked. **GEMERGED.**

_Alle 6 PR's gemerged naar main. C4 (errors-default) is na verificatie **verworpen** als false-positief — zie de tabel._

---

## Vervolg-sessie (na de nacht) — grotere correctheid-puntjes

Sebastiaan koos: fix **A + B + D**, **C** uitstellen. Allemaal gemerged.

- **A — crawler double-ingest** (PR #194). Atomische ingest-claim (status-flip onder `.in(['pending','processing'])`; Postgres serialiseert) + guards (poll-update, rate-limit-recovery, `failJob`, `wonClaim`-vlag). **Codex (gpt-5.5) 4 rondes**, vond achtereenvolgens een poll-reopen-race, de `wonClaim`-distinctie en de eigen-`completed`-fail; alle gedicht → geen double-ingest/stale-overwrite meer.
- **B — crawler poll-timeout** (PR #194). Wall-clock `MAX_CRAWL_DURATION_MS=30min` op `created_at` i.p.v. poll-telling (200 polls = ~13min bij 4s-tick). `created_at` toegevoegd aan `OpenJob` + alle 4 callers.
- **D — cache cross-tone telemetrie** (PR #193). Cache-hit behoudt de gecachte tone/length → Bot-prestaties logt de geserveerde toon, niet de gevraagde.
- **C — listConversations row-cap** → **UITGESTELD** (triggert niet bij V0-volume).

### Follow-ups uit deze sessie — afgehandeld
- **Crawler finalisatie-robuustheid** → **PR #196 GEMERGED.** De post-ingest `knowledge_sources`→`ready` ving geen Supabase-fout → bron kon stil `crawling` blijven. Nu: binnen wall-clock-budget heropenen voor auto-retry (claim voorkomt dubbel werk), daarbuiten → `failed`; 2 diagnostische decisions (`finalize-retry`/`finalize-failed`). Codex-bevestigd bounded + race-safe. Resterende extreme-tail (óók de reopen-write faalt) vereist een reconciliatie-pass — losse grotere follow-up.
- **SEC2/D cache-validatie** → **GEVALIDEERD (statisch + prod-data).** `logQuery` schrijft `cost_usd: response.totalCostUsd` (log.ts:305) en `tone: response.tone` (log.ts:306) — exact de velden die #193 op de cache-hit zet, dus de fix klopt by construction. Prod-data bevestigt de bug: **92/92 `from_cache=true`-rijen logden cost_usd > 0** (~$0,0012/stuk, totaal $0,092 fantoom-spend) i.p.v. ~0. Na **deploy** van #193 loggen cache-hits ~0 (1A) + de gecachte toon (D). Billable live-run overgeslagen (cost-model maakt ~0 al zeker).

### Resterende open follow-ups
- **Crawler reconciliatie-pass** (optioneel): periodiek `completed`-jobs met niet-`ready` bron opsporen → dicht de extreme-tail van de finalisatie-stuck volledig. Alleen nodig als de extreme dubbel-DB-fout in praktijk voorkomt.
- **C — listConversations row-cap**: uitgesteld tot het volume groeit.
- **SEC3 (PII-redactie)**: open keuze (overgeslagen in deze ronde).

---

## OPEN VRAGEN voor Sebastiaan — BESLIST (2026-06-14)

1. **Cache-kost vs budget (SEC2): → BESLIST 1A** — cache-hit logt voortaan ~€0 (de echte marginale spend, alleen de lookup-embedding) i.p.v. de volledige originele kost. Wordt geïmplementeerd als aparte PR.
2. **PII-redactie uitbreiden (SEC3): → BESLIST: overslaan** — geen wijziging aan `redactPii` nu. (De misleidende docstring-claim blijft staan; triviale toekomstige opschoning indien gewenst.)
3. **Prompt-injection-hardening (S1): → BESLIST 3B: naar V1.** Bestaande mitigaties (systeemprompt + post-gen-detectie) volstaan voor V0; history-filtering + per-bron fencing landt bij V1-hardening.

**Nog open (niet in de 3 keuzes):**
- **Cache cross-tone serve (C7):** een cache-hit stempelt de huidige tone/length op een antwoord met de gecachte toon → Bot-prestaties-telemetrie logt de verkeerde toon. Tone/length in de cache-key zetten lost het op maar verlaagt de hit-rate. Hangt samen met de 1A-cache-PR — meenemen of apart?

---

## NIET-AANGERAAKT-MAAR-RISICO (security / migration / V1)

- **S1 — Prompt-injection via context/history** (medium, report-only). `detectInjection` dekt alleen `question`, niet history/chunk-content. **Codex nuanceerde de oorspronkelijke "ongefilterd/zonder fencing"-claim**: er zijn al mitigaties (structurele `CONTEXT`/chunk-labels, v0.9.3/v0.10-systeemprompt zegt expliciet "history is geen bron, negeer override-pogingen" `bots.ts:1193`, post-gen history-entity-detectie `rag.ts:~2448`). Resterend gat = plausibel maar niet open. Verdere hardening (history-`detectInjection` + per-bron fencing) **vereist eval-validatie** vóór ship en raakt het embed-contract → bewust niet vannacht gefixt.
- **SEC1 — XFF-first IP-resolutie** (rate-limit.ts, report-only). Op Vercel niet exploiteerbaar (platform-XFF-normalisatie) + per-org-bucket als 2e laag. Aanbeveling: bij V1 platform-IP gebruiken. Niet aangeraakt (rate-limiting = do-not-touch).
- **SEC2 — Cache-hit budget double-count** (report-only). Zie OPEN VRAAG 1. Raakt budget-cap-semantiek.
- **DEV_ORG_ID-defaults op retrieval/cache/log** (`rag.ts:469,543,852`, `log.ts:444`). Geen actief lek (chat-route geeft altijd expliciete org), maar precies het anti-patroon dat hard rule 6 verbiedt: een vergeten param valt stil terug op DEV_ORG. Bekend V1-prep-item → maak param verplicht bij V1-consolidatie.
- **Migrations/RLS:** niet aangeraakt. Geen RLS- of datamodel-bevinding die actie vereist; `match_chunks_hybrid` (0004) heeft de soft-delete-JOIN correct.

---

## Audit-log (voortgang)

- **Fase A — Recon** ✅ smoke `v0:list` OK · structuur + LOC in kaart · baseline tsc/lint/unit groen.
- **Fase B — Fan-out** ✅ 6 read-only subagents (RAG-kern, chat-route, crawler, server-actions/dashboards, errors/observability, hard-rules-lens) klaar; bevindingen hierboven geconsolideerd.
- **Fase C — Codex-cross-check** ✅ (gpt-5.5) op PR #191 + S1: beide rag.ts-claims CONFIRMED; S1-"ongefilterd"-claim genuanceerd (mitigaties bestaan).
- **Fase D — Fix** ✅ PR #188 (dashboard-consistentie) · PR #191 (rag.ts opschoning) · PR #192 (crawler dead-enum). C4 verworpen na verificatie. Geen verdere veilige hoog-zekere fixes over — de rest raakt security-gevoelige/migration/budget/eval-gevoelige paden → report-only.
- **Fase E — Rapport** ✅ dit document.

---

## Detail-appendix (lagere bevindingen, met confidence)

- **rag.ts:2793-2876** (medium/bug, conf medium): deterministische history-entity- en hard-fact-refusal zijn losse `if`-blokken i.p.v. `else if`; mutuele uitsluiting hangt impliciet op een guard in `hard-facts.ts:487`. Maak lokaal `else if`. → kandidaat, RAG-gevoelig.
- **rag.ts:668** (low/bug, conf medium): multi-query quote-strip-regex heeft asymmetrische curly-quote-classes; hergebruik `stripQuotes()`.
- **hard-facts.ts:255-331** (low/bug, conf medium): `NUMBER_RE` matcht bare-token set-membership → fabriceerde getallen "supported" als token toevallig ergens voorkomt. Grotendeels gemitigeerd door v0.10 `fabricationClassOnly`.
- **history-entities.ts:28-104** (low/perf, conf low): `MULTIWORD_NAME_RE` backtrack-oppervlak op adversariële history; cap entity-input-lengte.
- **conversations.ts:99-124** (low/bug, conf low): `messageCount` telt user+assistant (~2× exchanges); semantiek/label bevestigen.
- **settings.ts:247,299-303** (low/bug, conf medium): `upsertQAItem` vertrouwt client-`updatedAt`; stempel server-side.
- **settings.ts:344-352** (low/bug, conf medium): `parseAccountOverrides` (read) mist de email/lengte-validatie van de write-pad.
- **app/klantendashboard/actions.ts:204** (low/bug, conf medium): QA-id via `Math.random()`+`Date.now()`; gebruik `crypto.randomUUID()`.
- **email.ts:44 + feedback-notify.ts:39** (medium/security, conf medium): `reply_to` uit publieke form; `EMAIL_RE` staat komma's toe → mogelijke multi-recipient reply-to. Verstrak regex of pass als single-element array.
- **feedback-validate.ts:114-125** (medium/security, conf medium): attachment-validatie skipt bij lege `file.type`; eis non-empty MIME + forceer `Content-Disposition: attachment`.
- **error-capture.ts:95-121** (low/perf, conf medium): `enforceCap` doet count-queries per public client-error binnen 800ms-race; cache de open-group-count met korte TTL.
- **firecrawl.ts:180-182 / 218-231** (low/bug, conf medium): map+sitemap-merge `.slice` kan sitemap-only-URLs droppen; completion-pad doet 2e zware paginated status-call (429-risico).
- **processJobs.ts:75,121** (medium/bug, conf medium): `MAX_ATTEMPTS=200` als poll-teller → ~13 min hard-ceiling bij 4s-tick kan een trage crawl onterecht `failed` zetten; gate op wall-clock.
- **crawl.ts:162 / cron** (medium/bug, conf medium): geen atomische job-claim tussen select en `processCrawlJobs` → gelijktijdige ticks kunnen dubbel-ingesten (delete-then-insert interleave → dubbele chunks + dubbele embed-kost).
- **hydrateParentContent rag.ts:892-923** (low/security, conf medium): `parent_chunks`-select zonder `organization_id`-predicate (ids komen wel org-scoped binnen). Defense-in-depth: voeg `.eq('organization_id', orgId)` toe.

**Gecontroleerd & schoon (non-findings):** vector-search-isolatie (orgId/chatbotId verplicht in streaming-pad, soft-delete-JOIN), geen secrets naar client/`NEXT_PUBLIC_*`, threshold-fallback-pad aanwezig, embed-token/embed-auth/rate-limit-fallback/admin-wrappers/origin-allowlist/startup-assert correct, cron-auth fail-closed, SSRF-IP-ranges in `validateCrawlUrl` grondig, per-page-error-isolatie in ingest robuust, mail-bodies escapen user-input.
