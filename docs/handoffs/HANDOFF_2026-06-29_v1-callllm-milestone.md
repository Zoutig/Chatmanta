# Handoff — V1 volgende mijlpaal: callLLM/streamLLM uit de stub + modelkeuze + her-eval — 2026-06-29

> **⚠️ SUPERSEDED 2026-06-29 (later besluit, zelfde dag).** De "volgende mijlpaal = callLLM/streamLLM uit de stub + Haiku + her-eval" hieronder is ACHTERHAALD. Sebastiaan besliste: **V1 blijft op `gpt-4o-mini`; Claude Haiku + de `callLLM`-provider-abstractie + automatische fallback → V2.** De callLLM-stub is dus GÉÉN V1-blocker meer — de V1-RAG-laag is functioneel compleet. De nieuwe V1-kritische-pad is klant-facing: widget → klantdashboard/onboarding/doc-upload → crawler-cron → Phase-7-hardening → pre-klant-gates. **Autoritatieve status + plan: `docs/V1_STATUS_EN_PLAN.md`** (branch `feat/seb/v1-status`). Het "✅ Done"-blok (PR-3 gemerged) + de dead-ends/gotchas hieronder kloppen nog als historie.

## ⚡ Resume in 30 seconds
> Paste in een verse sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta` (hoofd-repo):
> **"Lees `docs/handoffs/HANDOFF_2026-06-29_v1-callllm-milestone.md` en ga verder waar ik gebleven ben."**

- **Branch:** `main` · **Worktree:** hoofd-repo (PR-3-worktree is opgeruimd)
- **State:** **Vorige mijlpaal (kernel-graduatie + V1-RAG) is KLAAR + gemerged** (PR-3 = 3a #215 + 3b #218 + 3c #217 op `main`). Niets half-af. **Lokale `main` loopt 3 commits achter op origin → eerst `git pull --ff-only`.**
- **NEXT ACTION:** start de **brainstorm voor de callLLM-mijlpaal** (`superpowers:brainstorming`). Dit is GEEN simpele stub-invul-taak — zie §Goal + de dead-end over "engine roept OpenAI direct aan". Vraag Seb eerst de worktree-locatie + de modelstrategie-keuze (zie open vragen).

## 🎯 Goal
**Deze sessie:** de kernel-graduatie + V1-RAG-mijlpaal afmaken = **PR-3 (volledige website-crawler + answer_cache → V1)**. ✅ Gedaan + gemerged + opgeruimd.

**Volgende mijlpaal (waarvoor deze handoff is):** `callLLM`/`streamLLM` uit de stub halen + de V1-modelstrategie kiezen + her-evalueren. Het Bouwplan/AGENTS.md noemt dit "Fase 4": **Anthropic Claude Haiku 4.5 als primair model, OpenAI als technische (niet-klant-zichtbare) fallback**, via de provider-abstractie in `lib/ai/llm.ts`, met **EUR-billing via `MODEL_COSTS`** (`query_log`/`usage_logs.cost_eur`).

⚠️ **Dit is groter dan "de stub implementeren".** De gegradueerde engine (`lib/rag/run-rag-query.ts`) roept op dit moment **OpenAI rechtstreeks** aan (gpt-4o-mini) voor álle LLM-stappen (preprocess, rewrite, HyDE, decompose, hoofd-antwoord, followups, rerank, claim-verify) — NIET via `callLLM`. De mijlpaal = (a) `callLLM`/`streamLLM` echt implementeren (Anthropic + OpenAI), (b) **beslissen** welke V1-LLM-calls naar Claude Haiku gaan (alles? of alleen generatie, goedkope helpers op gpt-4o-mini?), (c) de V1-engine-pad daarop bedraden, (d) **her-evalueren** — de hele RAG is op gpt-4o-mini getuned, dus Haiku verandert antwoordkwaliteit/anti-hallucinatie/de deterministische gates. Embeddings blijven OpenAI (`text-embedding-3-small`), die staan los van callLLM.

## ✅ Done (deze sessie — alles op `main`)
- **PR-3a #215 (`2cd3a45`)** — migratie `0003_v1_website_cache` op V1-prod (knowledge_sources, processing_jobs, crawl_events, firecrawl_credit_log, answer_cache **+chatbot_id-key**; documents +knowledge_source_id/+included; `match_chunks_with_parents` drop+recreate met source_url + included-filter). Cache-write via **service-role** (session-client mag niet onder RLS). cacheEnabled aan.
- **PR-3b #218 (`1860033`)** — crawler-backend, **pages-as-documents** (gecrawlde pagina = `documents`-rij; geen `website_pages`-tabel). `lib/v1/crawler/*` (firecrawl/SSRF/host verbatim V0-port; processJobs/processCrawl/crawlEvents/credit-log DI+chatbot, atomische claim behouden), member-scoped actions (SA-1 per-rij `.eq(org).eq(chatbot)`), `app/api/v1/cron/process-crawls` (CRON_SECRET), sourceLinksEnabled aan. (#218 verving #216, dat GitHub auto-sloot — zie dead-ends.)
- **PR-3c #217 (`6461025`)** — member-scoped Kennisbank-crawler-dashboard `app/v1/app/kennisbank/` (discover→kies→crawl→beheer), functioneel/minimaal (inline styles, geen V0 klant.css-chrome).
- **Live end-to-end smoke geslaagd** (login als seed-member → discover via echte Firecrawl → crawl example.com → ingest → "1 actief", page "Example Domain"; test-data opgeruimd).
- Geheugen bijgewerkt: [[project_v1_strategy]] (PR-3-blok), [[squash_merge_workflow]] (stacked-PR-lessen), MEMORY.md-index.

## 🚧 Where I left off (de live thread)
- **Niets half-af.** De mijlpaal is compleet, gemerged, en opgeruimd (worktree weg, branches weg, dev-server gestopt, geheugen bij). Dit is een **schone mijlpaal-grens**.
- De enige "live thread" is dus: **de volgende mijlpaal (callLLM) is geïdentificeerd maar nog niet gebrainstormd/gepland.** Geen code begonnen.

## ▶️ Next steps (ordered)
1. **`git pull --ff-only`** in de hoofd-repo (lokale main loopt 3 commits achter; ik heb bewust niet auto-gepulld).
2. **Brainstorm de callLLM-mijlpaal** (`superpowers:brainstorming`). Centrale ontwerpvragen: (a) modelstrategie — Haiku 4.5 voor álle V1-calls, of een mix (generatie op Haiku, goedkope helpers preprocess/rewrite/decompose op gpt-4o-mini)? (b) hoe integreert `callLLM`/`streamLLM` met de engine die nu een OpenAI-singleton + directe `chatComplete`/streaming heeft — vervang je de directe calls door `callLLM`, of alleen het V1-pad? (c) fallback-logica (Anthropic faalt → OpenAI, niet-klant-zichtbaar); (d) EUR-billing: V1 moet `cost_eur` loggen via `MODEL_COSTS` (V0 blijft `cost_usd` via `MODEL_COSTS_USD`) — maar `query_log` in V1 (migratie 0002) heeft `cost_usd`-kolommen + wordt **nog niet geschreven** (geen `logQuery`-port); dat hoort mogelijk bij deze mijlpaal.
3. **Recon eerst** (de waarde zit in de feiten): grep alle LLM-call-sites in `lib/rag/run-rag-query.ts` (de `openai()`-singleton + elke `chat`/`embed`-aanroep), bekijk `lib/ai/llm.ts` (de stub + de bestaande `MODEL_COSTS`/`calculateCost`), en de Anthropic SDK (staat al in `package.json`, in V0 ongebruikt). Lees `claude-api`-skill voor de actuele Anthropic-model-id's + SDK-vorm.
4. **Her-eval is een eigen sub-stap** (billable): na het bedraden moet de V1-antwoordkwaliteit op Haiku gemeten worden via de eval-pipeline (zie [[project_prod_gate_eval]], [[eval_hard_dimension_cheap_strategy]]). Reken op cost-discipline (zie [[feedback_eval_cost_discipline]]).
5. Bekende ritmiek: spec → `writing-plans` → bouw → 2-lens review (`chatmanta-reviewer` + `/code-review`) → PR → **stop voor Seb's merge-sign-off** (merge = expliciete autorisatie vereist, zie dead-ends). Big-ship of ship-feature afhankelijk van scope (raakt engine + eval + cost → waarschijnlijk big-ship).

## 🧠 Decisions & rationale
- **PR-3 = pages-as-documents** (gecrawlde pagina = documents-rij, geen website_pages-tabel): hergebruikt `ingestDocument` + de bestaande document-only RPC; minste schema-chirurgie; past V1's parent-design. Seb koos dit + "volledige crawler" (incl. dashboard) in de big-ship-elicitatie. Volledig detail: [[project_v1_strategy]] (PR-3-blok) + `docs/superpowers/specs/2026-06-27-v1-pr3-crawler-cache-design.md` (op main na pull).
- **answer_cache-write via een geïnjecteerde service-role client** (niet de session-client): de RLS SELECT-only policy zou een session-client-write stil laten falen → cacheEnabled werd anders een dode no-op. `chatbot_id` conditioneel op `chatbotScoped` → V0 onaangeraakt.
- **callLLM-mijlpaal: nog GEEN beslissingen genomen** — modelstrategie + wiring + eval zijn open (zie next steps). AGENTS.md geeft de richting (Haiku primair + OpenAI fallback) maar niet de call-voor-call-keuze.

## ⚠️ Dead-ends & gotchas (don't repeat)
- **De engine roept OpenAI DIRECT aan, niet via callLLM** — `lib/rag/run-rag-query.ts` heeft een `openai()`-singleton + directe chat/embed-calls (geport uit V0). "callLLM uit de stub" betekent dus óók: die call-sites (of het V1-pad ervan) omleiden. Onderschat dit niet als een 1-file-taak.
- **Stacked PR's + squash-merge = pijn.** Bij PR-3 sloot `gh pr merge 215 --delete-branch` automatisch de volgende gestackte PR (#216, base=de verwijderde branch) i.p.v. 'm te retargeten, en een gesloten-PR-met-verwijderde-base kun je niet reopenen → ik maakte #218 vers. Bovendien gaf de child-branch een merge-conflict (originele 3a-commits ≠ de squash op main) → rebase elke child `--onto origin/main <oude-parent-tip>` vóór merge. Volledig recept: [[squash_merge_workflow]]. **Advies voor de volgende mijlpaal: bouw NIET als gestackte sub-PR's** tenzij echt nodig; één PR (of sequentieel mergen+rebasen per stuk) is simpeler.
- **`gh pr merge` vanuit een worktree faalt** met "main is already used by worktree" (lokale post-merge-checkout van main) — maar de server-side merge SLAAGT; verifieer met `gh pr view <n> --json state`. Of merge vanuit de hoofd-repo.
- **Merge naar main wordt door de auto-mode-classifier geblokkeerd** tot Seb een SPECIFIEke autorisatie geeft ("merge PR #x naar main"); een algemene "doe alles autonoom" telt niet.
- **Playwright MCP lockt de worktree-map** → `git worktree remove` de-registreert wel maar laat de dir achter (locked tot sessie-einde). Zie de leftover-dir in de snapshot. Benign.
- **De eval-pipeline is op gpt-4o-mini getuned** — Haiku-overstap kan de hard-eval/prod-gate-uitslagen verschuiven; behandel her-eval als een eigen, billable validatie-stap (niet "even draaien").

## ❓ Open questions / waiting on Sebastiaan
- **Modelstrategie:** Haiku 4.5 voor alle V1-LLM-calls, of een mix (dure generatie op Haiku, goedkope helpers op gpt-4o-mini)? Kostprijs-impact + kwaliteit afwegen.
- **Scope/aanpak:** big-ship (raakt engine + eval + billing) of ship-feature? Worktree zichtbaar vs verstopt?
- **Hoort de `logQuery`-port (query_log schrijven in V1, nu leeg) + EUR-cost-billing bij deze mijlpaal of een aparte?**
- **Pre-klant-gates (deferred, niet-blokkerend voor de callLLM-mijlpaal maar wél vóór de eerste echte klant):** Supabase Pro + PITR, DPA, MX-records op chatmanta.com (mail-ontvangst — zie [[resend_email_config]]), V1 rate-limit/Upstash op `askV1` + crawler-actions, en de V1-crawler in prod (`FIRECRAWL_API_KEY` + `CRON_SECRET` op Vercel-V1 + externe pinger op `/api/v1/cron/process-crawls`).

## 🗂️ Git & environment snapshot
- Behind origin/main: **3** commits (de PR-3-merges) → `git pull --ff-only`.
- Uncommitted: alleen pre-bestaande untracked (`.agents/`, `.claude/skills/`, `db-schema-map.*`, `rag-pipeline.*`, `docs/handoffs/`, `skills-lock.json`) — niet van het werk.
- Local-only (unpushed) commits: **geen** (alles gemerged).
- Open PRs: **#207** devcontainer (niet-gerelateerd).
- Background tasks still running: **geen** (alle workflows/agents klaar; dev-server gestopt).
- Dev server: **niet draaiend** (poort 3000/3001/3002 vrij).
- ⚠️ Leftover dir `..\chatmanta-v1-pr3` (de PR-3-worktree) is van git ge-de-registreerd maar de map is **locked door de Playwright MCP** → ruimt zichzelf op bij sessie-einde, of `Remove-Item -Recurse -Force ..\chatmanta-v1-pr3` ná deze sessie.
- ⚠️ Stale handoff `docs/handoffs/HANDOFF_2026-06-27_v1-pr3-crawler-cache.md` is achterhaald (PR-3 is af) — mag weg.

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout main; git pull --ff-only        # haal de 3 PR-3-commits op
# .env.local heeft al de V0_/V1_/V1_SEED_-vars (incl. FIRECRAWL_API_KEY + CRON_SECRET lokaal)
# nieuwe worktree voor de callLLM-mijlpaal (vraag Seb zichtbaar vs verstopt):
#   git worktree add -b feat/seb/v1-callllm ..\chatmanta-callllm ; cd ..\chatmanta-callllm ; npm ci ; Copy-Item ..\chatmanta\.env.local .\.env.local
# dev: npx next dev -p 3001
```

## 📎 Context pointers
- **Geheugen:** [[project_v1_strategy]] (lees het hele V1-verhaal + het PR-3-blok onderaan) · MEMORY.md · [[squash_merge_workflow]] (stacked-PR-lessen) · [[project_prod_gate_eval]] + [[eval_hard_dimension_cheap_strategy]] + [[feedback_eval_cost_discipline]] (her-eval) · [[v1_rate_limit_hardening]] + [[project_budget_limits_v1_v2]] + [[resend_email_config]] (pre-klant-gates) · [[codex_mcp_model_chatgpt_account.md]] (Codex-review model=gpt-5.5).
- **De focal file:** `lib/ai/llm.ts` — `callLLM`/`streamLLM` gooien nu `'not implemented'`; `MODEL_COSTS` (EUR) + `calculateCost` + `MODEL_COSTS_USD` (V0) bestaan al; types `LLMProvider`/`CallLLMOptions`/`LLMUsage` gedefinieerd. Anthropic SDK staat in `package.json` (V0 ongebruikt).
- **De engine om te bedraden:** `lib/rag/run-rag-query.ts` (`openai()`-singleton + alle chat/embed-call-sites) + de V1-glue `app/v1/app/{rag-config,actions}.ts` + `app/v1/app/kennisbank/actions.ts`.
- **Richtlijn:** AGENTS.md §Stack "V1 (gepland — Phase 4)" (Anthropic primair, OpenAI fallback, MODEL_COSTS EUR-billing) + de blueprint §18 (provider-abstractie). Lees de `claude-api`-skill voor actuele model-id's vóór je modellen hardcodet.
- **Specs/plannen:** `docs/superpowers/specs/` (de V1-spec-reeks) + de PR-3-spec `2026-06-27-v1-pr3-crawler-cache-design.md` (na pull op main).
```
