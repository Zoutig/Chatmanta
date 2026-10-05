<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ChatManta — agent-context

ChatManta is een website-chatbot SaaS van Jorion Solutions. Knowledge-bot voor MKB op basis van RAG over websitecontent + documenten.

**Status (juli 2026):** V0 draait als actief RAG-leerplatform mét geshipte crawler + embeddable widget. **V1 is code-compleet** — `app/v1` + `lib/v1` op het aparte V1-prod-Supabase-project; resterend vóór launch is uitsluitend ops/legal, zie `docs/V1_LAUNCH_TODO.md`. Nieuwe features: overleg of ze in V0 (bot-versie) of V1 landen.

## Hoe je met dit project werkt

**Verwachte werkstroom voor elke niet-triviale taak:**

1. **Lees** de relevante code + in-repo docs (zie hieronder) vóór je iets typt.
2. **Denk zelf na**: is er een eenvoudiger of veiliger alternatief? Klopt het nog met de huidige library-versies?
3. **Maak een kort plan** (3-7 bullets): wat ga je doen, welke files, welke aannames. Bij wijzigingen aan datamodel, security-laag of widget-API: leg het plan voor aan de gebruiker vóór je bouwt.
4. **Stel vragen** als iets niet beslist is (zie de open beslissingen in `docs/V2_SCOPE_EN_PRINCIPES.md` §7). Verzin geen antwoord — vraag.
5. **Bouw**, en commit klein en vaak.

## Bron-van-waarheid documenten (alle in de repo)

- **Code + migraties** — `supabase/migrations*/`, `lib/`, `app/`. Dit is de waarheid; docs kunnen achterlopen.
- **`docs/V2_SCOPE_EN_PRINCIPES.md`** — gedistilleerde opvolger van de oorspronkelijke Concept Blueprint + Bouwplan (mei 2026): actuele V1-scope-grens, V2/V3-backlog, billing/AVG/security-hardening-principes (SA-6..14), open beslissingen en een tabel "blueprint zei X → we doen Y".
- **`docs/V1_STATUS_EN_PLAN.md`** (sectie "Besliste keuzes") en **`docs/V1_LAUNCH_TODO.md`** — V1-beslissingen en wat er nog vóór launch moet.
- **`docs/AGENT_LANDMIJNEN.md`** — duurzame valkuilen.

De originele blueprint en het bouwplan zijn **historisch archief** buiten de repo; ze zijn ~75% achterhaald en niet meer leidend. Lees ze niet als bron; vraag Sebastiaan als je de oorspronkelijke motivatie achter een keuze nodig hebt.

Bij conflict: code + migraties > "Besliste keuzes" in `V1_STATUS_EN_PLAN.md` > `V2_SCOPE_EN_PRINCIPES.md`.

## Wat NIET ter discussie staat (echt hard rules)

Deze keuzes zijn gemaakt. Wijken hiervan = risico op datalek, AVG-overtreding of cost-explosie.

- **V1-scope-grens** (`docs/V2_SCOPE_EN_PRINCIPES.md` §2-3). Bouw nooit een feature die daar onder V2/V3 staat zonder expliciete opdracht van Sebastiaan — ook niet als het "snel even" lijkt. Staat hij nergens: vraag.
- **Multi-tenancy by design**: `organization_id NOT NULL` op élke klantdata-tabel; uitzonderingen alleen `users` en `audit_logs`.
- **RLS overal**: bij elke nieuwe tabel hoort RLS aan + policies in dezelfde migration. Niet later.
- **Service-role discipline (SA-5)**: `supabaseAdmin` alleen via wrappers in `lib/supabase/admin.ts`. Geen losse imports.
- **Object-level access (SA-1)**: `requireXxxAccess(id)` voor elke server action met client-input ID — RLS alleen is niet genoeg bij service-role-paden. *(Geldt vanaf V1; V0 heeft bewust geen per-user identiteit — zie noot onder.)*
- **Vector search isolation**: `orgId` + `chatbotId` als verplichte (niet-optionele) parameters; soft-delete-filter via JOIN.
- **Geen secrets in `NEXT_PUBLIC_*`** of in client components.
- **Anti-hallucinatie boven volledigheid**: similarity threshold + fallback-pad zonder LLM-call bij geen relevante chunks.

> **⚠️ V0 sandbox-disclaimer.** V0 (`/api/v0/*`, `lib/v0/*`, `app/actions/*` met `v0_active_org` cookie) draait op één gedeeld `V0_DEMO_PASSWORD` zonder per-user identiteit. De `v0_active_org` cookie en `?org=<slug>` query-param worden zonder autorisatie geaccepteerd — een ingelogde V0-bezoeker kan vrij switchen tussen alle KNOWN_ORGS en zo data lezen/schrijven/verwijderen via de service-role wrappers. Dit is bewust voor RAG-tuning met fake demo-data. **STOP NOOIT echte klantdata in een V0 org.** **Uitzondering (PR #105/#118):** de embeddable-widget-routes `/embed/[slug]`, `/api/v0/chat`, `/api/v0/widget/ping`, `/api/v0/widget/token`, `/api/v0/contact-request` en `/widget.js` vallen *buiten* deze `V0_DEMO_PASSWORD`-gate — ze draaien op externe sites zonder demo-login en worden beschermd door een kortlevend HMAC embed-token (fail-closed, env `EMBED_TOKEN_SECRET`) + origin-lock + per-IP rate-limit. Ook die routes serveren alléén sandbox-orgs met fake data. V1 (Supabase Auth + `organization_members` membership-check) vervangt dit model en activeert SA-1 voor productie.
>
> **⚠️ Echte bezoekers-PII in `v0_contact_requests`** (migr 0053, `/api/v0/contact-request`): de **eerste V0-tabel met echte derde-partij-PII** — naam/e-mail/telefoon van websitebezoekers. Omdat V0 geen per-org-isolatie heeft, kan een demo-bezoeker via org-switch de contactverzoeken (incl. PII) van een ándere org lezen. **Bewust geaccepteerd voor de testfase** mét vangrails: `consent_given = true` CHECK op DB-niveau, service-role-only writes, verplichte `organization_id`-filter op elke query, org gebonden aan de gesigneerde slug-claim in het embed-token (geen cross-org-targeting via `?org=`), harde verwijdering na 90 dagen. **Cross-org-leesbaarheid van deze PII is een harde V1-blocker:** echte per-org-auth (SA-1 + membership-check) moet er zijn vóór er productie-klantdata in landt.

## Wat WEL aan jouw oordeel is

Op uitvoeringsniveau is veel ruimte voor jouw keuzes — daar wordt jouw inbreng juist gewaardeerd:

- **Code-organisatie** (folder structure, file-splitsing, naamgeving)
- **TypeScript types-design** — interfaces, generics, type-narrowing
- **UI-implementatie** binnen shadcn/ui — compositie, state-handling, error/loading states
- **SQL-formuleringen** zolang CHECK constraints, RLS, indexes en cascade-regels gerespecteerd blijven
- **Helper-functies en utils** — extract gerust, dedupliceer, refactor
- **Library-keuzes binnen de stack** — ken je een betere package: leg voor met argumenten
- **Testen, comments, error-messages** — naar wat de situatie vraagt
- **Concrete RAG-drempels** (similarity threshold, chunk size, top-K): empirisch getuned via de eval-pipeline, geen wetten — wijzig alleen met eval-bewijs

## Stack

### V0 (huidig — pre-prod RAG-leerplatform)

- Next.js 16.2 App Router + TypeScript + shadcn/ui + Tailwind v4, React 19.2
- OpenAI `gpt-4o-mini` (chat / pre-process / rerank / HyDE / decompose / followups), `gpt-4o` (eval-judge + low-confidence cascade), `text-embedding-3-small` (1536 dim)
- Supabase (Postgres + Auth + Storage + pgvector), West Europe region
- Vercel hosting + Cron — productie-project `chatmanta-nosp`, domein `www.chatmanta.nl` (primary) + apex redirect
- Firecrawl-crawler (max 50 pagina's/crawl) + embeddable widget draaien al live in V0-vorm (`lib/v0/crawler/`, dashboard in de Kennisbank); de V1-hardening (auth, per-user multi-tenancy, origin-allowlist) volgt nog
- Anthropic SDK staat in `package.json` maar is in V0 ongebruikt — negeer voor V0-werk.

### V1

- **V1 draait op OpenAI `gpt-4o-mini`** (scope-beslissing 2026-06-29). De RAG-engine roept `openai()` direct aan; de `callLLM()`/`streamLLM()`-provider-abstractie + Claude Haiku + automatische fallback zijn bewust **V2** (de stub in `lib/ai/llm.ts` mag stub blijven). Zie `docs/V1_STATUS_EN_PLAN.md`.
- Kosten: V0 én V1 gebruiken `MODEL_COSTS_USD` voor USD-cost-rapportage in `query_log.cost_usd`; EUR via `costUsdToEur` komt pas met een echte V2-billing-caller.
- Sentry, UptimeRobot, Upstash Ratelimit, Resend — Phase 7 (hardening)

**Bekende valkuil in de stack:** Tailwind v4 PostCSS-pipeline dropt soms silent nieuwe properties op bestaande selectors in `app/globals.css`. Bypass: inline `style={{...}}` of een lokaal `<style>`-tag in het component.

## Operationele commando's & V0-empirie

**V0-empirie (overrides blueprint-default):**
- Similarity threshold ≈ **0.4**, niet de blueprint-default 0.7. Voor `text-embedding-3-small` + NL is 0.7 te streng — empirisch aangetoond via V0-testing.

**Eval-pipeline (RAG-validatie):**
- `npm run eval:run-all` — seed → run → report; valideer RAG-wijzigingen meetbaar vóór een PR. Losse stappen: `eval:seed`, `eval:run`, `eval:report`
- Judge gebruikt `parentExcerpt` (~800 chars) ipv small-chunk excerpts — eerlijker grounding-meting; zie `lib/v0/server/eval.ts` `buildJudgeUserPrompt`.

**Migrations — LET OP: twee gescheiden ledgers (V0 en V1).**
- Eigen tooling, géén `supabase db push`. V0: `npm run migrate` / `migrate:status` / `migrate:bootstrap`. **V1 heeft eigen scripts én eigen map:** `npm run migrate:v1` / `migrate:v1:status` (draaien tegen het aparte V1-prod-Supabase-project).
- Files: V0 in `supabase/migrations/NNNN_*.sql`, V1 in `supabase/migrations-v1/NNNN_*.sql`. Beide strikt volgnummer, **elk met een eigen nummerreeks** (V0 zit ~0054, V1 zit ~0025 — ze lopen níet gelijk). Nieuwe migration = RLS-policies in dezelfde file.
- ⚠️ Vóór je `NNNN` kiest: check de **juiste** map + open PRs voor het hoogste nummer — parallelle branches claimen anders hetzelfde nummer. Snelcheck V0: `ls supabase/migrations | sort | tail -3`; V1: `ls supabase/migrations-v1 | sort | tail -3`; plus `gh pr list --state open --search "supabase/migrations" --limit 5`. De `/check-migration`-skill doet dit voor je.
- ⚠️ **Dubbele volgnummers bestaan al in V0** (`0028`, `0039`, `0040`, `0044` — parallelle `admin_*`/`v0_*`-branches claimden hetzelfde nummer). De `migrate.mjs`-tracker keyt op de **volledige bestandsnaam**, dus beide files worden los getrackt en toegepast — benign, **niet hernoemen** (al op prod). Kies wél het eerstvolgende vrije nummer verder. De V1-migraties `0017-0020` (admin_*) bestaan wél in de repo (PR #236) — er is geen file-gat, alleen een openstaande prod-ledger-verificatie (zie `plans/014`).

**V0-scripts (demo-data):** `v0:ingest`, `v0:chat`, `v0:list`, `v0:reset`, `v0:tune`, `v0:reingest-parents`, `v0:seed-orgs`, `v0:test-org-isolation` — zie `package.json`

## Bouwfase-volgorde

0. Setup & Foundation → 1. Auth & Multi-tenancy → 2. Klanten & Chatbots → 3. Document Pipeline → 4. RAG Kern (zwaarste) → 5. Website Crawler → 6. Widget publieke laag → 7. Hardening & Security → 8. Polish & Go-live

Fase 5 en 6 hebben al een werkende V0-implementatie in main; de volgorde beschrijft de V1-bouwlijn. Bouw geen vooruit-werk uit een latere fase; Definition of Done van de vorige fase moet aantoonbaar afgevinkt zijn. Bij twijfel of iets in de huidige fase past: vraag.

## Hoe je met de gebruiker (Sebastiaan) communiceert

- Eerst plannen, dan bouwen — vooral bij datamodel, RLS, security, widget-API
- Wees expliciet wanneer je een vastgelegde keuze (code/docs) volgt vs wanneer je zelf kiest
- Wijzig nooit een gemarkeerde V1 hard rule zonder te vragen
- Weet je iets niet zeker: zeg dat en stel een verifieerbare check voor
- Bij library-versies en npm-packages: lees `node_modules/<pkg>/README` of recente docs vóór je API-aannames doet — Next.js, Supabase en Vercel AI SDK veranderen snel
- **Minimaal eerst, uitbreiden later** — lever bij evals, tests en analyses precies de gevraagde scope, geen extra dimensies of breakdowns. Eerste-PR-diff > 2× de spec = signaal van over-implementeren; trim eerst, vraag dan of er meer bij moet.
- **Niet delegeren wat je zelf kunt** — vraag Sebastiaan niet om handmatig SQL, migrations of worktree-exits te draaien; gebruik `npm run migrate`, `ExitWorktree`, Bash. Bij review-bevindingen: verifieer false positives zelf (~2 per review is baseline) vóór je fixes toepast. Uitzondering: onomkeerbare acties (push naar main, mergen, externe billable API-calls) → eerst bevestigen.
- **Cache-issues vóór bug-jacht** — UI-wijziging niet zichtbaar? Eerst `.next/` wissen en de dev-server herstarten; veel "bugs" zijn stale Turbopack-cache.

## Werkstroom & parallelle sessies

Sebastiaan (`@Zoutig` op GitHub) werkt **solo** aan deze codebase. Verwijzingen naar "team"/"collega" zijn hypothetisch; behandel review-afspraken als zelf-reviews. De afspraken hieronder draaien vooral om **parallel werken met meerdere CC-sessies tegelijk** — dat gebeurt regelmatig en gaat zonder worktrees mis.

> **Nieuwe CC-sessie**: lees `docs/ONBOARDING_AGENT.md`. **Mensen**: `docs/ONBOARDING.md`.

**Bij elke nieuwe sessie:** de SessionStart-hook (`.claude/hooks/session-start.mjs`) doet een `git fetch` en levert een briefing (branch, achterstand op origin/main, lokale wijzigingen, open PRs). Geen briefing gezien? Handmatig: `git status && git fetch origin && git log HEAD..origin/main --oneline` + `gh pr list --state open --limit 5`. De hook doet **géén `git pull`** — vraag de gebruiker of pull veilig is vóór je het uitvoert.

**Parallelle CC-sessies — gebruik altijd worktrees.** Twee sessies op dezelfde working-directory racen op `git status`, branch-checkouts en edits (daadwerkelijk gebeurd). Default: **één CC-sessie per working-directory**. Voor parallel werk:

```powershell
git worktree add ../chatmanta-<doel> feat/seb/<branch>
cd ../chatmanta-<doel>
claude
```

Als agent: check bij sessie-start `.claude/scheduled_tasks.lock` — bestaat die met een PID die niet de jouwe is, dan draait er een tweede sessie op deze directory. STOP en vraag de gebruiker of de andere sessie nog actief is (kan stale lock zijn) en of je naar een worktree moet. Indicaties dat een parallel-sessie tussendoor werkte: branch-checkout die je niet deed, onbekende commits, onverwachte untracked files. Bij twijfel: `git reflog -20`.

CC heeft een `EnterWorktree`-tool en de `superpowers:using-git-worktrees`-skill voor automatische worktree-aanmaak.

**Per-worktree caveats:** eigen `node_modules` (echte `npm ci` — een junction werkt niet met Turbopack-dev), eigen `.next/`, géén automatische `.env.local` (gitignored — kopieer zelf), eigen dev-server-poort (`next dev -p 3001`). CC-memory is per working-directory.

**Voor je begint te bouwen:**
- Feature branch: `git checkout -b feat/seb/<beschrijving>`. Nooit direct op `main`. Branches kort houden (2-3 dagen max = mergeconflict-risico).
- ⚠️ Parallelle sessies kunnen je branch verschuiven: direct vóór elke commit `git rev-parse --abbrev-ref HEAD` checken.

**Voor je een PR maakt:**
- Vul `.github/pull_request_template.md` volledig in — schrijf voor een collega die niet bij je gesprek was.
- Check dat je geen V1 hard rules schendt (zie boven).
- Definition of Done: `npm run typecheck` én `npm run build` groen (Windows: verwijder eerst `.next/` als er een dev-server heeft gedraaid — een vervuilde `.next` crasht de build), en het gedrag geverifieerd via test, Playwright of browser.
- PR aanmaken met `gh pr create` — de template wordt auto-gedetecteerd.

**Branch protection op `main`:** lokale `.githooks/pre-push` blokkeert `git push origin main` (activeert via `core.hooksPath`, auto-gezet door `npm install`). Soft-gate: `git push --no-verify` omzeilt hem — alleen voor noodgevallen mét uitleg in de commit message. Review is niet afgedwongen; afspraak: laat ernaar kijken vóór je merget.

**Voor agents specifiek:**
- `[BLOCKED]` bij `git push`? Je probeerde direct op main te pushen — maak een feature branch en push opnieuw.
- Probeer NOOIT `git push --no-verify` zonder dat de gebruiker er expliciet om vraagt.
- **Geen absolute paden naar de hoofdrepo vanuit een worktree-sessie** — Edit/Write met `C:\Users\solys\Documents\Code\chatmanta\...` vanuit `../chatmanta-<doel>/` schrijft naar de hoofdrepo en je commit landt in de verkeerde branch. Gebruik relatieve paden. De globale pre-edit hook flagt `OUTSIDE WORKTREE` — neem die warning serieus.
- **Na een merge opruimen:** `git branch -D feat/seb/<branch>` lokaal (squash-merges → `-d` faalt altijd), `git push origin --delete feat/seb/<branch>`, `git worktree remove ../chatmanta-<doel>` als het er een was, en `Get-Process node | Stop-Process -Force` als poort 3000/3001 vastzit door een orphan dev-server.

**Bij sessie-einde:** check dat alles gecommit en gepusht is en meld expliciet of de sessie veilig afgesloten kan worden (`/close`; `/close all` sweept alle worktrees). Werk dat later verder moet: maak een handoff-doc (`/handoff`, landt in `docs/handoffs/`).
