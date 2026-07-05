# Handoff — V1 PR-3 (crawler + answer_cache → V1): laatste big-ship-slice — 2026-06-27

> **⚠️ ACHTERHAALD.** PR-3 (crawler + answer_cache → V1) is gemerged (#215/#218/#217). Actuele status + plan: **`docs/V1_STATUS_EN_PLAN.md`** (+ `HANDOFF_2026-06-29`). NB: V1 draait op `gpt-4o-mini`; Haiku/`callLLM` is V2.

## ⚡ Resume in 30 seconds
> Paste in een verse sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta` (hoofd-repo):
> **"Lees `docs/handoffs/HANDOFF_2026-06-27_v1-pr3-crawler-cache.md` en ga verder waar ik gebleven ben."**

- **Branch:** `main` @ `79217dc` · **Worktree:** hoofd-repo (PR-3-worktree nog te maken)
- **State:** Kernel-graduatie big-ship = **2 van 3 slices KLAAR** (PR-1a #212 + PR-1b #213 + PR-2 #214, allemaal gemerged + live). **PR-3 nog NIET begonnen** — geen halve code. De *vorige* sessie heeft PR-1b + PR-2 gebouwd; deze handoff start PR-3.
- **NEXT ACTION:** start de **PR-3-brainstorm** (`superpowers:brainstorming`) voor crawler + `answer_cache` naar V1. Vraag eerst Seb de worktree-locatie (conventie). Het ontwerp-zaad staat al in de mijlpaal-spec §4 PR-3 + §7 PR-3.

## 🎯 Goal
De **kernel-graduatie + V1-RAG-mijlpaal** afmaken (scope C = volledige V0-pariteit, big-ship in 3 PR's). PR-1a (refactor) + PR-1b (V1-retrieval-pad achter auth) + PR-2 (ingest) zijn gemerged. **PR-3 = de laatste slice: crawler + `answer_cache` naar V1** → daarna volledige RAG-pariteit in V1, en de mijlpaal is klaar (→ herplan).

## ✅ Done (deze + vorige sessie, allemaal op `main`)
- **PR-1a #212** (`54a99b6`) — engine → neutraal client-geïnjecteerd `lib/rag/run-rag-query.ts`; V0 = dunne adapter; `chatbotScoped`-vlag.
- **PR-1b #213** (`486e0c3`) — migratie `0002_v1_rag_core` op V1-prod (5 retrieval-tabellen + RLS + document-only `match_chunks_with_parents`); `/v1/app` echte RAG via session-client onder RLS; seed org A/B; isolatie 3/3 + e2e 4/4.
- **PR-2 #214** (`79217dc`) — ingest naar V1: neutrale `lib/rag/ingest.ts` `ingestDocument` (parent+child) + pure `lib/rag/chunker.ts` + `extractDocText` → `lib/rag/doc-parse.ts` (V0 re-export shim) + `v1:ingest` CLI + seed-refactor + `v1:test-ingest` DoD-bewijs. Geen migratie.
- Geheugen bijgewerkt: [[project_v1_strategy]] (06-26 PR-1b + PR-2 UPDATE-blokken) + MEMORY.md-index.

## 🚧 Where I left off (de live thread)
- **Niets half-af.** PR-2 is volledig gemerged + opgeruimd (worktree weg, branch weg, geheugen bij).
- De live thread = **PR-3 is het volgende werk en is nog niet gebrainstormd.** Seb vroeg expliciet om een handoff zodat hij PR-3 in een verse sessie start. Het *ontwerp-zaad* staat in de mijlpaal-spec (§4 PR-3, §7 PR-3, §9 risico's); een verse sessie zet dat om naar een echte brainstorm → spec → plan → bouw.

## ▶️ Next steps (ordered)
1. **Worktree:** vraag Seb zichtbaar (`../chatmanta-v1-pr3`, zijn keuze bij 1b/2) vs verstopt; dan `git worktree add -b feat/seb/v1-pr3 <pad>` van verse `main` + `EnterWorktree` + `npm ci` + kopieer `.env.local`. ⚠️ **Check eerst of `../chatmanta-v1-pr3` al bestaat** (bij PR-2 stond er een wees-dir met een oude `.next` → `git worktree add` faalde; `git worktree prune` + `Remove-Item` + branch `-D` + opnieuw).
2. **Brainstorm PR-3** (`superpowers:brainstorming`) — ontwerp het crawler→V1- + `answer_cache`→V1-pad. Begin met recon (zie context-pointers) + de spec §4 PR-3. **Sleutel-ontwerpvraag:** zie "crawler-parents" hieronder.
3. Daarna de bekende ritmiek (zoals 1b/2): spec → `writing-plans` → bouw (`executing-plans` inline of subagent-driven) → **2-lens review** (`chatmanta-reviewer` + `/code-review` 8-finder-workflow) → PR → **stop voor Seb's merge-sign-off** (V1-migratie = niet zelf mergen zonder go).

## 🧠 Decisions & rationale
- **Mijlpaal = scope C, big-ship in 3 PR's** (1a/1b/2/3), minimaal-eerst per PR. Beslist met Seb (spec `2026-06-25-v1-kernel-graduatie-rag-design.md`).
- **PR-3-scope (uit de spec §4 PR-3 + §7 PR-3):**
  - `website_pages` (+ `knowledge_sources`) naar V1 — port V0 `0032`/`0035`. `org_id`+`chatbot_id NOT NULL`, RLS.
  - `answer_cache` (+ `lookup_cached_answer`-RPC) naar V1 — port V0 `0004`.
  - `match_chunks_with_parents` krijgt de **website-JOIN terug** (de V1-RPC is nu document-only sinds PR-1b) — **drop+recreate** (RETURNS-shape wijzigt terug: `website_page_id`/`source_url`/`source_title` erbij). Dit is het 0042/0035-drop+recreate-precedent.
  - De engine-cache-helpers `lookupCachedAnswer`/`writeCachedAnswer` **gradueren naar client-injectie** (ze gebruiken nu nog de V0-service-role in-module — PR-1a stelde dit bewust uit tot "PR-2/PR-3"; ingest deed het in PR-2, cache is voor PR-3).
  - V1-config-vlaggen die PR-3 waarschijnlijk **omzet** (nu uit in PR-1b): `cacheEnabled:false→true` (answer_cache landt), `sourceLinksEnabled:false→true` (website-source_url komt terug). `hybridSearch` blijft waarschijnlijk false tenzij je `match_chunks_hybrid` óók port (apart te beslissen; `content_tsv` bestaat al in 0002).
- **Migratienummer:** V1 heeft `0001` + `0002` → **volgende = `0003`** (de spec's "0004_v1_website/0005_v1_cache"-nummering was provisioneel; check live vlak vóór toepassen — [[check-migration]]).

## ⚠️ Dead-ends & gotchas (don't repeat)
- **CRAWLER-PARENTS-ONTWERPVRAAG (de hoofdknoop voor de brainstorm):** V0's crawler (`lib/v0/crawler/processCrawl.ts` `ingestCrawlResults`) schrijft **FLAT** chunks via `website_page_id` (géén parents) — net als V0's flat `ingestText`. Maar V1 pint `parentDocumentRetrieval:true` (heeft parents nodig). Dus crawler→V1 moet óf parents maken (zoals `ingestDocument`) óf via een parent-creërend pad lopen. Dit is **exact dezelfde mismatch als PR-2's "ingestText is flat"-vondst**. Opties om te brainstormen: (a) `ingestDocument` generaliseren zodat het óók website-bron-content aankan (met `website_page_id`/`source` i.p.v. document), (b) een crawler-specifiek parent-ingest-pad. Niet vooraf beslissen — uitpluizen in de brainstorm.
- **LANDMIJN 1 (cache-key):** `answer_cache` is gekeyd op `(organization_id, bot_version)`, **NIET `chatbot_id`** → twee V1-chatbots op dezelfde `bot_version` zouden elkaars cache serveren terwijl retrieval per-chatbot scoopt. **Voeg `chatbot_id` aan de key toe** (tabel + `lookup_cached_answer`-RPC + `lookupCachedAnswer`/`writeCachedAnswer` in de engine). (spec §4 PR-3 item 9, bevestigd in de PR-1a-review.)
- **LANDMIJN 2 (answer_cache dubbelrol):** `answer_cache` is sinds #198 óók de **FAQ-pre-cache-deliverystore** ([[answer_cache_removal_analysis]]). Bij het porten beide rollen meenemen.
- **V0-chunkSliding heeft een `if (start+size>=len) break;`-guard** (`scripts/v0-seed-orgs.ts:51`) — bij PR-2 miste ik die in de kopie → extra near-dup chunk; de `/code-review` ving het. **Les: kopieer een helper helemaal, incl. de loop-guard.** (De gedeelde `lib/rag/chunker.ts` heeft 'm nu — hergebruik die voor de crawler.)
- **Module met `import 'server-only'` is NIET importeerbaar in `test:unit`** (geen `--conditions=react-server`). Pure logica (zoals de chunker) zonder `server-only` houden zodat 'm unit-testbaar blijft.
- **`process.exit()` slaat `finally`-blokken over** — voor test-/cleanup-scripts: `throw` + `finally` + pre-clean-by-filename (anders maskeert een achtergebleven test-doc een kapotte run).
- **Service-role bypasst RLS** → filter `deleted_at is null` expliciet op org/chatbot/website-lookups.
- **MCP-migratie op V1-prod** (ref `tfijdnxqdvwzwgxdioqo`): pooler is geblokkeerd vanaf de dev-machine ([[migrate_network_block_prod]]) → `apply_migration` via Supabase MCP + daarna **ledger-rij** in `public._migrations` (`id` = filename-stem, bv. `0003_v1_website`) via `execute_sql` + `get_advisors` (security) checken. **Real-resource write → meld het Seb vlak vóór toepassen** (zoals PR-1b). pgvector staat al in `extensions`; nieuwe tabellen met `vector`-kolom: zet `set search_path = public, extensions, pg_temp` + functies idem.
- **2-lens review werkt** — `chatmanta-reviewer` (hard-rules) + de `/code-review` 8-finder-workflow (correctheid) vonden in **alle 3 PR's** een echte bug die de andere lens miste. Draai BEIDE. Foreground-subagents (async named = onbetrouwbaar).
- **Windows:** `Remove-Item -Recurse -Force .next` vóór elke verificatie-build (dirty-.next-crash). LF→CRLF git-warnings zijn benign.

## ❓ Open questions / waiting on Sebastiaan
- **Worktree-locatie** PR-3 (zichtbaar vs verstopt) — vraag bij kickoff.
- **De crawler-parents-ontwerpvraag** (zie gotchas) — beslis samen in de brainstorm.
- **MCP-migratie op V1-prod** — heads-up vlak vóór `apply_migration` (geen nieuw project, wel de echte V1-DB).
- `hybridSearch` in V1 wel/niet aanzetten in PR-3 (port je `match_chunks_hybrid`?) — brainstorm-keuze.

## 🗂️ Git & environment snapshot
- Behind origin/main: **0** · `main` @ `79217dc`.
- Uncommitted: alleen pre-bestaande untracked (`.agents/`, `.claude/skills/`, `db-schema-map.{drawio,png,svg}`, `rag-pipeline.{drawio,png,svg}`, `docs/handoffs/`, `skills-lock.json`) — NIET van het PR-werk.
- Local-only (unpushed) commits: **geen** (alles gemerged).
- Open PRs: **#207** devcontainer (niet gerelateerd).
- Background tasks still running: **geen** (graphify klaar exit 0; beide `/code-review`-workflows klaar; PR-2-worktree verwijderd).
- Dev server: **niet draaiend**.
- V1-migraties: `0001` + `0002` → **volgende = `0003`**. V1-project ref `tfijdnxqdvwzwgxdioqo`.

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout main; git pull --ff-only        # zou @ 79217dc moeten zijn
# Voor PR-3 — verse worktree (vraag eerst zichtbaar vs verstopt; check of de dir al bestaat):
git worktree add -b feat/seb/v1-pr3 ..\chatmanta-v1-pr3
cd ..\chatmanta-v1-pr3; npm ci
Copy-Item ..\chatmanta\.env.local .\.env.local
# dev: npx next dev -p 3001
```

## 📎 Context pointers
- **Geheugen:** [[project_v1_strategy]] (lees de 06-26 PR-1b + PR-2 UPDATE-blokken) · [[answer_cache_removal_analysis]] (answer_cache FAQ-dubbelrol + cache-staleness) · [[migrate_network_block_prod]] (MCP-migratiekanaal) · [[crawler_dashboard_plan]] + [[crawler_observability_eval_pr121]] (V0-crawler) · [[big_ship_skill]] · MEMORY.md.
- **Mijlpaal-spec (PR-3-ontwerp-zaad):** `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` §4 PR-3 + §7 PR-3 + §9.
- **Referentie-plannen (taakstructuur):** `docs/superpowers/plans/2026-06-26-v1-pr1b-rag-path.md` + `…/2026-06-26-v1-pr2-ingest.md`.
- **V0-files om te porten:** `lib/v0/crawler/processCrawl.ts` (`ingestCrawlResults`/`ingestSinglePage`) · `supabase/migrations/0032_*`/`0035_*` (website_pages/knowledge_sources/`included`) · `0004_v0_hybrid_and_cache.sql` (answer_cache + `lookup_cached_answer`) · `0042_v0_source_links_in_rpc.sql` (de match-RPC mét website-JOIN — het recreate-doel).
- **Engine-cache-helpers om te gradueren:** `lookupCachedAnswer`/`writeCachedAnswer` (zoek in `lib/rag/run-rag-query.ts` + de V0-adapter `lib/v0/server/rag.ts` — PR-1a hield ze in-module op de V0-service-role; PR-3 injecteert de client, net als ingest in PR-2).
- **V1-RAG-glue (cache aanzetten):** `app/v1/app/rag-config.ts` `V1_RAG_DEFAULTS` (`cacheEnabled`/`sourceLinksEnabled` flippen) + `app/v1/app/actions.ts` (`askV1` draait nu `disableCache:true` — heroverwegen bij answer_cache).
- **Neutrale ingest om mogelijk te generaliseren:** `lib/rag/ingest.ts` `ingestDocument` + `lib/rag/chunker.ts`.
