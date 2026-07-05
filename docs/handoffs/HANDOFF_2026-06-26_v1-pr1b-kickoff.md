# Handoff — V1 kernel-graduatie: PR-1a klaar → PR-1b kickoff — 2026-06-26

> **⚠️ ACHTERHAALD (historie).** Alle V1-werk t/m PR-3 is gemerged. Actuele status + plan: **`docs/V1_STATUS_EN_PLAN.md`**. NB: V1 draait op `gpt-4o-mini`; Haiku/`callLLM` is V2.

## ⚡ Resume in 30 seconds
> Paste in a fresh session, vanuit `C:\Users\solys\Documents\Code\chatmanta` (hoofd-repo, ná de session-limit-reset ~20:30 Adam):
> **"Lees `docs/handoffs/HANDOFF_2026-06-26_v1-pr1b-kickoff.md` en ga verder waar ik gebleven ben."**

- **Branch:** `main` @ `54a99b6` · **Worktree:** hoofd-repo (de PR-1a-worktree is verwijderd)
- **State:** **PR-1a GEMERGED + live** (#212). PR-1b nog NIET begonnen — het *ontwerp* staat in de spec, maar er is nog géén implementatie-PLAN (zoals PR-1a er een had).
- **NEXT ACTION:** verse worktree van `main` → schrijf het **PR-1b-implementatieplan** (`superpowers:writing-plans`) op basis van de spec → bouw subagent-gedreven. (Eerst even Seb: worktree zichtbaar vs verstopt.)

## 🎯 Goal
De mijlpaal **kernel-graduatie + V1-RAG-pad achter auth**, scope **C = volledige RAG-pariteit**, als **big-ship in 3 PR's** (1a graduatie · 1b V1-pad · 2 ingest · 3 crawler+cache — 1 is gesplitst in 1a/1b). Deze sessie: PR-1a (de refactor) ontworpen, gepland, gebouwd, gemerged.

## ✅ Done (deze sessie)
- **Brainstorm + scope-besluit** met Seb (beginner-niveau uitgelegd): scope **C**, big-ship, PR-1 gesplitst in 1a/1b.
- **Spec** `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` (hele mijlpaal-ontwerp, incl. PR-1b/2/3) — op main.
- **Plan** `docs/superpowers/plans/2026-06-25-v1-pr1a-kernel-graduatie.md` (PR-1a) — op main.
- **PR-1a GEMERGED** — #212, squash `54a99b6`, live op prod (`/login` + `/v1/login` → 200). Engine → neutraal client-geïnjecteerd `lib/rag/run-rag-query.ts`; `lib/v0/server/rag.ts` = dunne V0-adapter; 5 callers ongewijzigd; V0-gedrag bewezen identiek; V0-DB onaangeraakt. Pure helpers + types → `lib/rag/`; grep-gate dwingt neutraliteit af (CI via `test:unit`).
- Geverifieerd: typecheck + **81 unit-tests** + clean build + org-isolatie-smoke + `chatmanta-reviewer` (JA, hunk-voor-hunk).
- Opgeruimd: worktree `../chatmanta-v1-kernel` + branch weg; main ge-ff; geheugen bijgewerkt ([[project_v1_strategy]]); graphify ge-update.

## 🚧 Where I left off (de live thread)
- PR-1a is **af en gemerged** — geen halve code openstaand.
- De live thread = **PR-1b is het volgende werk en heeft nog geen implementatieplan.** Het *ontwerp* van PR-1b ligt vast in de spec (§4 PR-1, §5 beveiliging, §6 org/chatbot-resolutie, §7 PR-1b). Een fresh session moet dat ontwerp omzetten naar een stap-voor-stap **plan** (TDD, bite-sized) en dan bouwen — exact zoals PR-1a's plan dat deed.

## ▶️ Next steps (ordered)
1. **Wacht op de session-limit-reset (~20:30 Amsterdam)** — PR-1b is subagent-zwaar (MCP-migratie, seed, e2e, reviews); nu starten loopt meteen weer vast.
2. **Verse worktree van bijgewerkte `main`:** vraag Seb zichtbaar (`../chatmanta-v1-pr1b`) vs verstopt (`.claude/worktrees/`); dan `git worktree add -b feat/seb/v1-pr1b <pad>` + `EnterWorktree path:` + `npm ci` + kopieer `.env.local`.
3. **Schrijf het PR-1b-implementatieplan** (`superpowers:writing-plans`) uit de spec. Het ontwerp is beslist; het plan moet concreet worden. Onderdelen (zie spec §4 PR-1 + §7):
   - **V1-migratie `0002_v1_rag_core.sql`** in `supabase/migrations-v1/`: `chatbots` (org-FK, één-per-org) + `documents` + `document_chunks`(vector(1536), HNSW) + `parent_chunks` + `query_log` (+`chatbot_id`) + match-RPC `match_chunks_with_parents` **document-only variant** (drop de `website_pages`-JOIN + `source_url/title`; voeg `p_chatbot_id` + `c.chatbot_id = p_chatbot_id` toe; `security invoker`). **RLS in dezelfde migratie + `org_id NOT NULL` + `chatbot_id NOT NULL`**; SELECT-policies = het V1-`0001`-patroon (`organizations_select_own`). pgvector-extensie aan in V1 vóór `document_chunks`. **Toepassen via Supabase MCP `apply_migration`** (pooler-block vanaf dev-machine) op het BESTAANDE V1-project (ref `tfijdnxqdvwzwgxdioqo`).
   - **Seed-script** (`scripts/v1-seed-chunks.*`) via `getV1ServiceRoleClient()`: 1 chatbot + een handvol echte chunks (+parents) voor de seed-org (`V1_SEED_ORG_ID=08ed675f-1870-4352-94e0-768e69f6f127`).
   - **`/v1/app` echte RAG:** resolveer org (uit membership; voorlopig `V1_SEED_ORG_ID`) + die org's chatbot; draai `runRagQuery(<session-client>, { organizationId, chatbotId, config:{...,chatbotScoped:true}, persona, disableCache:true })` onder **RLS** (verdediging-in-de-diepte: lezen via session-client; systeem-writes via V1-service-role). Geen chatbot-rij → nette "geen chatbot geconfigureerd"-fail (geen lege chatbotId).
   - **Playwright e2e** (project `v1`): lid → gegrond antwoord uit eigen chunks; niet-lid → geweigerd; cross-org-isolatie.
4. **Bouw subagent-gedreven** (zie gotchas: implementers FOREGROUND), dan full gate + `chatmanta-reviewer` + (na reset) `/code-review` → PR-1b → merge na Seb's go.
5. *(Optioneel, los)* de afgebroken PR-1a `/code-review` afmaken als post-merge confidence-check: `Workflow({scriptPath:"…/code-review-pr1a-wf_7be4b8f7-349.js", resumeFromRunId:"wf_7be4b8f7-349"})` — cached angles komen terug, alleen de 4 gecutte finders + verifiers draaien opnieuw.

## 🧠 Decisions & rationale
- **Scope C (niet A)** — Seb koos bewust de volledige functieset; uitgevoerd als big-ship in 3 los-reviewbare PR's (minimaal-eerst PER PR) i.p.v. één onreviewbare brok op echte data.
- **PR-1 gesplitst in 1a (V0-only refactor) + 1b (V1-pad)** — twee subsystemen; de refactor landt + is bewezen vóór er V1-data-structuren bij komen.
- **`chatbotId` zonder V0-migratie** via een `chatbotScoped`-vlag op `RagConfig`: RPC krijgt `p_chatbot_id` alléén bij `true` (V1); V0 draait `false` → V0-DB onaangeraakt. Verworpen: V0-RPC's een genegeerde param geven (V0-churn) en per-wereld retrieval-injectie (te grote refactor).
- **Verdediging-in-de-diepte:** lezen via session-client onder RLS (DB dwingt muren af) + expliciete org/chatbot; systeem-writes (seed/ingest/log) via V1-service-role. Harde regels SA-1/SA-5 + RLS-overal.
- **chatbots = echte tabel, één-per-org-automatisch** — nette structuur voor de isolatie-regel, simpel in gebruik nu.
- **Volledige generator met `disableCache:true`; minimale 0002** (geen `answer_cache`/`website_pages` — die zijn PR-3) → kleinste veilige migratie-oppervlak.

## ⚠️ Dead-ends & gotchas (don't repeat)
- **Async named review-subagents zijn onbetrouwbaar** — ze gingen idle zónder hun verdict te relayen (alleen idle-notificaties). → Dispatch implementers/reviewers **FOREGROUND** (geen `name`) voor synchroon resultaat; of doe de review zelf als controller.
- **Behavior-gate ≠ hard-eval-diff** — de hard-eval-antwoorden variëren per run (LLM-sampling) + zijn billable. Gebruik de **deterministische gate**: typecheck + `npm run test:unit` (81) + clean build + `npm run v0:test-org-isolation` (echte TS-pipeline, `--conditions=react-server`-pad).
- **`v0:chat` is de `.mjs`-DUPLICAAT, NIET de TS-pipeline** — gebruikeloos als smoke voor `lib/rag/`-werk. Voor de echte pipeline: `v0:test-org-isolation` of `eval:hard:run`.
- **`v0:test-org-isolation` scenario-2 is een bekende FALSE-POSITIVE** — de FysioPlus-bot weigert correct maar echoot "EPDM"/"bitumen" uit de VRAAG → de crude `forbidContains`-string-check vlagt dat als "leak". Geen datalek (het test-commentaar erkent dit zelf). 2/3 "pass" + de aard van de fail = isolatie intact.
- **Session-limit** reset ~20:30 Amsterdam; de PR-1a `/code-review`-workflow brak hierdoor af (3 correctness-angles + verifiers gecut; surviving angles 0 bugs).
- **Worktree** heeft eigen `npm ci` + handmatige `.env.local`-kopie nodig (Turbopack/tsx); LF→CRLF git-warnings zijn benign.
- **PR-1b forward-notes** (uit de review): PR-1b's V1-match-RPC MOET `p_chatbot_id` definiëren (anders 404 zodra chatbotScoped:true draait — dat is exact wat 0002 levert); **PR-3-landmijn**: `answer_cache` is op `(org, bot_version)` gekeyd, niet `chatbot_id` → bij V1-port `chatbot_id` aan de key (vastgelegd in spec §4 PR-3 item 9).

## ❓ Open questions / waiting on Sebastiaan
- **Worktree-locatie** voor PR-1b: zichtbaar (`Documents/Code/`) vs verstopt (`.claude/worktrees/`) — vraag vóór aanmaken (conventie).
- **MCP-migratie op V1-prod:** PR-1b past DDL toe op het BESTAANDE V1-project (ref `tfijdnxqdvwzwgxdioqo`, leeg, gratis tier) via `apply_migration`. Real-resource write — even melden vóór toepassen (geen nieuw project, dus lichter dan §3, maar wél de echte V1-DB).
- **Optioneel:** wil Seb de afgebroken PR-1a `/code-review` ná de reset alsnog afmaken (post-merge confidence)?

## 🗂️ Git & environment snapshot
- Behind origin/main: **0**
- Uncommitted: alleen pre-bestaande untracked (`.agents/`, `.claude/skills/`, `rag-pipeline.{drawio,png,svg,...}`, `skills-lock.json`) — NIET van deze sessie.
- Local-only (unpushed) commits: **geen** (alles gemerged).
- Open PRs: **#207** devcontainer (niet gerelateerd).
- Background tasks still running: **geen** (graphify klaar exit 0; de `/code-review`-workflow is afgebroken/abandoned — resumebaar via runId `wf_7be4b8f7-349`).
- Dev server: **niet draaiend**.

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout main; git pull --ff-only        # zou al @ 54a99b6 moeten zijn
# Voor PR-1b — verse worktree (vraag eerst zichtbaar vs verstopt):
git worktree add -b feat/seb/v1-pr1b ..\chatmanta-v1-pr1b
cd ..\chatmanta-v1-pr1b; npm ci
Copy-Item ..\chatmanta\.env.local .\.env.local
# dev: npx next dev -p 3001
```

## 📎 Context pointers
- **Geheugen:** [[project_v1_strategy]] (lees vooral de UPDATE-2026-06-26-blokken) · [[vercel_deployment]] · [[migrate_network_block_prod]] · MEMORY.md
- **Spec (PR-1b-ontwerp):** `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` §4 PR-1 + §5 + §6 + §7
- **PR-1a-plan (referentie-vorm):** `docs/superpowers/plans/2026-06-25-v1-pr1a-kernel-graduatie.md`
- **Kern-files:** `lib/rag/run-rag-query.ts` (de gegradueerde engine — `chatbotScoped`-conditional op `:363`/`:723`) · `lib/supabase/v1/{service-role,server,client,middleware}.ts` · `lib/auth.ts` (`requireOrgMember`) · `app/v1/app/page.tsx` (`V1_SEED_ORG_ID`) · `proxy.ts` (/v1-branch)
- **V0-migraties om te porten naar `migrations-v1/0002`:** `0002_v0_rag.sql` (documents/document_chunks/match_chunks) · `0003_v0_query_log.sql` · `0008_v0_parent_chunks.sql` (=file "0007"-header, let op) · `0042_v0_source_links_in_rpc.sql` (de `_with_parents`-RPC) · `0004` (content_tsv). V1-baseline-policy-patroon: `supabase/migrations-v1/0001_core_tenancy.sql`.
- **V1-project:** ref `tfijdnxqdvwzwgxdioqo` ("ChatManta V1-prod", eu-west-1, gratis). Volgende migratienr: V1 → `0002`, V0 → `0054`.
