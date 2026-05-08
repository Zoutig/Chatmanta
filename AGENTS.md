<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ChatManta — agent-context

ChatManta is een website-chatbot SaaS van Jorion Solutions. Knowledge-bot voor MKB op basis van RAG over websitecontent + documenten. Pre-build (V1).

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
- **Object-level access (SA-1)**: `requireXxxAccess(id)` voor elke server action met client-input ID — RLS alleen is niet genoeg bij service-role-paden.
- **Vector search isolation**: `orgId` + `chatbotId` als verplichte (niet-optionele) parameters; soft-delete-filter via JOIN.
- **Geen secrets in `NEXT_PUBLIC_*`** of in client components.
- **Anti-hallucinatie boven volledigheid**: similarity threshold + fallback-pad zonder LLM-call bij geen relevante chunks.

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

## Stack (V1)

- Next.js 14+ App Router + TypeScript + shadcn/ui + Tailwind
- Supabase (Postgres + Auth + Storage + pgvector), West Europe region
- Anthropic Claude Haiku 4.5 als enige actieve LLM (OpenAI als technische fallback in `callLLM()`-laag, niet klant-zichtbaar)
- OpenAI text-embedding-3-small (1536 dim)
- Firecrawl (max 50 pagina's per crawl)
- Vercel hosting + Cron
- Sentry + UptimeRobot + Upstash Ratelimit + Resend

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
