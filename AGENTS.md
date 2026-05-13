<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ChatManta — agent-context

ChatManta is een website-chatbot SaaS van Jorion Solutions. Knowledge-bot voor MKB op basis van RAG over websitecontent + documenten.

**Status (mei 2026):** V0 draait als actief RAG-leerplatform — multi-org sandbox met fake demo-data, eval-pipeline, parent chunks, HyDE, hybrid search, claim-verifications, latency-profiling, cache-telemetry. 14 migrations live (`0001_core_tenancy` t/m `0014_v0_hyde_mode_logging`). V1 (Supabase Auth + productie-multi-tenancy) is nog niet gestart — nieuwe features landen als nieuwe V0 bot-versie tenzij Sebastiaan expliciet zegt "we starten V1".

## Hoe je met dit project werkt

De blueprint en het bouwplan zijn **context, geen kookboek.** Ze zijn geschreven voordat de eerste regel code er stond. Behandel ze als de kennis van een ervaren collega die jou de richting wijst — niet als instructies om over te tikken.

**Verwachte werkstroom voor elke niet-triviale taak:**

1. **Lees** de relevante secties van blueprint + bouwplan vóór je iets typt. Bouwplan-fase = waar we zijn; blueprint-secties = de details.
2. **Denk zelf na**: past de blueprint-aanpak hier? Is er een eenvoudiger of veiliger alternatief in deze concrete situatie? Heeft de blueprint deze edge case voorzien? Klopt het nog met de huidige library-versies?
3. **Maak een korte plan**: leg in 3-7 bullets uit wat je gaat doen, welke files je aanmaakt/wijzigt, en welke blueprint-aannames je volgt of verlaat. Bij wijzigingen aan datamodel, security-laag, of widget-API: leg het plan voor aan de gebruiker vóór je bouwt.
4. **Stel vragen** als de blueprint iets open laat (sectie 34 "Open technische vragen" en 35 "Beslissingen die later genomen mogen worden" zijn explicit niet-beslist). Verzin geen antwoord — vraag.
5. **Bouw**, en commit klein en vaak.
6. **Wijk af van de blueprint** als je daar goede grond voor hebt — maar leg dat uit en vraag bevestiging. De blueprint mag bijgewerkt worden; het is een levend document.

## Bron-van-waarheid documenten

- **Concept Blueprint v4.0** — `c:\Users\solys\Documents\Claude\Projects\Jorion Solutions\Concept_Blueprint_ChatManta.md` (~3400 regels)
- **Bouwplan v2.0 (8 fases)** — `c:\Users\solys\Documents\Claude\Projects\Jorion Solutions\Bouwplan_Planning_ChatManta_v1.md` (~1500 regels)

Bij conflict: V1 Minimal Build Scope (blueprint sectie 1.5) heeft voorrang, daarna Security Addendum, daarna specifieke sectie boven Executive Summary.

## Wat NIET ter discussie staat (echt hard rules)

Deze keuzes zijn gemaakt en zou je niet zelf moeten heroverwegen. Wijken hiervan = risico op datalek, AVG-overtreding, of cost-explosie.

- **V1 Minimal Build Scope** (blueprint sectie 1.5). Bouw in deze ronde nooit een feature die daar onder V2/V3 staat — ook niet als het "snel even" lijkt. De scope-discipline is bewust om het MVP-doel met 2-3 testklanten haalbaar te houden.
- **Multi-tenancy by design**: `organization_id NOT NULL` op élke klantdata-tabel; uitzonderingen alleen `users` en `audit_logs`.
- **RLS overal**: bij elke nieuwe tabel hoort RLS aan + policies in dezelfde migration. Niet later.
- **Service-role discipline (SA-5)**: `supabaseAdmin` alleen via wrappers in `lib/supabase/admin.ts`. Geen losse imports.
- **Object-level access (SA-1)**: `requireXxxAccess(id)` voor elke server action met client-input ID — RLS alleen is niet genoeg bij service-role-paden. *(Geldt vanaf V1 Phase 1; V0 heeft geen per-user identiteit en is bewust geen multi-tenant-veilige laag — zie noot onder.)*
- **Vector search isolation**: `orgId` + `chatbotId` als verplichte (niet-optionele) parameters; soft-delete-filter via JOIN.
- **Geen secrets in `NEXT_PUBLIC_*`** of in client components.
- **Anti-hallucinatie boven volledigheid**: similarity threshold + fallback-pad zonder LLM-call bij geen relevante chunks.

> **⚠️ V0 sandbox-disclaimer.** V0 (`/api/v0/*`, `lib/v0/*`, `app/actions/*` met `v0_active_org` cookie) draait op één gedeeld `V0_DEMO_PASSWORD` zonder per-user identiteit. De `v0_active_org` cookie en `?org=<slug>` query-param worden zonder authorisatie geaccepteerd — een ingelogde V0-bezoeker kan vrij switchen tussen alle KNOWN_ORGS en zo data lezen/schrijven/verwijderen via de service-role wrappers. Dit is bewust voor RAG-tuning met fake demo-data. **STOP NOOIT echte klantdata in een V0 org.** V1 Phase 1 (Supabase Auth + `organization_members` membership-check) vervangt dit model en activeert SA-1 voor productie.

## Wat WEL aan jouw oordeel is

Op uitvoeringsniveau is veel ruimte voor jouw keuzes — daar wordt jouw inbreng juist gewaardeerd:

- **Code-organisatie** (folder structure, file-splitsing, naamgeving) — blueprint pint dit niet vast
- **TypeScript types-design** — interfaces, generics, type-narrowing keuzes
- **UI-implementatie** binnen shadcn/ui — componenten compositie, state-handling, error/loading states
- **SQL-formuleringen** zolang het CHECK constraints, RLS, indexes, cascade-regels respecteert
- **Helper-functies en utils** — extract gerust, dedupliceer, refactor naar zinvolle abstracties
- **Library-keuzes binnen de stack** — als de blueprint een specifieke npm-package noemt en jij kent een betere/nieuwere die hetzelfde doet: leg die voor met argumenten
- **Testen, comments, error-messages** — naar wat de situatie vraagt
- **Concrete drempels** waar de blueprint een default geeft die "valideren via testset" zegt — bijv. similarity threshold 0.7, chunk size 500, top-K 5: dat zijn startwaarden, geen wetten

## Stack

### V0 (huidig — pre-prod RAG-leerplatform)

**Geïnstalleerd & in gebruik:**
- Next.js 16.2 App Router + TypeScript + shadcn/ui + Tailwind v4
- React 19.2
- OpenAI `gpt-4o-mini` (chat / pre-process / rerank / HyDE / decompose / followups)
- OpenAI `gpt-4o` (eval-judge + low-confidence cascade)
- OpenAI `text-embedding-3-small` (1536 dim)
- Supabase (Postgres + Auth + Storage + pgvector), West Europe region
- Vercel hosting + Cron — productie-project `chatmanta-nosp`, domein `www.chatmanta.nl` (primary) + apex redirect
- Anthropic SDK is geïnstalleerd in `package.json` maar in V0 ongebruikt — verwarrend; negeer voor V0-werk.

### V1 (gepland — Phase 4 van het Bouwplan)

- Anthropic Claude Haiku 4.5 als primair, met OpenAI als technische fallback in `callLLM()`-laag (niet klant-zichtbaar)
- Migratie-grens: nieuwe LLM-laag in `lib/ai/llm.ts` met provider-abstractie (`MODEL_COSTS` voor EUR-billing; V0 gebruikt naast deze tabel een eigen `MODEL_COSTS_USD` voor USD-cost-rapportage in `query_log.cost_usd`)
- Firecrawl — Phase 5 (website crawler, max 50 pagina's per crawl)
- Sentry, UptimeRobot, Upstash Ratelimit, Resend — Phase 7 (hardening)

**Bekende valkuilen in de stack:**
- **Tailwind v4 PostCSS-pipeline**: nieuwe properties op bestaande selectors in `app/globals.css` worden soms silent gedropt. Bypass: inline `style={{...}}` of een lokaal `<style>`-tag in het component dat de property nodig heeft.

## Operationele commando's & V0-empirie

**V0-empirie (overrides blueprint-default):**
- Similarity threshold ≈ **0.4**, niet de blueprint-default 0.7. Voor `text-embedding-3-small` + NL is 0.7 te streng — V0-testing heeft dit empirisch laten zien. Blueprint sectie 1.5 zegt zelf "valideren via testset", dus 0.7 is een startwaarde, geen wet.

**Eval-pipeline (RAG-validatie):**
- `npm run eval:run-all` — seed → run → report; gebruik dit om RAG-wijzigingen meetbaar te valideren vóór een PR
- Losse stappen: `eval:seed`, `eval:run`, `eval:report`
- ⚠️ V0.5 fix: judge gebruikt nu `parentExcerpt` (~800 chars) ipv small-chunk excerpts — eerlijker grounding-meting. Zie `lib/v0/server/eval.ts` `buildJudgeUserPrompt`.

**Migrations:**
- Eigen tooling, géén `supabase db push`: `npm run migrate`, `migrate:status`, `migrate:bootstrap`
- Files in `supabase/migrations/NNNN_*.sql`, strikt volgnummer; nieuwe migration = RLS-policies in dezelfde file
- ⚠️ Vóór je `NNNN` kiest: check zowel lokaal als open PRs voor het hoogste nummer. Parallelle branches/worktrees claimen anders allebei hetzelfde nummer — de conflict zit dan in de file-content, niet in de naam. Snelcheck: `ls supabase/migrations | sort | tail -3` + `gh pr list --state open --search "supabase/migrations" --limit 5`.

**V0-scripts (snel demo-data manipuleren):**
- `v0:ingest`, `v0:chat`, `v0:list`, `v0:reset`, `v0:tune`, `v0:reingest-parents`, `v0:seed-orgs`, `v0:test-org-isolation` — zie `package.json`

## Bouwfase-volgorde

0. Setup & Foundation
1. Auth & Multi-tenancy fundament
2. Klanten & Chatbots beheer
3. Document Pipeline
4. RAG Kern (zwaarste fase)
5. Website Crawler
6. Widget publieke laag
7. Hardening & Security V1 Core
8. Polish & Go-live

Bouw geen vooruit-werk uit een latere fase. Definition of Done van vorige fase moet aantoonbaar afgevinkt zijn vóór volgende fase. Bij twijfel of iets in de huidige fase past: vraag.

## Hoe je met de gebruiker (Sebastiaan) communiceert

- Eerst plannen, dan bouwen — vooral bij datamodel, RLS, security, widget-API en alles dat de gebruiker als "de moeilijke stukken" markeert
- Wees expliciet wanneer je een blueprint-default volgt vs wanneer je iets zelf kiest
- Wijzig nooit een gemarkeerde V1 hard rule zonder te vragen
- Als je iets niet zeker weet: zeg dat en stel een verifieerbare check voor
- Bij library-versies en npm-packages: lees `node_modules/<pkg>/README` of recente docs voor je veronderstelt hoe de API eruitziet — Next.js, Supabase en Vercel AI SDK veranderen snel
- **Minimaal eerst, uitbreiden later** — bij evals, tests en analyses lever precies de gevraagde scope. Geen extra dimensies, breakdowns, variance-secties of citation-coverage tenzij Sebastiaan ernaar vraagt. Eerste-PR-diff > 2× de spec is een signaal dat je over-implementeert; trim eerst, vraag dan of er meer moet bij.
- **Niet delegeren wat je zelf kunt** — Sebastiaan niet vragen om handmatig SQL, migrations of worktree-exits te draaien. Gebruik `npm run migrate`, `ExitWorktree`, Bash. Bij Codex/security-review-bevindingen: verifieer false positives zelf (~2 per review is de baseline) vóór je fixes toepast. Uitzondering: onomkeerbare actions (push naar main, mergen, externe billable API-calls) → eerst bevestigen.
- **Cache-issues vóór bug-jacht** — als een UI-wijziging niet zichtbaar is, clear `.next/` en herstart de dev server eerst. Veel "bugs" zijn stale Turbopack/.next cache, niet echte bugs. Verspil geen debugging-tijd voor je dit hebt uitgesloten.

## Werkstroom & parallelle sessies

Sebastiaan (`@Zoutig` op GitHub) werkt momenteel **solo** aan deze codebase. AGENTS.md verwijst soms naar "team" / "collega" — dat is voorlopig hypothetisch; behandel alle review-afspraken als zelf-reviews tenzij anders gezegd. De afspraken hieronder draaien vooral om **parallel werken met meerdere CC-sessies tegelijk**, want dat gebeurt regelmatig en gaat zonder worktrees mis.

> **Voor een nieuwe Claude Code sessie**: lees `docs/ONBOARDING_AGENT.md` om volledig op te starten.
> **Voor mensen**: `docs/ONBOARDING.md` heeft de setup-instructies.

**Bij elke nieuwe sessie:**

De SessionStart hook (`.claude/hooks/session-start.mjs`) doet automatisch een `git fetch` en levert je een briefing:
- Huidige branch, of je achterloopt op `origin/main`, recente commits van de teamgenoot
- Lokale uncommitted wijzigingen
- Open PRs

Heb je deze briefing niet zien verschijnen (hook faalde of niet ingeladen)? Doe handmatig:
```
git status && git fetch origin && git log HEAD..origin/main --oneline
gh pr list --state open --limit 5
```

Bij recente code-wijzigingen: lees `graphify-out/GRAPH_REPORT.md` voor structurele context.

**De hook doet géén `git pull` automatisch** — dat zou ongevraagd mergeconflicten kunnen veroorzaken. Vraag de gebruiker of pull veilig is voor je het uitvoert.

**Parallelle CC-sessies — gebruik altijd worktrees:**

Sebastiaan draait regelmatig meerdere Claude Code sessies tegelijk. Als twee sessies hetzelfde working-directory delen, racen ze op `git status`, branch-checkouts en working-tree edits — niet hypothetisch, dit is daadwerkelijk gebeurd.

Default-regel: **één CC-sessie per working-directory**. Voor parallel werk gebruik je `git worktree`:

```powershell
# Per parallelle taak een eigen folder + branch:
git worktree add ../chatmanta-<doel> feat/seb/<branch>
cd ../chatmanta-<doel>
claude
```

Als agent: bij sessie-start check je of er een ander CC-proces actief is via `.claude/scheduled_tasks.lock` — als die file bestaat met een PID die niet de jouwe is, draait er een tweede sessie op deze working-directory. STOP en vraag de gebruiker:
1. Of die andere sessie nog actief is (kan stale lock zijn)
2. Of je naar een worktree moet switchen voor je verder gaat

Indicaties dat een parallel-sessie tussendoor heeft gewerkt: branch-checkout die je niet zelf deed, commits in `git log` die je niet kent, untracked files in onverwachte mappen. Bij twijfel: `git reflog -20` toont je wat er gebeurd is.

CC heeft een `EnterWorktree` tool en een `superpowers:using-git-worktrees` skill — gebruik die voor automatische worktree-aanmaak bij dispatched subagents.

**Per-worktree caveats** (voor mensen): elke worktree heeft eigen `node_modules`, eigen `.next/`, géén automatische `.env.local` (die is gitignored — kopieer hem zelf), en eigen dev-server-poort (gebruik `next dev -p 3001` voor de tweede). Memory-store van CC is per working-directory dus niet gedeeld tussen worktrees.

**Voor je begint te bouwen:**
- Maak een feature branch: `git checkout -b feat/seb/<beschrijving>` (bv. `feat/seb/widget-theme`). Nooit direct op `main`.
- Branches kort houden — een branch die langer dan 2-3 dagen leeft = mergeconflict-risico
- ⚠️ Parallelle CC-sessies kunnen tussen tool calls door op een andere branch zijn beland. Direct vóór elke commit `git rev-parse --abbrev-ref HEAD` checken om er zeker van te zijn dat je nog op de juiste branch staat.

**Voor je een PR maakt:**
- Vul `.github/pull_request_template.md` volledig in. Dit is wat de reviewer + zijn agent leest om context te krijgen — schrijf het voor een collega die niet bij je gesprek was.
- Run `graphify update .` bij nieuwe files of grote refactors (output is gitignored — alleen lokaal up-to-date houden, niet committen)
- Check of je geen V1 hard rules schendt (zie boven)
- PR aanmaken met `gh pr create` — gebruik de template (gh detecteert die automatisch)

**Branch protection op `main`:**
- Lokale `.githooks/pre-push` blokkeert `git push origin main`. Hook activeert via `core.hooksPath` (auto-gezet door `npm install` via het `postinstall` script).
- Niet 100% server-side afgedwongen — `git push --no-verify` omzeilt de hook. Dit is bewust een soft-gate: GitHub Pro is nodig voor échte server-side bescherming op een private repo.
- Afspraak: gebruik `--no-verify` alleen voor noodgevallen waarbij je het uitlegt in de commit message.
- Review is *niet* afgedwongen, maar de afspraak is: vraag collega om te kijken voor je merget.

**Voor agents specifiek:**
- Krijg je een `[BLOCKED]` melding bij `git push`? Goed — je probeerde direct op main te pushen. Maak een feature branch en push opnieuw.
- Probeer NOOIT `git push --no-verify` zonder dat de gebruiker er expliciet om vraagt. Dit ondermijnt de hele bescherming.
- **Geen absolute paden naar de hoofdrepo vanuit een worktree-sessie.** Edit/Write met `C:\Users\solys\Documents\Code\chatmanta\...` terwijl je in `../chatmanta-<doel>/` werkt schrijft naar de hoofdrepo, niet je worktree — je commit landt dan in de verkeerde branch. Gebruik relatieve paden of paden onder de worktree-root. De globale pre-edit hook (`~/.claude/hooks/pre-edit-worktree-check.ps1`) print bij elke edit de worktree-root en branch, en flagt `OUTSIDE WORKTREE` als je een vreemd pad raakt — neem die warning serieus en heroverweeg vóór je verder typt.
- **Na een merge ruim je op:** `git branch -D feat/seb/<branch>` lokaal (squash-merges → `-d` faalt altijd, dus `-D`), `git push origin --delete feat/seb/<branch>` op remote (of via `gh`), `git worktree remove ../chatmanta-<doel>` als het er een was, en `Get-Process node | Stop-Process -Force` als poort 3000/3001 vast blijft zitten door een orphan dev-server.
