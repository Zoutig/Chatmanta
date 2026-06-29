# V1 — Statusrapport & aangescherpt plan

> **Doel:** één beslissings-bruikbaar overzicht van waar de V1-bouw staat, wat er nog moet, en in welke volgorde — zodat de volgende bouwronde gekozen kan worden zonder het opnieuw uit te zoeken. Read-only opgesteld 2026-06-29; geen code/migratie/PR gewijzigd.
>
> **Autoriteit bij conflict:** Blueprint §1.5 "V1 Minimal Build Scope" > Security Addendum > specifieke sectie. Status-claims citeren bewijs (migratienummer / live-query / PR / `file:regel`), niet geheugen.

## Besliste keuzes 2026-06-29 (Sebastiaan) — leidend boven oudere blueprint-regels

1. **V1 draait op gpt-4o-mini.** Claude Haiku, de provider-abstractie (`callLLM`/`streamLLM` uit de stub) en een automatische OpenAI-fallback → **allemaal V2** (Haiku komt in V2 als backup). **Gevolg:** de RAG-laag van V1 is functioneel compleet; er is **geen LLM-provider-blocker** meer voor V1. De `callLLM`-stub mag in V1 een stub blijven.
2. **Geen automatische fallback in V1** (lijnt met §18, dat dit al naar v2 zette). V1 heeft één provider (OpenAI/gpt-4o-mini), geen fallback-laag.
3. **Telemetrie/billing (mijn keuze, "doe wat best is"):** port `logQuery` naar het V1-pad tijdens de Phase-7-hardening (telemetrie + fundering voor de budget-cap), houd de bestaande `cost_usd`-kolom (geen migratie nodig), voeg `cost_eur` pas toe wanneer EUR-billing echt nodig is (V2-tiering).

> **Doc-updates (2026-06-29, gedaan):** AGENTS.md §Stack V1 + blueprint §1.5 #3 + §18 zijn bijgewerkt naar V1=gpt-4o-mini (Haiku→V2). **Nog open kandidaten:** de handoff/AGENTS-framing "callLLM-mijlpaal = volgende V1-stap" + de stale `docs/handoffs/HANDOFF_2026-06-27_*` (door de 06-29-handoff al als "mag weg" gemarkeerd).

## Bron-lagen & geverifieerde drift

Per laag geverifieerd; de vier lagen lopen niet gelijk — drift expliciet benoemd.

| Laag | Hoe geverifieerd | Stand |
|---|---|---|
| **Repo-code** | `git`, gelezen op branch `feat/seb/v1-status` (afgetakt van `origin/main` = `6461025`) | PR-1a/1b/2/3 + fundament PR-1..4 aanwezig |
| **Live V1-DB** | read-only Supabase MCP tegen **`tfijdnxqdvwzwgxdioqo` = "ChatManta V1-prod"** (NIET V0 `emaoajcjfvnbasbiucpd` = "Zoutig's Project") | migr 0001–0003 toegepast; 14 tabellen, RLS overal |
| **Deploy (Vercel)** | `vercel.json` gelezen; runtime-env niet read-only te checken met toegestane tools | crawler-cron ontbreekt (drift #3) |
| **Git/PR** | `git log`, `gh pr list` | V1-keten #208–#218 gemerged; enige open PR = #207 (devcontainer, niet-V1) |

**Drift die actie/aandacht vraagt:**
1. **Lokale `main` liep 3 commits achter** op `origin/main` (de PR-3-keten #215/#218/#217). Geanalyseerd is `origin/main`; doe `git pull --ff-only` om lokaal bij te komen. *(Niet-blokkerend.)*
2. **`GRAPH_REPORT.md` is stale** — gebouwd uit `79217dc2` (PR-2), mist PR-3. Draai `graphify update .` vóór hergebruik als map.
3. **V1-crawler-cron niet gescheduled.** `app/api/v1/cron/process-crawls/route.ts` bestaat, maar `vercel.json` `crons` heeft alléén twee V0-entries → de V1-job-processor draait op niets (handmatige/externe pinger nodig).
4. **Stale aanname gecorrigeerd:** migratie `0003` is wél een gecommit bestand (`supabase/migrations-v1/0003_v1_website_cache.sql`) **én** toegepast (`list_migrations`); geen repo↔DB-migratiedrift.

---

## Waar V1 nu staat

Status t.o.v. (a) Blueprint §1.5 V1-scope en (b) V0-feature-pariteit. **Scope-oordeel** lost conflicten op: §1.5 (en de keuzes hierboven) winnen.

### Fundament & RAG-kernel — KLAAR

| Component | Status | Bewijs |
|---|---|---|
| 2-Supabase-split (fysieke PII-isolatie) | ✅ klaar | live project "ChatManta V1-prod" `tfijdnxqdvwzwgxdioqo` (`list_projects`); factory `lib/supabase/v1/service-role.ts` leest `V1_*`-env, 0 dep op `@/lib/auth` |
| Auth + multi-tenancy (Supabase Auth, membership, RLS) | ✅ klaar | migr `0001`; **RLS aan op alle 14 tabellen** (`list_tables`); SELECT-policy op elke tenant-tabel + `users` ook UPDATE (`pg_policies`); `handle_new_auth_user()` SECURITY DEFINER trigger; auth e2e 3/3 (PR-4 #211). **Advisory-WARN:** leaked-password-protection (HaveIBeenPwned) staat UIT (`get_advisors`) → hoort bij K5/§1.5 #14 |
| Kernel-graduatie (neutraal, client-geïnjecteerd `lib/rag`) | ✅ klaar | PR-1a #212; CI grep-gate (`lib/rag ⊄ lib/v0` + geen service-role-import) |
| V1-RAG-pad achter auth (retrieval onder RLS) | ✅ klaar | migr `0002`; `match_chunks_with_parents(p_organization_id, p_chatbot_id, …)` **chatbot-scoped + security-invoker** (`prosecdef=false` → draait onder caller-RLS); `askV1` → `runRagQuery(session-client)`, org+chatbot uit getrouwde sessie (`actions.ts:15-58`); e2e 4/4 + isolatie 3/3 (PR-1b #213) |
| Ingest naar V1 (parent+child, org+chatbot-stamped) | ✅ klaar (CLI) | PR-2 #214; `lib/rag/ingest.ts` + `chunker.ts` + `v1:ingest` CLI. **Alleen CLI — geen klant-upload-UI** |
| Website-crawler V1 (Firecrawl, pages-as-documents) | ⚠️ backend+dashboard klaar; **cron niet gescheduled** | migr `0003`; `lib/v1/crawler/*`; dashboard `app/v1/app/kennisbank/*`; route bestaat maar **niet in `vercel.json`** (drift #3); live smoke op example.com geslaagd (PR-3) |
| answer_cache V1 (chatbot-scoped) | ✅ klaar | migr `0003` `answer_cache` **+`chatbot_id`-key**; `lookup_cached_answer(… p_chatbot_id …)`; lezen=session-client, schrijven=geïnjecteerde service-role (`actions.ts:58`) |
| Parent chunks + claim-verificatie + HyDE/decompose | ✅ geërfd-actief | `V1_RAG_DEFAULTS = {...resolveBot(LATEST_BOT_VERSION /* ='v0.10' */), ...V1_OVERRIDES}` (`rag-config.ts:35-38`); `parentDocumentRetrieval:true` (`:23`); claim-verify + HyDE komen uit de eval-bewezen v0.10-config; `parent_chunks`/`document_chunks` = 2 rijen (1 per seed-org = isolatie-bewijs) |

### LLM-laag — V1 = gpt-4o-mini (beslist), provider-werk = V2

| Component | Status | Bewijs |
|---|---|---|
| LLM-provider in V1 | ✅ gpt-4o-mini (bewust, keuze #1) | engine roept `openai().chat.completions.create()` direct aan op ≈4 chat-call-sites (`run-rag-query.ts:121,1863,2234` + `reclassify.ts:71`), config v0.10. **Draait dus al** — geen V1-werk |
| Haiku + provider-abstractie + auto-fallback | ⛔ **V2** (beslist) | `callLLM`/`streamLLM` gooien `'not implemented'` (`llm.ts:103-110`) — mag stub blijven in V1. `MODEL_COSTS` (EUR) + `calculateCost` (`llm.ts:38-56`) liggen dormant klaar |
| query_log-telemetrie in V1 | ❌ niet-gestart (→ Phase 7) | tabel bestaat, 0 rijen geschreven (`list_tables`); geen `logQuery`-port; kolom = `cost_usd`, geen `cost_eur` |

### §1.5-scope nog niet in V1 gebouwd — dit is nu de kritische pad naar de eerste testklant

| §1.5-item | Status | Bewijs / opmerking |
|---|---|---|
| 7 — Widget / publieke embed-laag | ❌ niet-gestart | geen `app/api/v1/chat`, geen `/embed` onder `app/v1`; alleen auth-gated dashboard. **De eerste klant-zichtbare V1-chat** |
| 5 — Document-upload via signed Storage-URL (klant) | ❌ niet-gestart | enkel `v1:ingest` CLI bestaat |
| 8 — Klantdashboard (settings/embed/account) | ⚠️ deels | kennisbank/crawl-beheer bestaat; chatbot-settings, embed-code, account, upload-UI ontbreken |
| 1 + 9 — Invite-only onboarding + Jorion-admin dashboard | ❌ niet-gestart | orgs/chatbots nu via seed-script; geen `/admin/...`-V1-UI |
| 12 — Cost guardrails (rate-limit + 300/mnd hard-block) | ❌ niet-gestart | `askV1`/crawler-actions hebben geen rate-limit (bewust deferred PR-1b #213) |
| 11 — Sentry + UptimeRobot | ❌ niet-gestart | Phase 7 |
| 14 — AVG-basis (DPA, privacy, IP-hashing) | ❌ niet-gestart | pre-klant-gate |

### V0-pariteit: bewust BUITEN V1 (§1.5 → V2) — niet als "gap" behandelen

Hybrid search, contactverzoeken/lead-capture, zichtbare bronnen in widget, Cohere rerank, thumbs-feedback, geautomatiseerde RAG-eval-feature — **allemaal §1.5-V2** (sectie "Expliciet NIET in V1"). Dat V1 ze mist is correcte scope, geen gap. `V1_OVERRIDES.hybridSearch:false` (`rag-config.ts:22`) is dus juist.

> **Pariteit-samenvatting:** de klant-zichtbare RAG-kern (parent chunks, HyDE, claim-verify, answer-cache) draait in V1 op gpt-4o-mini; alleen telemetrie (`query_log`) wordt nog niet geschreven. De ontbrekende V0-features (hybrid, contactverzoeken, zichtbare bronnen) zijn §1.5-V2 — geen V1-werk.

---

## Wat er nog moet

### Korte termijn — tot de eerste begeleide testklant

*(callLLM/Haiku is hier weg — keuze #1 zet het naar V2. De korte termijn is nu de klant-facing §1.5-scope + de gates.)*

| # | Item | Status | Volgende concrete actie |
|---|---|---|---|
| K1 | **Widget publieke laag** (§1.5 #7) | niet-gestart | Vanilla launcher + iframe + HMAC-token (1u) + allowed-domain + rate-limit, op gpt-4o-mini. V0-widget is een te porten precedent. **Zet `sourceLinksEnabled` per-surface uit voor de widget** (nu globaal `true`, `rag-config.ts:31` — zichtbare bronnen in widget is §1.5-V2) |
| K2 | **Klantdashboard + onboarding + doc-upload** (§1.5 #1/#5/#8/#9) | deels | Invite-only onboarding (Jorion-admin) + minimaal klantdashboard (settings/embed/account) + signed-Storage-upload + magic-bytes → bestaande `ingestDocument` |
| K3 | **Cost guardrails + rate-limit** (§1.5 #12) | niet-gestart | Upstash per-org bucket + fail-safe (#174 gebouwd) op `askV1`/widget/crawler; `conversations_per_month:300` hard-block |
| K4 | **`logQuery`-port (telemetrie)** | niet-gestart | Port `logQuery` naar het V1-pad (keuze #3): vult `query_log`, `cost_usd` behouden, geen migratie. Fundering voor de budget-cap |
| K5 | **Pre-klant-gates** | niet-gestart | Supabase Pro + PITR; DPA's + privacyverklaring + sub-verwerkers (§1.5 #14); MX op chatmanta.com (mail-ontvangst, `niels@` bounct nu); **leaked-password-protection aanzetten** (advisory-WARN); IP-hashing |
| K6 | **V1-crawler in prod operationeel** | deels | Cron-schedule toevoegen aan `vercel.json` (drift #3) + `FIRECRAWL_API_KEY`/`CRON_SECRET` op Vercel-V1 |

### Lange termijn — V2 + resterende scope

- **LLM-provider-mijlpaal (verschoven naar V2):** `callLLM`/`streamLLM` implementeren (Anthropic + OpenAI), Haiku als backup, de ≈4 chat-call-sites herbedraden, EUR-billing (`cost_eur` + `MODEL_COSTS`), automatische fallback. + **her-eval** (de pipeline is op gpt-4o-mini getuned — Haiku verschuift kwaliteit/gates).
- **Overige §1.5-V2-features:** hybrid search, lead-capture, zichtbare bronnen in widget, rerank, thumbs-feedback, per-chatbot prompts, tiering.
- **Per-org EUR budget-cap** (budget-geheugen): post-call aggregate op `cost_eur`, hard cap + 80%-warning, fail-open — hangt op de V2 EUR-billing.

---

## Aangescherpt V1-plan

Binnen de bestaande 8-fasenstructuur + de `project_v1_strategy`-ordening. **Hard rules onaangeroerd** (2-Supabase-split, RLS-overal, provider-abstractie als V2-seam, §1.5 Minimal Build Scope).

**Stand in de fasen:** Phase 0–1 (Setup, Auth/Multi-tenancy) = **klaar**. **Phase 4 (RAG-kern) = klaar voor V1** — kernel + retrieval + ingest + crawler + cache draaien op gpt-4o-mini; de Haiku-provider-laag is bewust naar V2. Phase 2/3/5(prod)/6/7/8 = open en vormen nu de kritische pad.

**Aanbevolen volgorde (dependency-bewust):**

1. **Phase 2 + 3 — klant-beheer + document-upload-UI** *(K2).* Invite-only onboarding + minimaal klantdashboard + signed-Storage-upload. Leunt op auth/membership (klaar) + `ingestDocument` (klaar). Zonder dit kan een testklant niet worden opgezet/gevoed.
2. **Phase 6 — Widget publieke laag** *(K1).* Eerste klant-zichtbare chat op gpt-4o-mini. Leunt op een chatbot-config-oppervlak uit #1. **`sourceLinksEnabled` per-surface uit** voor de widget.
3. **Phase 5 prod-wiring — crawler operationeel** *(K6).* Klein: cron in `vercel.json` + env. Geen code-afhankelijkheid; kan zodra de Vercel-env staat.
4. **Phase 7 — hardening** *(K3 + K4 + observability).* Upstash per-org rate-limit + `conversations_per_month:300` + `logQuery`-port (telemetrie) + Sentry/UptimeRobot.
5. **Phase 8 + pre-klant-gates** *(K5).* Supabase Pro/PITR, DPA's + privacy, MX, leaked-password, IP-hashing, één backup-restore-test — afronden vóór echte klantdata.
6. **(V2, niet nu)** — Haiku-backup + `callLLM`/`streamLLM` uit de stub + automatische fallback + EUR-billing + her-eval; daarna de overige §1.5-V2-features.

**Restbeslissing (klein, voor Sebastiaan):** behandelen we de bestaande `query_log` als dé V1-usage-log (zo ja: `cost_eur` erbij wanneer EUR-billing landt), of bouwen we de in blueprint §1.5 #10 / §10-datamodel genoemde aparte `usage_logs`? Mijn voorstel: `query_log` hergebruiken, niet dupliceren.

---

## Nog te verifiëren

Read-only met de toegestane tools niet hard te bevestigen — bewust niet als status gezet:

- **Vercel runtime-env (V1):** of `V1_SEED_ORG_ID`, `FIRECRAWL_API_KEY`, `CRON_SECRET` én `OPENAI_API_KEY` op Vercel-V1 staan. **Conflict:** taak-premisse zegt `V1_SEED_ORG_ID` staat NIET op Vercel (→ "Config-fout"); geheugen `project_v1_strategy` (06-24) zegt het is gezet + geverifieerd. → check Vercel-env-dashboard.
- **MX-records op `chatmanta.com`** (mail-ontvangst, K5) — geheugen zegt ontbreken (06-12). Verifieer met `nslookup -type=MX chatmanta.com`.
- **Supabase Pro/PITR-status** van V1-prod — geheugen zegt gratis-tier; bevestig in dashboard.
- **DPA-status** (juridisch) — niet code-/DB-verifieerbaar.
- **Anthropic model-id `claude-haiku-4-5`** + SDK-vorm — pas relevant bij de V2-mijlpaal; verifieer dan via de `claude-api`-skill.
- **Her-eval op het V1-pad:** V1's retrieval verschilt van V0 (hybrid uit, document-only RPC) maar draait op dezelfde gpt-4o-mini-config; antwoordkwaliteit op het V1-pad is niet apart gemeten. Optioneel/niet-blokkerend zolang V1 op gpt-4o-mini blijft.
- **Crawl-smoke-residu:** `processing_jobs`=1 / `crawl_events`=4 / `firecrawl_credit_log`=4 van de PR-3-smoke, maar `knowledge_sources`=0 en géén gecrawld pagina-document (de 2 `documents` zijn seed: `Manta Demo.txt` org A + `Org B Demo.txt` org B, source `v0_local`). Benigne; niet verder uitgezocht. *(NB: `list_tables` rij-tellingen zijn planner-schattingen — `count(*)` is de waarheid; `documents`=2, niet 0.)*
