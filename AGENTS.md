<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ChatManta — agent-context

ChatManta (Jorion Solutions) is een website-chatbot-SaaS voor het MKB: RAG over websitecontent + documenten, geleverd als embeddable widget met een klant- en admindashboard.

**Stand (oktober 2026):** V1 is code-compleet en draait live op `www.chatmanta.nl` in soft-launch met de eerste testklanten. Wat er vóór betalende klanten nog moet is ops/legal: `docs/V1_LAUNCH_TODO.md` en `docs/HERSTART_2026-10.md`. V0 blijft permanent naast V1 bestaan als RAG-leerplatform. Bij een nieuwe feature: overleg of hij in V0 (als bot-versie) of in V1 landt.

Sebastiaan (`@Zoutig`) werkt solo. "Team", "collega" of "teamgenoot" in docs of hook-output = zijn eigen parallelle Claude Code-sessies. Niels is Customer/Launch Lead en schrijft geen code.

## Kaart: wat draait waar

| Deel | Routes | Code | Database / migraties |
|---|---|---|---|
| Marketingsite | `/`, `/kennismaking`, `/voorwaarden`, `/privacy` | `app/(site)`, `app/privacy`, `lib/site` | — |
| Publieke demo | `/voorbeeld/*` | `app/voorbeeld`, `lib/voorbeeld` | V1-prod, fictieve org (`npm run voorbeeld:seed`) |
| **V1** (productie) | `/v1/*`, `/api/v1/*`, `/embed-v1/[slug]`, `/widget-v1.js` | `app/v1`, `lib/v1` | V1-prod-Supabase · `supabase/migrations-v1/` · `npm run migrate:v1` |
| **V0** (sandbox) | `/v0/*`, `/api/v0/*`, `/embed/[slug]`, `/widget.js` | `app/v0`, `lib/v0`, `app/actions` | V0-Supabase · `supabase/migrations/` · `npm run migrate` |
| RAG-engine (gedeeld) | — | `lib/rag` | beide |

**Mascotte.** Ontwerp je iets publieks (site, demo, mail, OG-beeld, deck)? Er is een geanimeerde manta-mascotte met bronbeelden, stills per expressie en een React-component: lees eerst `docs/site/MASCOTTE.md`.

**V1 erft zijn RAG-config van de LATEST V0-bot.** `app/v1/app/rag-config.ts` neemt `resolveBot(LATEST_BOT_VERSION)` uit `lib/v0/server/bots.ts` over, plus V1-overrides. Een nieuwe LATEST promoveren verandert dus het gedrag van V1-productie. Purge daarna de answer-cache (`purgeAnswerCache`), anders blijft V1 oude antwoorden serveren. Botversies zijn append-only: nieuw gedrag = nieuwe versie, een bestaande versie muteer je nooit.

**Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn/ui, Tailwind v4 · Supabase (Postgres + pgvector + Auth + Storage, EU) · Vercel (project `chatmanta-nosp`, regio `dub1`, Cron) · OpenAI: V1 draait `gpt-6-luna` (priority-tier) voor antwoord én hulpstappen (`app/v1/app/rag-config.ts`), V0-botversies kiezen per versie hun model (`lib/v0/server/bots.ts`), `gpt-4o` voor de oude eval-judge en de low-confidence-cascade, `text-embedding-3-*` voor embeddings (welk model per index: `lib/rag/embeddings.ts`) · Firecrawl (crawler) · Upstash (rate-limit) · Resend (mail) · Sentry · Better Stack (uptime). De Anthropic SDK staat in `package.json` maar de app gebruikt hem niet: een tweede LLM-provider is V2 (`lib/ai/llm.ts` is bewust een stub). Kosten worden in USD gelogd via `MODEL_COSTS_USD` → `query_log.cost_usd`. Doe geen API-aannames uit je geheugen: check de geïnstalleerde versie in `node_modules`.

## Hard rules

Afwijken = risico op datalek, AVG-overtreding of kostenexplosie. Wijzig of omzeil er geen zonder expliciete opdracht van Sebastiaan.

1. **Scope-grens.** Wat in `docs/V2_SCOPE_EN_PRINCIPES.md` §2-3 onder V2/V3 staat, bouw je niet, ook niet "snel even". Staat iets nergens: vraag.
2. **Multi-tenancy.** `organization_id NOT NULL` op elke klantdata-tabel. Alleen `users` en `audit_logs` zijn uitgezonderd.
3. **RLS overal.** Een nieuwe tabel krijgt RLS aan + policies in dezelfde migratie, niet later.
4. **Service-role-discipline (SA-5).** De service-role-client alleen via de wrappers: `lib/supabase/admin.ts` (V0) en `lib/supabase/v1/service-role.ts` (V1). Geen losse `createClient(…, SERVICE_ROLE_KEY)`.
5. **Object-level access (SA-1, V1).** Elke server action of route met een ID van de client roept eerst `requireXxxAccess(id)` aan. RLS alleen is niet genoeg op service-role-paden.
6. **Vector-search-isolatie.** `orgId` + `chatbotId` zijn verplichte (niet-optionele) parameters, met soft-delete-filter via JOIN.
7. **Geen secrets naar de client.** Niet in `NEXT_PUBLIC_*`, niet in client components.
8. **Anti-hallucinatie boven volledigheid.** Een similarity-threshold plus een fallback-pad zonder LLM-call als er geen relevante chunks zijn. De threshold staat empirisch op ≈ 0.4 (0.7 is te streng voor `text-embedding-3-small` + NL). Drempels zijn model-gebonden: herkalibreer ze bij een wissel van embedding-model. Zulke drempels wijzig je alleen met eval-bewijs.
9. **Geen bronlinks in V1** (`sourceLinksEnabled: false` in `app/v1/app/rag-config.ts`, beslissing 2026-06-30; de onderbouwing staat bij die regel).
10. **De repo is publiek.** Geen secrets, interne prijzen/tarieven (zoals vriendenprijzen) of klant-PII in code, docs, commits of PR-teksten. Prijzen die publiek op de marketingsite staan mogen wel.

### V0 is bewust géén veilige multi-tenant-omgeving

V0 draait op één gedeeld `V0_DEMO_PASSWORD`, zonder per-user identiteit. Via de `v0_active_org`-cookie of `?org=<slug>` kan een ingelogde bezoeker vrij tussen alle orgs wisselen en data lezen of schrijven via service-role. Dat is bewust (RAG-tuning met fake data). Meld het niet als bug en "fix" het niet ongevraagd. Daaruit volgt:

- **Nooit echte klantdata in een V0-org.**
- De widget-routes (`/embed/[slug]`, `/widget.js`, `/api/v0/chat`, `/api/v0/widget/*`, `/api/v0/contact-request`) vallen buiten de wachtwoord-gate. Ze worden beschermd door een kortlevend HMAC embed-token (fail-closed, `EMBED_TOKEN_SECRET`), een origin-lock en een rate-limit.
- Uitzondering: `v0_contact_requests` (migr 0053) bevat **echte bezoekers-PII**. Dat is geaccepteerd met vangrails (zie `docs/AGENT_LANDMIJNEN.md` § Widget & embed). Breid dat niet uit. Zie je dat een van die vangrails ontbreekt of PII buiten die tabel lekt: **wél melden**. Alleen de gewone org-switch is by-design.

## Zelf doen of eerst vragen

Default: **handel zelf.** Het onderscheid:

| | Wanneer |
|---|---|
| **Plan voorleggen vóór je bouwt** | datamodel/migraties · RLS, auth, service-role · widget-API-contract · twijfel over scope of V0-vs-V1 · open beslissingen (`V2_SCOPE_EN_PRINCIPES.md` §7) · nieuwe library |
| **Vraag akkoord in de chat, voer het dan zelf uit** | onomkeerbaar of extern: mergen, `LATEST_BOT_VERSION` promoveren (raakt V1-productie, purge daarna de cache), prod-DB-writes buiten `npm run migrate*`, billable runs (evals, crawls), Vercel-env, mails versturen |
| **Gewoon doen** | al het andere: code-organisatie, types, UI binnen shadcn/ui, SQL binnen de constraints, refactors, tests, worktrees, builds, CLI-werk |

- Een goedgekeurd migratieplan dekt ook het draaien ervan: daarna mag je `npm run migrate` / `migrate:v1` zelf uitvoeren.
- **Staande toestemming:** kleine V0- of tooling-fixes (geen datamodel, security, widget-API of V1) mag je zelf mergen en deployen. Meld het achteraf.
- Geef Sebastiaan geen handmatige "typ dit / klik daar"-stappen voor iets wat je zelf kunt (SQL, migraties, redeploy, env via CLI).
- **Minimaal eerst:** lever precies de gevraagde scope. Is je diff groter dan 2× de spec, trim dan eerst en vraag of er meer bij moet.
- Verifieer review-bevindingen zelf vóór je ze fixt; reken op ~2 false positives per review.
- Zeg expliciet of je een vastgelegde keuze volgt of zelf kiest.

## Werkwijze

- **Sessiestart:** de SessionStart-hook doet `git fetch` en geeft een briefing (branch, achterstand, open PR's, andere worktrees). Hij doet géén `git pull`: vraag eerst of dat veilig is.
- **Parallelle sessies = worktrees.** Twee sessies in één map racen op branches en edits. Vraag vóór je eerste codewijziging of er een worktree moet komen, ook bij een kleine fix (default: ja; vraag of hij in `Documents/Code/` of in `.claude/worktrees/` moet staan). De staande merge-toestemming gaat over mergen, niet over de werkmap. Gebruik in een worktree relatieve paden: een absoluut pad naar de hoofdrepo schrijft in de verkeerde branch. Een worktree heeft een eigen `npm ci`, een gekopieerde `.env.local` en een eigen poort nodig.
- **Branches:** `feat/seb/<beschrijving>`, kort levend, nooit direct op `main`. Een pre-push-hook blokkeert pushen naar `main`; gebruik `--no-verify` nooit ongevraagd. Check `git rev-parse --abbrev-ref HEAD` vlak vóór elke commit.
- **Definition of Done:** `npm run typecheck` + `npm run build` groen (op Windows eerst `.next/` wissen na een dev-server), en het gedrag geverifieerd via een test, Playwright of de browser. Daarna `gh pr create` met `.github/pull_request_template.md` volledig ingevuld, geschreven voor iemand die niet bij het gesprek was.
- **UI-wijziging niet zichtbaar?** Wis eerst `.next/` en herstart de dev-server vóór je op bugjacht gaat.
- **Na een merge:** `git branch -D <branch>` (squash-merge, dus `-d` faalt altijd), `git push origin --delete <branch>`, `git worktree remove ../chatmanta-<doel>`.
- **Sessie-einde:** `/close` (of `/close all`) en meld of de sessie veilig dicht kan. Moet het werk later verder: `/handoff` (komt in `docs/handoffs/`).

## Commando's

- **Snelle check:** `npm run verify` (typecheck + unit-tests), daarna `npm run build`.
- **Migraties:** de eigen runner gebruiken, nooit `supabase db push`. V0: `npm run migrate` / `migrate:status`. V1: `npm run migrate:v1` / `migrate:v1:status`. V0 en V1 hebben elk een eigen nummerreeks. Kies het nummer met de `/check-migration`-skill (die checkt lokaal én open PR's). Bestaande dubbele V0-nummers niet hernoemen.
- **Evals** (billable, gebruik bij voorkeur de `eval-runner`-agent; "de eval" zonder nadere aanduiding = `eval:run-all`): `npm run eval:run-all` vóór een RAG-PR, `npm run eval:hard:run -- --versions=<v>` voor de harde dimensie, `npm run v1:eval`. De answer-cache vervuilt evals na een promptwijziging, dus eerst wissen (`npm run v0:clear-cache`).
- **Isolatietests:** `npm run v0:test-org-isolation`, `npm run v1:test-org-isolation`.

## Bronnen

Bij conflict: **code + migraties** > "Besliste keuzes" in `docs/V1_STATUS_EN_PLAN.md` > `docs/V2_SCOPE_EN_PRINCIPES.md`. Docs kunnen achterlopen; de code is de waarheid.

- `docs/V2_SCOPE_EN_PRINCIPES.md`: scope-grens V1/V2/V3, billing/AVG/security-principes (SA-6..14), open beslissingen.
- `docs/V1_STATUS_EN_PLAN.md` + `docs/V1_LAUNCH_TODO.md`: V1-beslissingen en wat er nog vóór launch moet.
- `docs/AGENT_LANDMIJNEN.md`: niet-voor-de-hand-liggende valkuilen. **Lees vóór werk in een gebied de bijbehorende sectie:** Stack & Build · Supabase & migraties · V0→V1-porting · RAG & evals · Widget & embed · Crawler · E-mail & crons · Git & parallel werk.
- De oorspronkelijke blueprint en het bouwplan (mei 2026) zijn historisch archief buiten de repo en niet meer leidend. Heb je de motivatie achter een oude keuze nodig: vraag het Sebastiaan.
