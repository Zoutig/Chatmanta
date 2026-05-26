# Embeddable widget — design (V0 sandbox)

**Datum:** 2026-05-25
**Branch:** `feat/seb/widget-embed`
**Status:** ontwerp — wacht op review

## 1. Doel

De klantendashboard-widget *daadwerkelijk* embeddable maken zodat we kunnen oefenen
en verifiëren dat de chatbot op een **externe pagina** verschijnt — ook zonder ingelogd
te zijn op de V0-demo (zoals op een echte klant-site). Gescoped op een specifieke org.

Vandaag is de embed-snippet een placeholder: hij wijst naar een `widget.js` die nergens
bestaat (zie `app/klantendashboard/widget/components/widget-form.tsx:58` en
`app/components/embed-view.tsx`). De volledige chat-widget-UI bestaat al wél
(`app/widget/components/chatmanta-widget.tsx`), maar zit achter de V0-wachtwoord-gate.

## 2. Scope

**In scope:**
- Een statische loader `public/widget.js` die een `<iframe>` injecteert.
- Een nieuwe publieke route `/embed/[slug]` die *alleen* de bestaande `ChatMantaWidget` rendert.
- Minimale toevoeging aan `ChatMantaWidget`: een resize/visibility-signaal naar de parent.
- Beveiligingslaag: signed embed-token + origin-lock + behoud van rate-limiting (fail-closed).
- `proxy.ts`: `/embed` en `/api/v0/chat` uit de wachtwoord-redirect halen; de chat-route
  doet voortaan zelf dual-auth (cookie OF token).
- De klantendashboard-snippet (`widget-form.tsx`) werkend + origin-aware maken.
- **Echte installatie-detectie** via heartbeat-ping: de embed-iframe pingt bij load;
  de Live-status in het dashboard toont echte `lastSeenAt` + domein i.p.v. mock.

**Expliciet buiten scope (YAGNI / V1):**
- `app/components/embed-view.tsx` (V0-admin right-panel preview) — blijft ongewijzigd.
- Server-side actieve probe (server fetcht de klant-URL en grept de snippet) — fragiel
  (CORS/SSR/CSR), niet nodig: de ping-heartbeat bewijst installatie betrouwbaarder.
- CORS + per-chatbot public token + origin-allowlist als productie-model — V1 Fase 6/7.
- Per-org dag-budget (EUR) — V1 (V0 verzamelt alleen telemetrie).
- Productie-CDN (`cdn.chatmanta.nl`). De loader wordt vanaf de app-origin geserveerd.

## 3. Architectuur (iframe-loader)

```
Externe klant-pagina (bv. test.html op file:// of evil-ander-domein.nl)
  └─ <script src="https://<origin>/widget.js" data-org="acme-corp" defer>
       │ leest data-org + leidt <origin> af uit currentScript.src
       ▼
     injecteert <iframe src="https://<origin>/embed/acme-corp">  ── same-origin t.o.v. de API
       │
       ▼  (in de iframe, op chatmanta's origin)
     /embed/[slug]?h=<parent-host>  →  rendert <ChatMantaWidget orgSlug="acme-corp" ...>
                       + injecteert kortlevend embed-token (server-side)
       │  bij load  → POST /api/v0/widget/ping  (token + parent-host)  ── heartbeat
       │  FAB open/dicht → postMessage({type:'chatmanta:resize', state}) → parent
       ▼
     widget chat-fetch  POST /api/v0/chat?org=acme-corp
                        header: x-chatmanta-embed: <token>
                        (same-origin → geen CORS)
```

De loader geeft de host van de parent-pagina mee als query-param `?h=` op de iframe-src
(display-only telemetrie, niet security-kritisch). De embed-pagina leest die en stuurt 'm
mee in de ping zodat het dashboard kan tonen op welk domein de widget draait.

Waarom iframe: hergebruikt 100% de bestaande React-widget, geeft CSS/JS-isolatie op de
klant-site (geen stijl-botsingen), en houdt de chat-fetch *same-origin* (geen CORS).
Dit is het patroon van Intercom/Crisp/Drift.

## 4. Componenten

### 4.1 `public/widget.js` (statische vanilla-loader, ~50 regels, geen build)
- Leest `data-org` van zijn eigen `<script>`-element (`document.currentScript`).
- Leidt de app-origin af uit `currentScript.src` → werkt op `localhost:3000` én prod
  zonder hardcode.
- Idempotent: bij dubbel-include doet de tweede run niets (guard via een global flag).
- Injecteert één `position:fixed` `<iframe>` met `title="Chat"`, transparante achtergrond,
  `allow`-niets, hoge `z-index` (2147483000), en `src = <origin>/embed/<slug>`.
- Start in **collapsed**-formaat (klein, ~96×96 in de gekozen hoek).
- Luistert op `message`-events: accepteert alleen berichten waarvan `event.origin === <app-origin>`
  en `data.type === 'chatmanta:resize'`. Schakelt de iframe tussen collapsed en open
  (open ≈ `min(420px, 100vw)` × `min(640px, 100vh)`), met side (left/right) uit het bericht.

### 4.2 `app/embed/[slug]/page.tsx` (+ minimale layout)
- Hergebruikt de org-resolutie + settings-load van `app/widget/[slug]/layout.tsx`:
  kleuren, logo, positie, welcomeMessage, startervragen via `getOrgSettings(slug)`.
- Onbekende slug (niet in `ORG_SLUGS_WIDGET`) → `notFound()` (404).
- Rendert **alleen** `<ChatMantaWidget orgSlug=... embedded />` — geen `FakeSite`-chrome.
- `<body>` transparant; geen scrollbars; widget zelf is `position:fixed`.
- Server-side: genereer een embed-token (zie 4.5) en geef het door aan de widget
  (via prop of een `<script>`-injected global). Token is org-gebonden.

### 4.3 `ChatMantaWidget` — minimale toevoeging
- Nieuwe optionele props: `embedded?: boolean` en `embedToken?: string`.
- Wanneer `embedded`: bij open/dicht-toggle een `window.parent.postMessage(
  {type:'chatmanta:resize', state: open ? 'open' : 'collapsed', side: position}, <app-origin>)`.
- Wanneer `embedToken` gezet: voeg `x-chatmanta-embed: <token>` toe aan de chat-fetch-headers.
- Geen wijziging aan het org-pad: `?org=<slug>` werkt al (`getActiveOrgId` leest query eerst).
- Niet-embedded gedrag blijft identiek (geen regressie op `/widget/[slug]`).

### 4.4 `proxy.ts` — gate-architectuur
- Matcher-exclusies uitbreiden: `/embed/...` en `/api/v0/chat` worden NIET meer naar
  `/login` geredirect. (Naast bestaande `/login`, `/api/v0/cron`, static assets.)
- De auth-beslissing verhuist daarmee *in* de chat-route (4.6). De `/embed`-pagina is
  publiek (cheap render, geen LLM).

### 4.5 `lib/v0/server/embed-token.ts` (nieuw, geen DB/migration)
- `createEmbedToken(slug): string` — `base64url(payload).base64url(hmacSHA256(payload, secret))`,
  payload = `{ slug, exp }` met `exp = now + TTL` (TTL ~30 min, env `EMBED_TOKEN_TTL_SEC`).
- `verifyEmbedToken(token, slug): boolean` — constant-time HMAC-vergelijk, check `exp`
  niet verstreken, check `payload.slug === slug`.
- Secret uit `EMBED_TOKEN_SECRET`. **Ontbreekt de secret → `verifyEmbedToken` retourneert
  altijd false en `createEmbedToken` throwt** (fail-closed: het ongate-pad gaat dan dicht,
  ingelogde paden blijven werken).

### 4.6 `app/api/v0/chat/route.ts` — dual-auth gate
- Vóór de bestaande pipeline, ná de rate-limit-check, een auth-gate toevoegen:
  ```
  hasCookie = verifyAuthCookieValue(cookie uit AUTH_COOKIE)   // bestaande lib
  orgSlug   = resolveOrgSlugFromId(getActiveOrgId(req))        // bestaat al
  tokenOk   = verifyEmbedToken(req.headers.get('x-chatmanta-embed'), orgSlug)
  originOk  = origin/referer-host === app-host (of afwezig bij same-origin GET→POST)
  if (!hasCookie && !(tokenOk && originOk)) → 401 (AppError 'UNAUTHORIZED')
  ```
- Rate-limit (`getRateLimiter().check(ip)`, 30/min/IP) blijft staan en draait al vóór auth
  zodat ook afgewezen requests begrensd zijn.
- Geen regressie: ingelogde admin/test/`/widget`-paden hebben `hasCookie === true`.

### 4.7 `widget-form.tsx` — werkende snippet
- Snippet wordt origin-aware (gebruik `window.location.origin`, client component):
  `<script src="<origin>/widget.js" data-org="<slug>" defer></script>`.
- `data-org=<slug>` i.p.v. de niet-resolvebare `data-chatbot-id`-UUID.
- `workspaceId`-prop → vervangen door de org-slug (uit `activeOrg.slug`).

### 4.8 Installatie-detectie (heartbeat-ping)
- **`WidgetSettings`-type uitbreiden** (`lib/v0/klantendashboard/types.ts`, geen migration —
  jsonb partial-merge): `lastSeenAt: string | null` (laatste ping) + `installOrigin: string | null`
  (host waar gezien). Mock-defaults (`lib/v0/klantendashboard/mock/widget-settings.ts`) → beide `null`.
- **`app/api/v0/widget/ping/route.ts` (nieuw, publiek pad):**
  - Zelfde gate als chat: rate-limit (per-IP) → embed-token + origin-lock; faalt → 401, geen write.
  - Body: `{ host?: string }` (de parent-host uit `?h=`). Validatie: max 255 chars, alleen
    hostname-tekens; anders genegeerd (`installOrigin` blijft ongewijzigd).
  - Schrijft via `saveWidgetSettings(slug, { lastSeenAt: nowIso, installOrigin: host ?? prev, isInstalled: true })`.
  - Response 204 (geen body). Cheap: geen LLM, één jsonb-upsert.
- **Embed-pagina pingt bij load** (`app/embed/[slug]`): client-glue doet één
  `fetch('/api/v0/widget/ping', { method:'POST', headers:{'x-chatmanta-embed':token}, body: JSON.stringify({host}) })`
  na mount. `host` uit `new URLSearchParams(location.search).get('h')`. Best-effort (fouten geslikt).

### 4.9 Live-status echt maken (`widget-form.tsx` + server-action)
- **`checkWidgetInstallationAction()` (nieuw, `app/klantendashboard/actions.ts`):** leest
  settings, berekent `installed = lastSeenAt !== null && (now - lastSeenAt) < WINDOW`
  (`WINDOW` = `WIDGET_INSTALL_FRESHNESS_SEC`, default 7 dagen). Persisteert
  `{ isInstalled: installed, lastCheckedAt: nowIso }` zodat de status niet eeuwig "Ja" blijft
  als de widget weken niet gezien is. Returnt `{ isInstalled, lastSeenAt, installOrigin, lastCheckedAt }`.
- **`widget-form.tsx` Live-status sectie:** "Installatie testen"-knop roept
  `checkWidgetInstallationAction()` aan (i.p.v. de mock `persist({isInstalled:true,...})`).
  Toon `installOrigin` als extra cel ("Gezien op: jouwwebsite.nl") wanneer aanwezig.
  "Gevonden op website" + StatusBadge + "Laatste check" lezen voortaan de echte returnwaarde.
- `isActive` (pauzeren/activeren) blijft een gewone settings-write zoals nu.

## 5. Beveiligingsmodel (samenvatting)

| Laag | Wat | Tegen |
|---|---|---|
| Embed-token | kortlevend, org-gebonden HMAC; vereist op ongate-pad | direct `curl` op de chat-API; cross-org misbruik |
| Origin-lock | `Origin`/`Referer`-host moet de app zijn op ongate-pad | browser-misbruik vanaf vreemde sites |
| Rate-limit | 30/min/IP (env `RATE_LIMIT_PER_MIN`); Upstash-globaal via `USE_UPSTASH=true` | scripted abuse / cost-explosie |
| Fail-closed | geen `EMBED_TOKEN_SECRET` ⇒ ongate-pad dicht | misconfiguratie die de API per ongeluk opent |
| Sandbox-grens | alleen `ORG_SLUGS_WIDGET` (fake data) | echte klantdata (mag nooit in V0) |

**Restrisico (bewust geaccepteerd, V0):** een vastberaden aanvaller kan een token van de
publieke `/embed`-pagina scrapen. Het token is kort, org-gescoped, en de chat blijft per-IP
rate-limited. V1 vervangt dit door origin-allowlist + per-chatbot token + dag-budget.

## 6. Env-vars
- `EMBED_TOKEN_SECRET` (verplicht voor embed-pad; willekeurige 32+ byte string)
- `EMBED_TOKEN_TTL_SEC` (optioneel, default 1800)
- `USE_UPSTASH=true` + `UPSTASH_REDIS_REST_URL` / `_TOKEN` (aanbevolen vóór prod-blootstelling)
- `INJECTION_MODE=block` (optioneel scherper op het publieke pad)
- `WIDGET_INSTALL_FRESHNESS_SEC` (optioneel, default 604800 = 7 dagen)

## 7. Error-handling
- Chat-API zonder geldige auth → 401 `UNAUTHORIZED`; de widget toont al
  "Even inloggen op de demo-omgeving…" bij 401/403 — copy aanpassen naar een neutrale
  "deze chat is even niet beschikbaar"-melding voor de embed-context.
- Token verlopen midden in een sessie → 401; widget kan de embed-pagina herladen
  (out-of-scope auto-refresh; voor nu: melding + retry).
- Onbekende slug op `/embed` → 404.
- `widget.js` geladen zonder `data-org` → loader doet niets + `console.warn`.

## 8. Testplan
- **Unit:** `embed-token` — round-trip, verlopen token, verkeerde slug, ontbrekende secret (fail-closed).
- **Handmatig (kerndoel):** snippet uit klantendashboard kopiëren → in een los `test.html`
  plakken → openen in een **incognito**-venster (geen demo-cookie) → FAB verschijnt → chat
  werkt en is gescoped op de juiste org. Daarna `curl` op `/api/v0/chat?org=...` zonder token
  → 401 bevestigen.
- **Installatie-detectie:** met de test.html nog open → in het dashboard "Installatie testen"
  klikken → "Gevonden op website: Ja" + "Gezien op: <host>" + verse "Laatste check". `curl` op
  `/api/v0/widget/ping` zonder token → 401, geen state-wijziging.
- **Regressie:** ingelogd `/widget/<slug>` chat werkt nog (cookie-pad), admin-testtool werkt nog.
- **Build:** `next build` groen (metadata-route / outputFileTracing-valkuilen).

## 9. Open vragen (bewust uitgesteld)
- Auto-refresh van verlopen token tijdens lange sessies — V1.
- Meerdere widgets/iframes op één pagina — niet ondersteund in V0 (loader is single-instance).
- Mobiel fullscreen-paneel binnen iframe-resize — de open-grootte dekt `100vw×100vh` af;
  fijn-tunen tijdens handmatige test.
