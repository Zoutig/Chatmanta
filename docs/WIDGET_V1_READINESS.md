# Widget V0 → V1 productie-readiness — roadmap

**Datum:** 2026-05-27 · **Status:** levend document (referentie, nog niet ingepland)
**Scope:** wat er moet veranderen om de embeddable widget van het huidige V0-sandbox-niveau naar een productiewaardige V1 te brengen waarop je echte klanten met echte data kunt zetten.

> Dit doc is geschreven door de agent die de V0-embed bouwde (PR #105/#106/#109). Het is bewust een checklist/roadmap, geen kookboek — bij V1-kickoff combineren met [Concept Blueprint v4.0] + Bouwplan Fase 6/7 en de bestaande V1-plannen (zie §Referenties).

---

## 0. Waar we nu staan (V0 — wat werkt)

- **Loader** `public/widget.js` → injecteert een `<iframe>` naar `/embed/[slug]`, met `peek/collapsed/open`-resize via postMessage.
- **Publieke route** `/embed/[slug]` rendert de bestaande `ChatMantaWidget`; werkt voor alle `KNOWN_ORGS`.
- **Beveiliging** van `/api/v0/chat` + `/api/v0/widget/ping`: uit de wachtwoord-gate, beschermd door een kortlevend **embed-token** (HMAC, org-gebonden, fail-closed) + **origin-lock** + per-IP rate-limit.
- **Installatie-detectie** via heartbeat-ping → `v0_org_settings.widget` jsonb (`lastSeenAt`/`installOrigin`).
- **Uiterlijk** (kleuren, logo, positie, teksten) instelbaar via klantendashboard.
- **Werkt cross-origin op elke site** (geverifieerd), maar: alleen demo-orgs met **nepdata**, en de beveiliging is bewust open (token is van de publieke embed-pagina te scrapen).

**De kernconclusie:** technisch embedbaar, maar het is een sandbox. Alles hieronder is wat ontbreekt voor echte klanten.

---

## 1. Multi-tenancy & echte data (fundament — hard rules)

Dit is de grootste verandering en blokkeert al het andere.

- [ ] **Echte orgs per klant** i.p.v. de vaste `KNOWN_ORGS`. Elke klantdata-tabel `organization_id NOT NULL`.
- [ ] **RLS overal** + policies in dezelfde migration per nieuwe tabel (hard rule, AGENTS.md).
- [ ] **Supabase Auth + `organization_members` membership-check** (V1 Phase 1) — vervangt het gedeelde `V0_DEMO_PASSWORD` en de vrije `?org=`/cookie-org-switch.
- [ ] **SA-1 object-level access** (`requireXxxAccess(id)`) op elke server action met client-input ID — activeren (nu bewust uit in V0).
- [ ] **Service-role discipline (SA-5)** blijft: `supabaseAdmin` alleen via `lib/supabase/admin.ts`.
- [ ] **Vector search isolation** met verplichte `orgId` + `chatbotId` (bestaat al; valideren onder echte multi-tenancy).
- [ ] **Migratiepad** van de huidige `v0_org_settings.widget` jsonb naar echte widget-config-tabellen met RLS.

→ Zie memory [[project_v1_strategy]] (in-place, geen greenfield, 2 Supabase-projecten) en [[project_v1_auth_spike]].

---

## 2. Widget-beveiliging naar productieniveau (de embed-specifieke laag)

Het V0-model (scrapebaar embed-token) is bewust open. Voor echte klantbots moet dit dicht.

- [ ] **Per-chatbot publieke key** i.p.v. `data-org=<slug>`. Snippet wordt `data-key=<public_chatbot_key>`. De key identificeert de chatbot zonder secret te lekken.
- [ ] **Origin-allowlist per chatbot.** De klant registreert toegestane domeinen; de chat/ping-API weigert requests waarvan de `Origin`/`Referer` niet in de allowlist staat. Dit is het standaard SaaS-widget-model (Intercom `app_id` + allowed domains) en de échte vervanger van de huidige "origin = chatmanta zelf"-check.
- [ ] **Domeinverificatie** — klant moet bewijzen dat hij het domein bezit dat hij allow-list (DNS-record of meta-tag), anders kan iemand andermans key + eigen domein gebruiken.
- [ ] **Injection block-mode** standaard aan op het publieke pad (`INJECTION_MODE=block`).
- [ ] **Bot/abuse-mitigatie** voor publieke blootstelling: bursts, scraping, geautomatiseerd misbruik. Overweeg lichte proof-of-work of (bij hoog volume) een uitdaging.
- [ ] **Feedback-endpoint** (`/api/v0/feedback`) werkend maken onder hetzelfde key+origin-model — nu gated, dus in embed faalt de 👍/👎 stil.

→ Zie memory [[widget_embed_public_api]] (huidige open state) en [[v1_rate_limit_hardening]].

---

## 3. Kosten & rate-limiting (non-negotiable voor prod)

- [ ] **Per-org EUR dag-budget** als harde cap (hard rule, [[project_budget_limits_v1_v2]]). V0 verzamelt alleen telemetrie; V1 moet daadwerkelijk afknijpen + nette degradatie tonen wanneer het budget op is.
- [ ] **Upstash rate-limiting live** (`USE_UPSTASH=true` + Redis) zodat de limiet **globaal** telt i.p.v. per serverless-instance. Nu effectief N× de limiet onder load.
- [ ] **Per-org / per-chatbot buckets** i.p.v. alleen per-IP (een aanvaller roteert IP's).
- [ ] **Kostenattributie** per org/chatbot (LLM-tokens → EUR) gekoppeld aan de billing-laag.

---

## 4. Widget-levering & caching

- [ ] **Versionering van `widget.js`** zodat fixes meteen doorkomen. Nu kan de browser de oude loader cachen (we liepen hier al tegenaan — gebruiker moest hard-refreshen). Aanpak: immutable, gehashte/geversioneerde loader + een dunne `/widget.js` met korte TTL die naar de juiste versie wijst, óf expliciete `Cache-Control`-headers + cache-busting.
- [ ] **CDN-overweging** (`cdn.chatmanta.nl`) met juiste cache-headers, of bewust vanaf de app-origin blijven serveren met gecontroleerde TTL.
- [ ] **Cache-headers auditen** voor `/widget.js` en `/embed/*` (nu ongecontroleerd).

---

## 5. Provisioning / self-service onboarding

- [ ] **Org-aanmaak-flow**: klant meldt zich aan → org + eerste chatbot worden aangemaakt → genereert de embed-snippet met hún key.
- [ ] **Snippet-generatie in dashboard** omzetten naar `data-key` + getoonde allow-list-domeinen.
- [ ] **Knowledge-ingest per klant** (crawler Fase 5 bestaat al; koppelen aan echte orgs + RLS).
- [ ] **Onboarding-checklist** koppelen aan echte status (bestaat deels in het dashboard).

---

## 6. AVG / privacy / legal

- [ ] **Bezoeker-cookie consent** — de `visitor_id`-cookie + chat-historie raken AVG; consent-flow + duidelijke disclosure in de widget.
- [ ] **Data-retentie** op gesprekken (bewaartermijn + verwijderbeleid per org).
- [ ] **Privacyverklaring + verwerkersovereenkomst** richting klanten (klant = verwerkingsverantwoordelijke, ChatManta = verwerker).
- [ ] **"Powered by ChatManta" + privacy-link** in de widget (deels aanwezig).
- [ ] **Recht op inzage/verwijdering** van bezoekergesprekken.

---

## 7. Widget-UX & product-gaps

- [ ] **A11y-audit** (toetsenbordnavigatie, focus-trap in het paneel, ARIA, contrast).
- [ ] **Mobiel** fijn-tunen binnen de iframe-resize (fullscreen-paneel; nu basaal).
- [ ] **i18n** als je niet-NL klanten wilt.
- [ ] **Conversatie-persistentie** robuuster dan localStorage (server-side, per org, met retentie uit §6).
- [ ] Optioneel: unread-indicator, proactieve berichten, typing-finesse — geen must-have voor launch.

---

## 8. Reliability & ops (Bouwplan Fase 7 — hardening)

- [ ] **Sentry** (error tracking), **UptimeRobot** (uptime), **Resend** (e-mail), **Upstash** (rate-limit) — Phase 7.
- [ ] **Graceful degradation** in de widget wanneer: org over budget, chatbot gepauzeerd/verwijderd, LLM down, token/key verlopen.
- [ ] **Function-timeout/streaming** valideren onder echt klantverkeer (niet alleen 1 testgebruiker).
- [ ] **Monitoring** op de publieke endpoints (misbruik, 4xx/5xx-ratio, kosten-spikes).

---

## 9. Analytics & billing

- [ ] **Per-org widget-analytics** voor de klant (gesprekken, topvragen, deflection/oplos-ratio) — deels aanwezig (Gesprekken, FAQ), koppelen aan echte org-data + kosten.
- [ ] **Billing per gebruik** (tegen het EUR-budget van §3); plan-tiers.

---

## Voorgestelde volgorde

1. **Fundament eerst (§1)** — multi-tenancy + auth + RLS. Zonder dit kan er geen echte klantdata in.
2. **Widget-security (§2) + kosten/rate-limit (§3)** — samen, want publieke blootstelling zonder budget-cap = cost-risico.
3. **Levering/caching (§4)** — klein maar bijt nu al (stale loader).
4. **Provisioning (§5)** — pas nuttig als §1 staat.
5. **AVG (§6)** — parallel, vóór de eerste echte klant live gaat.
6. **Ops/reliability (§8)** — Phase 7, vóór go-live.
7. **UX-polish (§7) + analytics/billing (§9)** — doorlopend / na de eerste klanten.

**Minimale "eerste echte klant"-lat:** §1 + §2 + §3 + §6 + de degradatie-stukken van §8. De rest mag itereren.

---

## Referenties

- AGENTS.md → "Wat NIET ter discussie staat" (V1 hard rules) + Bouwfase-volgorde (Fase 6 widget, Fase 7 hardening).
- Concept Blueprint v4.0 — sectie 1.5 (V1 Minimal Build Scope) + Security Addendum.
- Bestaande memories: `project_v1_strategy`, `project_v1_auth_spike`, `project_v1_launch_plan`, `project_budget_limits_v1_v2`, `v1_rate_limit_hardening`, `widget_embed_public_api`, `phase5_crawler_v1ready`.
- Huidige V0-embed: PR #105 (embed + token-gate), #106 (alle KNOWN_ORGS), #109 (tooltip peek-resize).
