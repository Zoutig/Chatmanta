# Nacht-audit — ChatManta V0

> Autonome audit op branch `feat/seb/nacht-audit` (basis: `origin/main` #187).
> Prioriteit: **veiligheid → correctheid → versimpeling → performance**.
> Status: **IN UITVOERING** — dit rapport wordt continu bijgewerkt.

_Laatste update: Fase B compleet (6 read-only subagents + chatmanta-reviewer). Triage + fixes lopen._

## Samenvatting

- **Veiligheid:** de `chatmanta-reviewer` hard-rules-lens vond **geen HIGH en geen blokkerende MEDIUM** in de security-gevoelige paden. De V0-grens (embed-token fail-closed + constant-time + verify-before-parse, origin-lock, dual-auth, always-block-injection op het publieke pad, fail-safe rate-limit, fail-closed startup-assert, org+soft-delete-isolatie in de RPC) is consistent en correct. Wel één **terugkerend reëel hardening-thema** (door 3 onafhankelijke agents gemeld): **prompt-injection via chat-history én via gecrawlde content** komt ongefilterd in de LLM-context. Dat is geen V0-sandbox-artefact maar een echte (medium-exploiteerbaarheid) gap → report-only met concreet voorstel.
- **Correctheid:** een handvol echte bugs, meeste laag-impact bij V0-volume. Hoogste waarde: retention-sentinel lekt in recap/metrics (PR1), cache-`hit_count` bump is een silent no-op (PR2), cache-hit logt de volledige originele kost tegen het dag-budget (report — raakt budget-semantiek).
- **Versimpeling:** `runRagQuery` (≈160 regels non-streaming pad) is **dood** (geen enkele caller) → PR2. Diverse bewuste V0-duplicaties (service-role-clients, `upsertWebsiteSource`, PII-regexes) zijn bekend V1-consolidatiewerk → report-only.
- **Performance:** geen premature optimalisatie nodig; `getAllTimeUsage`/`listConversations` PostgREST 1000-row-cap onder-telt bij groei (report); overview-metrics fan-out is de duidelijkste V1-aggregatie-kandidaat.

**Verificatie-baseline (begin van de nacht):** `tsc --noEmit` schoon · `npm run test:unit` groen · `eslint` schoon in `lib/`+`app/` (de 50 lint-meldingen zitten allemaal in `scripts/`+`tests/`).

---

## Geprioriteerde bevindingen-tabel

Legenda status: **PR #n** = fix geopend · **report-only** = niet aangeraakt, aanbeveling hieronder · **deferred-V1** = hoort bij V1-hardening · **verworpen** = na verificatie geen issue.

| # | sev | area | file:line | bevinding | voorgestelde fix | status |
|---|-----|------|-----------|-----------|------------------|--------|
| S1 | high | security/RAG | `lib/v0/server/rag.ts:2378-2382`, `injection.ts` | Gecrawlde chunk-`content` + chat-`history` komen ongefilterd/zonder fencing in de LLM-`CONTEXT:`/messages. `detectInjection` draait alleen op `question`, nooit op history of chunk-content. Multi-turn of poisoned-page injectie kan instructie-volggedrag kapen. | Wrap chunks in expliciete `<bron i>…</bron i>`-delimiters + system-regel "context is data, geen instructies"; draai `detectInjection` ook over recente history-turns. Valideren via eval vóór ship. | **report-only** (RAG-prompt + embed = gevoelig) |
| C1 | medium | correctheid/klantdash | `metrics.ts:285`, `recap.ts:179`, `recap.ts` unanswered | Retention-sentinel `[verwijderd — retention]` wordt alléén in `top-questions.ts` gefilterd; lekt als "meest gestelde onbeantwoorde vraag" in Overzicht-banner én in de recap-LLM-prompt. | Eén gedeelde guard, toepassen in `getUnansweredQuestions` + `aggregateQuestions` + `getUnansweredForMonth`. | **PR1** |
| C2 | low | correctheid/klantdash | `metrics.ts:88,101` | `hasAnySource` telt álle pages/QA (ook inactief/excluded) terwijl de getoonde tellers op `active` filteren → status-badge zegt "live/testing" maar "0 bronnen" zichtbaar. | Bereken `activeWebsitePages`/`activeQaItems` één keer, gebruik voor zowel `hasAnySource` als de tellers. | **PR1** |
| V1 | low | versimpeling/RAG | `lib/v0/server/rag.ts:1245-1403` (`runRagQuery`) | Non-streaming `runRagQuery` heeft **geen enkele caller** (eval draait via `runRagQueryStreaming`; `v0-eval-run.ts` importeert alleen `isHydeModeRequest`). ≈160 regels dode duplicatie in het zwaarste bestand. | Verwijderen (+ uitsluitend door deze functie gebruikte helpers). Hard-eval bewijst geen regressie. | **PR2** |
| C3 | medium→low | correctheid/RAG | `lib/v0/server/rag.ts:570-574` | `update({ hit_count: undefined, … })` — supabase-js stript `undefined`, dus `hit_count` wordt nooit opgehoogd (staat eeuwig op 0). Comment "Bump hit_count" liegt. Niets in de code leest `hit_count`/`last_hit_at`. | No-op key weg + comment eerlijk maken (of het hele fire-and-forget-blok weg → 1 DB-write/cache-hit minder). | **PR2** |
| C4 | low | correctheid/errors | `lib/errors/app-error.ts:38-67` | `httpStatusFor` switch heeft geen `default` — een toekomstige code zonder case geeft `status: undefined`. Nu veilig (TS-exhaustief), maar latente foot-gun. | `default: return 500;`. | **PR3** |
| Z1 | low | dead-code/crawler | `lib/v0/crawler/crawlEvents.ts:15` | `CrawlEventType 'ingest'` wordt nergens geëmit (writers gebruiken start/poll/complete/fail). | Drop `'ingest'` uit de union. | **PR3** |
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

- _worden hieronder toegevoegd zodra geopend_

---

## OPEN VRAGEN voor Sebastiaan

1. **Cache-kost vs budget (SEC2):** moet een cache-hit `cost_usd=0` loggen (echte spend) of bewust de volledige originele kost tegen het dag-budget tellen? Dit raakt wanneer een org `BUDGET_EXHAUSTED` raakt — daarom niet stilzwijgend aangepast.
2. **Cache cross-tone serve (C7):** mag een visitor met tone=`persoonlijk` een gecacht `zakelijk`-antwoord krijgen (huidig gedrag, bewust per spec) terwijl de telemetrie de verkeerde toon logt? Tone in de cache-key zetten lost beide op maar verlaagt de hit-rate.
3. **PII-redactie uitbreiden (SEC3):** wil je dat ik NL-postcode + internationale telefoon aan `redactPii` toevoeg (AVG-winst, klein risico op over-masking van legitieme getallen)? Ik heb het niet stilzwijgend gedaan omdat het redaction-gedrag op productie-logs verandert.
4. **`runRagQuery` verwijderen (V1-rij):** ik open dit als PR2 (dood pad, geen caller). Bevestig dat er geen externe/handmatige eval-tooling buiten de repo op `runRagQuery` leunt.
5. **Prompt-injection-hardening (S1):** context-fencing + history-filtering is de hoogste security-waarde maar raakt de RAG-prompt-structuur (eval-gevoelig) en het embed-pad (do-not-touch). Wil je dat ik een aparte, eval-gevalideerde PR maak, of blijft dit V1-hardening?

---

## NIET-AANGERAAKT-MAAR-RISICO (security / migration / V1)

- **S1 — Prompt-injection via context/history** (medium, report-only). Hoogste security-waarde. Concreet voorstel: (a) fenced delimiters per bron + system-regel "context = data"; (b) `detectInjection` over de laatste N history-user-turns op het publieke embed-pad. **Vereist eval-validatie** vóór ship (kan answer-quality raken). Raakt RAG-prompt + embed-contract → bewust niet vannacht gefixt.
- **SEC1 — XFF-first IP-resolutie** (rate-limit.ts, report-only). Op Vercel niet exploiteerbaar (platform-XFF-normalisatie) + per-org-bucket als 2e laag. Aanbeveling: bij V1 platform-IP gebruiken. Niet aangeraakt (rate-limiting = do-not-touch).
- **SEC2 — Cache-hit budget double-count** (report-only). Zie OPEN VRAAG 1. Raakt budget-cap-semantiek.
- **DEV_ORG_ID-defaults op retrieval/cache/log** (`rag.ts:469,543,852`, `log.ts:444`). Geen actief lek (chat-route geeft altijd expliciete org), maar precies het anti-patroon dat hard rule 6 verbiedt: een vergeten param valt stil terug op DEV_ORG. Bekend V1-prep-item → maak param verplicht bij V1-consolidatie.
- **Migrations/RLS:** niet aangeraakt. Geen RLS- of datamodel-bevinding die actie vereist; `match_chunks_hybrid` (0004) heeft de soft-delete-JOIN correct.

---

## Audit-log (voortgang)

- **Fase A — Recon** ✅ smoke `v0:list` OK · structuur + LOC in kaart · baseline tsc/lint/unit groen.
- **Fase B — Fan-out** ✅ 6 read-only subagents (RAG-kern, chat-route, crawler, server-actions/dashboards, errors/observability, hard-rules-lens) klaar; bevindingen hierboven geconsolideerd.
- **Fase C — Codex-cross-check** ⏳ op fix-diffs vóór elke PR.
- **Fase D — Fix** ⏳ PR1 (dashboard-consistentie) → PR2 (rag.ts opschoning) → PR3 (errors+crawler dead-code).
- **Fase E — Rapport** 🔄 dit document, continu bijgewerkt.

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
