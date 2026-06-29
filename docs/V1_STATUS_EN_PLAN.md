# V1 — Statusrapport & aangescherpt plan

> **Doel:** één beslissings-bruikbaar overzicht van waar de V1-bouw staat, wat er nog moet, en in welke volgorde — zodat de volgende bouwronde gekozen kan worden zonder het opnieuw uit te zoeken. Read-only opgesteld 2026-06-29; geen code/migratie/PR gewijzigd.
>
> **Autoriteit bij conflict:** Blueprint §1.5 "V1 Minimal Build Scope" > Security Addendum > specifieke sectie. Status-claims citeren bewijs (migratienummer / live-query / PR / `file:regel`), niet geheugen.

## Bron-lagen & geverifieerde drift

Elke claim is per laag geverifieerd. De vier lagen lopen niet gelijk — drift expliciet benoemd.

| Laag | Hoe geverifieerd | Stand |
|---|---|---|
| **Repo-code** | `git`, gelezen op branch `feat/seb/v1-status` (afgetakt van `origin/main` = `6461025`) | PR-1a/1b/2/3 + fundament PR-1..4 aanwezig |
| **Live V1-DB** | read-only Supabase MCP tegen **`tfijdnxqdvwzwgxdioqo` = "ChatManta V1-prod"** (NIET V0 `emaoajcjfvnbasbiucpd` = "Zoutig's Project") | migr 0001–0003 toegepast; 14 tabellen, RLS overal |
| **Deploy (Vercel)** | `vercel.json` gelezen; runtime-env niet read-only te checken met toegestane tools | crawler-cron ontbreekt (zie drift #3) |
| **Git/PR** | `git log`, `gh pr list` | V1-keten #208–#218 gemerged; enige open PR = #207 (devcontainer, niet-V1) |

**Drift die actie/aandacht vraagt:**
1. **Lokale `main` liep 3 commits achter** op `origin/main` (de hele PR-3-keten #215/#218/#217). Geanalyseerd is `origin/main`; lokale `main` heeft PR-3 nog niet tot er gepulld wordt. *(Niet-blokkerend; branch is van origin afgetakt.)*
2. **`GRAPH_REPORT.md` is stale** — gebouwd uit commit `79217dc2` (PR-2), dus vóór PR-3. De graph mist de V1-crawler/answer_cache. Draai `graphify update .` vóór hij weer als map gebruikt wordt.
3. **V1-crawler-cron niet gescheduled.** `app/api/v1/cron/process-crawls/route.ts` bestaat, maar `vercel.json` `crons` heeft alléén twee V0-entries (`/api/v0/cron/retention`, `/api/v0/cron/faq-snapshot`). De V1-job-processor draait dus op niets → handmatige/externe pinger nodig.
4. **Stale aanname gecorrigeerd:** migratie `0003` is wél een gecommit bestand (`supabase/migrations-v1/0003_v1_website_cache.sql` op origin/main) **én** toegepast op de live DB (`list_migrations`). De "0003 = alleen MCP-applied, geen bestand"-aanname klopt niet meer; geen repo↔DB-migratiedrift.

---

## Waar V1 nu staat

Status t.o.v. (a) Blueprint §1.5 V1-scope en (b) V0-feature-pariteit. **Scope-oordeel** lost conflicten op: §1.5 wint.

### Fundament & RAG-kernel — KLAAR

| Component | Status | Bewijs |
|---|---|---|
| 2-Supabase-split (fysieke PII-isolatie) | ✅ klaar | live project "ChatManta V1-prod" `tfijdnxqdvwzwgxdioqo` (`list_projects`); factory `lib/supabase/v1/service-role.ts` leest `V1_*`-env, 0 dep op `@/lib/auth` |
| Auth + multi-tenancy (Supabase Auth, membership, RLS) | ✅ klaar | migr `0001`; **RLS aan op alle 14 tabellen** (`list_tables`); SELECT-policy op elke tenant-tabel + `users` ook UPDATE (`pg_policies`); `handle_new_auth_user()` SECURITY DEFINER trigger; auth e2e 3/3 (PR-4 #211). **Advisory-WARN:** leaked-password-protection (HaveIBeenPwned) staat UIT op V1-prod (`get_advisors`) → hoort bij K6/§1.5 #14 |
| Kernel-graduatie (neutraal, client-geïnjecteerd `lib/rag`) | ✅ klaar | PR-1a #212; `lib/rag/run-rag-query.ts`; CI grep-gate (`lib/rag ⊄ lib/v0` + geen service-role-import) |
| V1-RAG-pad achter auth (retrieval onder RLS) | ✅ klaar | migr `0002`; `match_chunks_with_parents(p_organization_id, p_chatbot_id, …)` **chatbot-scoped + `security invoker`** (`pg_proc.prosecdef=false` → draait onder caller-RLS = defense-in-depth); `askV1` → `runRagQuery(session-client, …)`, org+chatbot uit getrouwde sessie (`app/v1/app/actions.ts:15-58`); e2e 4/4 + isolatie 3/3 (PR-1b #213) |
| Ingest naar V1 (parent+child, org+chatbot-stamped) | ✅ klaar (CLI) | PR-2 #214; `lib/rag/ingest.ts` `ingestDocument` + `lib/rag/chunker.ts` + `v1:ingest` CLI. **Alleen CLI — geen klant-upload-UI** |
| Website-crawler V1 (Firecrawl, pages-as-documents) | ⚠️ backend+dashboard klaar; **cron niet gescheduled** | migr `0003` (`knowledge_sources`/`processing_jobs`/`crawl_events`/`firecrawl_credit_log`); `lib/v1/crawler/*`; dashboard `app/v1/app/kennisbank/*`; route bestaat maar **niet in `vercel.json`** (drift #3); live smoke op example.com geslaagd (PR-3) |
| answer_cache V1 (chatbot-scoped) | ✅ klaar | migr `0003` `answer_cache` **+`chatbot_id`-key**; `lookup_cached_answer(… p_chatbot_id …)` RPC; lezen=session-client (SELECT-policy), schrijven=geïnjecteerde service-role (`actions.ts:58`) |
| Parent chunks | ✅ klaar | `parentDocumentRetrieval:true` (`rag-config.ts:23`); `parent_chunks`-tabel (2 rijen — 1 per seed-org = isolatie-bewijs) |
| Claim-verificatie + HyDE/decompose | ✅ geërfd-actief | `V1_RAG_DEFAULTS = {...resolveBot(LATEST_BOT_VERSION /* ='v0.10' */), ...V1_OVERRIDES}` (`rag-config.ts:35-38`); alleen hybrid/parent/cache/sourceLinks/generalKnowledge overschreven → claim-verify + HyDE komen uit de eval-bewezen v0.10-config |

### LLM-laag & telemetrie — NIET-GESTART (korte-termijn-blocker)

| Component | Status | Bewijs |
|---|---|---|
| **LLM = Claude Haiku via provider-abstractie** | ❌ niet-gestart | `callLLM`/`streamLLM` **gooien `'not implemented yet'`** (`lib/ai/llm.ts:103-110`). De engine roept `openai().chat.completions.create()` **direct** aan op ≈4 chat-call-sites (`run-rag-query.ts:121,1863,2234` + `reclassify.ts:71`), niet via `callLLM`. **→ V1 draait nú op gpt-4o-mini, niet Haiku.** Embeddings (`embeddings.ts:51`, `text-embedding-3-small`) staan los en blijven OpenAI |
| query_log schrijven (telemetrie) in V1 | ❌ niet-gestart | tabel bestaat, **0 rijen** (`list_tables`); geen `logQuery`-port in het V1-pad |
| EUR-billing (`cost_eur` via `MODEL_COSTS`) | ❌ niet-gestart | `MODEL_COSTS` (EUR) + `calculateCost` bestaan (`llm.ts:38-56`); V1 `query_log` heeft **`cost_usd`**-kolommen (geërfd uit V0-vouw), geen `cost_eur` |

### §1.5-scope nog niet in V1 gebouwd

| §1.5-item | Status | Bewijs |
|---|---|---|
| 7 — Widget / publieke embed-laag | ❌ niet-gestart | geen `app/api/v1/chat`, geen `/embed` onder `app/v1`; alleen auth-gated dashboard |
| 5 — Document-upload via signed Storage-URL (klant) | ❌ niet-gestart | enkel `v1:ingest` CLI bestaat |
| 8 — Klantdashboard (settings/embed/account) | ⚠️ deels | kennisbank/crawl-beheer bestaat; chatbot-settings, embed-code, account-pagina, upload-UI ontbreken |
| 1 + 9 — Invite-only onboarding + Jorion-admin dashboard | ❌ niet-gestart | orgs/chatbots nu via seed-script; geen `/admin/...`-V1-UI |
| 12 — Cost guardrails (spending caps + rate-limit + 300/mnd) | ❌ niet-gestart | `askV1`/crawler-actions hebben **geen rate-limit** (bewust deferred in PR-1b #213) |
| 11 — Sentry + UptimeRobot | ❌ niet-gestart | Phase 7 |
| 14 — AVG-basis (DPA, privacy, IP-hashing) | ❌ niet-gestart | pre-klant-gate |

### V0-pariteit: bewust BUITEN V1 (§1.5 → V2) — niet als "gap" behandelen

| V0-feature | §1.5-oordeel | Bewijs |
|---|---|---|
| Hybrid search (vector+keyword) | **V2** — niet bouwen | §1.5 "Expliciet NIET in V1"; `V1_OVERRIDES.hybridSearch:false` (`rag-config.ts:22`) is dus correct, geen gap |
| Contactverzoeken / lead-capture in widget | **V2** — niet bouwen | §1.5 "Lead capture in widget + `leads` tabel" → V2 |
| Zichtbare bronnen in widget | **V2** | §1.5; `sourceLinksEnabled:true` is een **globale** `V1_RAG_DEFAULTS`-vlag (`rag-config.ts:31`), nu alleen zichtbaar in de dashboard-test-chat. PR-3b flipte 'm false→true (website-docs dragen `source_url`) — keert de PR-1b-noot "MOET false in V1" om. **Actie bij de widget (plan-stap 3): per-surface uitzetten** zodat de widget géén bronnen toont |
| Cohere rerank, thumbs-feedback, automatische RAG-eval-feature | **V2** | §1.5 lijst |

> **Pariteit-samenvatting:** klant-zichtbare kern (parent chunks, HyDE, claim-verify, answer-cache) is in V1 aanwezig; telemetrie (`query_log`) niet. De V0-features die in V1 ontbreken (hybrid, contactverzoeken, zichtbare bronnen) zijn **§1.5-V2** — geen V1-werk.

---

## Wat er nog moet

### Korte termijn — tot eerste begeleide testklant

| # | Item | Status | Volgende concrete actie |
|---|---|---|---|
| K1 | **`callLLM`/`streamLLM` uit de stub + engine rewire** | niet-gestart | Implementeer beide in `lib/ai/llm.ts` (Anthropic + OpenAI) → herbedraad de ≈4 chat-call-sites (of alleen het V1-pad ervan) van `openai()` naar `callLLM`/`streamLLM`. **Niet één-bestand.** |
| K2 | **Modelkeuze-wiring** | beslist op richting, niet op call-niveau | Richting staat vast (Haiku primair, OpenAI fallback). Open: (a) Haiku-overal of mix met gpt-4o-mini voor goedkope helpers (§18 staat **beide** als v1-model toe, maar §1.5 #3 "één default model" gaat bij conflict vóór → een routine-helper-mix is een grijze zone, geen evidente toestemming; kostprijs/kwaliteit-afweging); (b) impl via Vercel AI SDK (blueprint §18) of de al-geïnstalleerde Anthropic SDK; (c) §18-conflict over **automatische** fallback (zie plan). Lees `claude-api`-skill voor de exacte model-id vóór hardcoden |
| K3 | **Her-eval op Haiku** | niet-gestart (billable) | De héle pipeline + v0.10-gates zijn op **gpt-4o-mini** getuned (zie `bots.ts:1038-1047`) → Haiku verschuift kwaliteit/anti-hallucinatie/deterministische gates. Draai hard-eval + prod-gate als eigen validatie-stap (cost-discipline) ná K1/K2 |
| K4 | **`logQuery`-port + `cost_eur` in V1** | niet-gestart | Beslis of dit bij de callLLM-mijlpaal hoort (logisch: EUR-billing hangt eraan). Voeg `cost_eur` toe (migr `0004`) + port `logQuery` naar het V1-pad. Fundering voor K7 budget-cap. **NB:** `MODEL_COSTS` (EUR) heeft nu numeriek identieke waarden aan `MODEL_COSTS_USD` (geen FX-conversie) → bij echte EUR-billing de rates omrekenen, anders klopt het EUR-label niet |
| K5 | Supabase Pro + PITR op V1-prod | niet-gestart | Upgraden vlak vóór echte klantdata (nu gratis-tier). **Read-only niet te bevestigen** |
| K6 | DPA + AVG-basis + auth-advisory | niet-gestart | DPA's afsluiten, privacyverklaring + sub-verwerkers online (§1.5 item 14); zet **leaked-password-protection** aan op V1-prod (nu UIT, `get_advisors`-WARN) |
| K7 | MX op `chatmanta.com` | niet-gestart | Domein heeft geen MX → `niels@chatmanta.com` bounct stil. MX + mailbox/forward bij TransIP. **Read-only niet te bevestigen** (`nslookup -type=MX`) |
| K8 | Rate-limit op `askV1` + crawler-actions | niet-gestart | Upstash-flag bestaat (V0 live); fail-safe gebouwd (#174). Per-org bucket + fail-open + alarm aanzetten op de V1-routes (§1.5 item 12) |
| K9 | V1-crawler in prod operationeel | deels | Cron-schedule toevoegen aan `vercel.json` (drift #3) + `FIRECRAWL_API_KEY`/`CRON_SECRET` op Vercel-V1. **Env read-only niet te bevestigen** |

### Lange termijn — volledige V1-scope (§1.5) richting go-live

- **Widget publieke laag (§1.5 #7):** vanilla launcher + iframe + HMAC-token (1u) + allowed-domain + rate-limit — de eerste klant-zichtbare V1-chat. Hangt af van K1 (Haiku) + een chatbot-config-oppervlak.
- **Document-pipeline klant-kant (§1.5 #5):** signed Supabase-Storage-upload + magic-bytes-check → bestaande `ingestDocument`.
- **Klantdashboard compleet (§1.5 #8):** chatbot-settings, embed-code, account.
- **Jorion-admin + invite-only onboarding (§1.5 #1, #9):** orgs-tabel, deep-dive, jobs+retry, audit-log; `/admin/organizations/new`.
- **Cost guardrails compleet (§1.5 #12 + budget-geheugen):** per-org EUR dag-budget (post-call aggregate op `cost_eur`, hard cap + 80%-warning, fail-open) + `conversations_per_month:300` hard-block. Hangt af van K4.
- **Observability (§1.5 #11):** Sentry + UptimeRobot met basis-redactie.
- **AVG/ops-afronding (§1.5 #14, Phase 8):** IP-hashing, handmatige delete/export via admin, één pre-launch backup-restore-test.

---

## Aangescherpt V1-plan

Binnen de bestaande 8-fasenstructuur + de `project_v1_strategy`-ordening. "Aanscherpen" = her-sequencen + volgende-stap scherpstellen + bronconflicten markeren. **Hard rules onaangeroerd** (2-Supabase-split, RLS-overal, `callLLM`-provider-abstractie, §1.5 Minimal Build Scope).

**Stand in de fasen:** Phase 0–1 (Setup, Auth/Multi-tenancy) = **klaar** (fundament PR-1..4). Phase 4 (RAG-kern) = **grotendeels klaar** (kernel + retrieval + ingest + crawler + cache via PR-1a/1b/2/3) — **op de LLM-provider na**. Phase 2/3/5(prod)/6/7/8 = open.

**Aanbevolen volgorde (dependency-bewust):**

1. **Maak Phase 4 af — de callLLM-mijlpaal** *(K1→K2→K3, + K4 als sub-bundle).* Dit is de natuurlijke volgende stap: niets blokkeert het, en alles erna (widget, budget-cap) leunt op een werkende Haiku-laag + EUR-telemetrie. Scope raakt engine + eval + billing → **big-ship**-kaliber. Begin met `superpowers:brainstorming` over de drie open keuzes in K2.
2. **Phase 2 + 3 — klant-beheer + document-upload-UI** *(§1.5 #1, #5, #8, #9).* Invite-only onboarding + minimaal klantdashboard + signed-Storage-upload. Leunt op auth/membership (klaar) + `ingestDocument` (klaar).
3. **Phase 6 — Widget publieke laag** *(§1.5 #7).* Eerste klant-zichtbare chat. Leunt op #1 (Haiku) + een chatbot-config-oppervlak uit #2. V0-widget is een te porten precedent (HMAC-token, origin-lock). **Actie:** `sourceLinksEnabled` per-surface uitzetten voor de widget (nu globaal `true`) — zichtbare bronnen in de widget is §1.5-V2.
4. **Phase 5 prod-wiring — crawler operationeel** *(K9).* Klein: cron in `vercel.json` + env. Kan zodra de Vercel-env staat; geen code-afhankelijkheid.
5. **Phase 7 — hardening** *(K8 + budget-cap + observability).* Per-org EUR-budget (hangt op K4) + Upstash per-org + Sentry/UptimeRobot + 300/mnd-cap.
6. **Phase 8 + pre-klant-gates** *(K5, K6, K7).* Supabase Pro/PITR, DPA's + privacy, MX, IP-hashing, backup-restore-test — afronden vóór de eerste echte klantdata.

**Bronconflicten — beslissing voor Sebastiaan (niet door mij gewijzigd):**
- **Automatische OpenAI-fallback in V1?** §1.5 #3 + AGENTS.md zeggen "OpenAI = technische fallback in `callLLM`"; **§18 zegt expliciet "Geen automatische OpenAI-fallback in v1"** (auto-retry pas V2; v1 = log + fallback-tekst tonen). Raakt K1/K2 direct. → keuze nodig.
- **`query_log` (gebouwd) vs `usage_logs` (§1.5 #10 + §10-datamodel noemen `usage_logs`; §18 noemt `cost_eur`).** Behandelen we `query_log` als dé V1-usage-log (+ `cost_eur` toevoegen), of een aparte `usage_logs`? Raakt K4.
- **"Geautomatiseerde RAG-evaluatie = V2" (§1.5) vs "her-eval" (K3).** Geen echt conflict: her-eval is een interne éénmalige validatie-stap met de bestaande pipeline, géén klant-zichtbare eval-feature. Genoteerd zodat het niet als scope-schending leest.

---

## Nog te verifiëren

Read-only met de toegestane tools niet hard te bevestigen — bewust niet als status in de tabellen gezet:

- **Vercel runtime-env (V1):** of `V1_SEED_ORG_ID`, `FIRECRAWL_API_KEY`, `CRON_SECRET` op Vercel-V1 staan. **Conflict:** taak-premisse zegt `V1_SEED_ORG_ID` staat NIET op Vercel (→ "Config-fout" op `/v1/app`); geheugen `project_v1_strategy` (06-24) zegt het is gezet + geverifieerd (`/v1/app` rendert live). → check Vercel-env-dashboard.
- **MX-records op `chatmanta.com`** (mail-ontvangst, K7) — geheugen zegt ontbreken (06-12). Verifieer met `nslookup -type=MX chatmanta.com`.
- **Supabase Pro/PITR-status** van V1-prod — geheugen zegt gratis-tier; bevestig in Supabase-dashboard.
- **DPA-status** (juridisch) — niet code-/DB-verifieerbaar.
- **Exacte geërfde HyDE-flag** uit de v0.10→v0.9.3-keten — afgeleid (V1 overschrijft 'm niet), niet veld-voor-veld nagelopen; bevestig in `lib/v0/server/bots.ts` als de precieze flag ertoe doet.
- **Anthropic model-id `claude-haiku-4-5`** + SDK-vorm — verifieer via de `claude-api`-skill bij de bouw van K1, niet hardcoden uit aanname.
- **Crawl-smoke-residu:** `processing_jobs`=1 / `crawl_events`=4 / `firecrawl_credit_log`=4 staan er van de PR-3-smoke, maar `knowledge_sources`=0 en er is géén gecrawld pagina-document (de 2 `documents` zijn seed: `Manta Demo.txt` org A + `Org B Demo.txt` org B, source `v0_local`, status ready). De smoke liet job/event/credit-rijen achter zonder een `knowledge_source`/pagina te persisteren — benigne, niet verder uitgezocht. *(Correctie t.o.v. een eerdere `list_tables`-schatting: `documents`=2, niet 0 — `list_tables` rij-tellingen zijn planner-schattingen; `count(*)` is de waarheid.)*
