# M-B — Widget publieke laag (V1, port van V0)

**Branch:** `feat/seb/v1-widget` · **Worktree:** `../chatmanta-v1-widget` · **Migratie:** `0008` (schrijven, NIET toepassen).

## Doel
De **eerste klant-zichtbare V1-chat**: een embeddable widget op externe sites. Vanilla loader → iframe → publieke, token-gated streaming chat op gpt-4o-mini. Port het bewezen V0-precedent; **raak V0 NIET aan** (V0's `/embed`, `/api/v0/chat`, `/widget.js` blijven live). Per-org configureerbare styling (Seb's keuze). `allowed_domains` Jorion-beheerd.

## Hard rules
- **V0 ongemoeid:** geen edits in `lib/v0/**`, `app/api/v0/**`, `app/embed/**`, `app/widget/**`, `public/widget.js`, `/v0`. Bouw V1-parallelle paden.
- **Geen sessie in een third-party iframe** → de publieke chat resolvet org+chatbot uit het **HMAC-gesigneerde embed-token** (niet uit client-input) en draait `runRagQuery` met de **V1-service-role-client** + expliciete `organizationId`+`chatbotId`. Dit is de isolatie (zoals V0). De slug in het token is gesigneerd → niet te vervalsen (SA-1 voldaan: geen ongesigneerde client-input op het service-role-pad).
- **Fail-closed token** (geen `EMBED_TOKEN_SECRET` → mint throwt, verify=false → ongate-pad dicht).
- **`organization_id`+`chatbot_id` NOT NULL** overal; geen secrets in `NEXT_PUBLIC_*`.
- **`sourceLinksEnabled` UIT voor de widget** (document-only RPC levert geen source_url; §1.5-V2). Override per-call, flip de gedeelde const niet (dashboard wil 'm wél).
- **lib/rag-grep-gate** blijft groen (we voegen niets toe aan lib/rag).

## Naamgeving (collision-vrij naast V0 — KRITISCH)
V0 bezit `/embed/[slug]`, `/api/v0/chat`, `/widget.js`. V1 krijgt eigen paden:
- Embed-pagina: **`app/embed-v1/[slug]/page.tsx`** (top-level; valt al onder de bestaande `embed`-prefix-exemptie in `proxy.ts`).
- Loader: **`public/widget-v1.js`** → geserveerd op `/widget-v1.js`. **NIET `v1-widget.js`** (dat begint met `/v1` → zou de Supabase-sessie-branch in `proxy.ts` raken).
- Chat: **`app/api/v1/chat/route.ts`**. Token: **`app/api/v1/widget/token/route.ts`**. Ping (optioneel, zie §G): **`app/api/v1/widget/ping/route.ts`**.

## Build — onderdelen

### A. Migratie `supabase/migrations-v1/0008_v1_widget_allowed_domains.sql` (schrijven, niet toepassen)
```sql
-- Widget allowed-domain allowlist per chatbot. Jorion-beheerd (geen klant-editor,
-- §1.5 #13) — de admin-deep-dive (M-D) krijgt de editor; in M-B via service-role/seed.
-- text[]; leeg/NULL = fail-open (geen lock), exact-match-na-normalisatie anders.
alter table public.chatbots
  add column if not exists allowed_domains text[];
comment on column public.chatbots.allowed_domains is
  'Toegestane parent-hosts voor de embed-widget (genormaliseerd, zonder www/scheme/port). NULL/leeg = geen lock (fail-open). Jorion-beheerd.';
```
Geen nieuwe policy (kolom op bestaande RLS-tabel; chatbots-writes zijn service-role-only).

### B. `lib/v1/widget/embed-token.ts` (port van `lib/v0/server/embed-token.ts`)
Kopieer `lib/v0/server/embed-token.ts` **1:1** naar `lib/v1/widget/embed-token.ts` (zelfde wire-format, zelfde `EMBED_TOKEN_SECRET`, zelfde TTL-env). Reden voor een eigen kopie i.p.v. importeren: het V0-bestand staat onder `lib/v0/**` (mag V1 niet leunen op per conventie; en het is `server-only`). Identieke logica, geen gedragsverschil. *(Het secret `EMBED_TOKEN_SECRET` is gedeeld — staat al op Vercel/`.env.local`, fail-closed startup-assert bestaat al in V0; zie §I voor de V1-assert.)*
- **TTL:** Seb's keuze noemde "1u"; V0-default is 30 min. Houd de V0-default (`EMBED_TOKEN_TTL_SEC` || 30 min) — de widget refresht automatisch op 401. (Flag in Eindlijst als Seb expliciet 1u wil → env `EMBED_TOKEN_TTL_SEC=3600`.)

### C. `proxy.ts` — voeg V1-publieke exempties toe (alleen TOEVOEGEN, V0-alternatieven niet wijzigen)
In de matcher-negative-lookahead, naast de bestaande V0-entries, voeg toe: `api/v1/chat`, `api/v1/widget`, `widget-v1\.js$`. (`embed-v1/*` valt al onder de bestaande `embed`-prefix — laat een comment achter dat dit bewust is.) Comment: deze V1-routes doen zelf dual-auth (embed-token + origin-lock), net als de V0-tegenhangers. **Let op:** `/api/v1/*` begint met `/api` (niet `/v1`) → raakt de `updateSession`-branch niet; goed.

### D. `app/api/v1/widget/token/route.ts` (port van `app/api/v0/widget/token/route.ts`)
`GET`. Mint een refresh-token. Verschillen t.o.v. V0:
- Org-resolutie: **uit `?org=<slug>`** (de embed-iframe kent z'n slug) → resolve org via **service-role** (`getV1ServiceRoleClient`) `organizations.select('id').eq('slug', slug).is('deleted_at', null)`; bestaat niet → 401. (V0 las cookie/KNOWN_ORGS; V1 leest de DB-slug.)
- **Origin-lock:** request `Origin`/`Referer` host === de ChatManta-host (`sameOrigin(req)` — port het V0-helpertje). Cross-origin → 401.
- **Rate-limit per IP** (V0 `getRateLimiter` is V0-bound; M-C bouwt de V1-rate-limit. Voor M-B: een minimale per-IP-guard — of laat de IP-rate-limit aan M-C over en doe in M-B alleen origin-lock + 503-bij-geen-secret. **Ponytail: laat de rate-limit aan M-C** (de hele rate-limit-laag is één slice); M-B doet origin-lock + token-mint. Noteer de seam.)
- Geen secret → **503** (niet 401 — de widget retry-loopt alleen op 401/403).
- Mint via `lib/v1/widget/embed-token.ts` `createEmbedToken(slug)`. Return `{token}`, `Cache-Control: no-store`.

### E. `app/api/v1/chat/route.ts` (port van `app/api/v0/chat/route.ts` — de kern)
`POST`, `runtime='nodejs'`, `maxDuration=60`. **NDJSON-stream** (`application/x-ndjson`), één JSON-object per regel: eerst `{kind:'meta', queryLogId, requestId}`, daarna de `StreamEvent`s uit `runRagQuery`. Auth-keten (volgorde):
1. **embed-token + origin-lock:** `verifyEmbedToken(req.headers.get('x-chatmanta-embed'), slug)` (slug uit `?org=`) **EN** same-origin host-check. Faalt → 401. (Geen V0-demo-cookie-pad in V1 — puur token.)
2. JSON parse (`MAX_QUESTION_CHARS=8000`, history cap 16×4000 zoals V0).
3. **(seam voor M-C:** per-org rate-limit + budget-cap komen hier — laat een `// M-C: rate-limit + budget hier` comment; bouw ze NIET in M-B.)
4. Resolve org+chatbot uit de **gesigneerde slug** via service-role: org by slug → actieve chatbot (`getOrgChatbot`-equivalent met service-role-client; let op: `getOrgChatbot` in `app/v1/app/rag-config.ts` neemt een client-arg → herbruikbaar met de service-role-client). Geen chatbot → nette fallback/`error`-event.
5. Settings → overrides: `getChatbotSettings(serviceClient, chatbot.id)` + `buildV1ChatbotInputs` (herbruik uit `app/v1/app/instellingen/settings-config.ts`).
6. `config = {...V1_RAG_DEFAULTS, version: chatbot.bot_version, sourceLinksEnabled: false}` (widget-override).
7. Stream `runRagQuery(serviceClient, { question, threshold, enableRewrite, config, persona, organizationId, chatbotId, history, tone, length, chatbotOverrides, serviceClient })` → schrijf elk event als NDJSON-regel. **GK + injection: fail-closed** voor publieke callers (geen `enableGeneralKnowledge`; injection-detectie zoals V0 publiek → block). *(Injection-detectie: port de V0-aanpak indien aanwezig in de engine/route; zo niet beschikbaar zonder lib/v0, doe minimaal de length-cap + laat GK uit. Flag wat je overslaat.)*
8. **Logging** in `after()`: bouw `finalResponse` (merge `followups-done`/`metrics-done` zoals askV1/M-A) → `logRagQuery(getV1ServiceRoleClient(), { question, response: finalResponse, organizationId, chatbotId, ipHash: hashIp(getClientIp(req)), requestId })`. Gebruik **M-A's** `logRagQuery` + `hashIp` (al op main). Genereer `queryLogId` upfront (crypto.randomUUID) en stuur 'm in het `meta`-event + geef door als `overrideId`.
- **getClientIp:** port het V0-helpertje (`x-forwarded-for` eerste hop) of inline; geen lib/v0-import.

### F. `app/embed-v1/[slug]/page.tsx` + `embed-client.tsx` + `embed-blocked.tsx` (port van `app/embed/[slug]/*`)
- `force-dynamic`. Resolve org via service-role by slug; bestaat niet → `notFound()`.
- **allowed-domain-check:** lees `chatbots.allowed_domains` (service-role, via de org's actieve chatbot) + `parentHost = referer ?? ?h=`; `evaluateEmbedAccess(allowed, parentHost)` uit **`lib/widget/origin-allowlist.ts`** (neutraal — direct herbruikbaar). `block` → render `EmbedBlocked` (geen widget, geen token). `open`/`allow` → mint `createEmbedToken(slug)` + render de widget-client.
- Lees `chatbots.settings` → widget-appearance (accentColor/position/headerTitle/welcomeMessage/launcherText) door naar de client-component.
- `embed-client.tsx`: rendert `<V1Widget {...props} embedToken slug />` in een `ClientErrorBoundary` (of minimaal try). (Ping-heartbeat = optioneel; zie §G — mag in M-B weg als je 'm niet bouwt.)

### G. `app/embed-v1/[slug]/v1-widget.tsx` (de widget-component) + `public/widget-v1.js` (loader)
**Ponytail-scope: §1.5-minimale widget, per-org styling — GEEN V0-extra's.** Bouw een gefocuste V1-component (NIET de hele V0 `ChatMantaWidget` met org-skins/thread-drawer/feedback/contact). Herbruik de **neutrale** `lib/widget/*`-helpers (verifieer dat ze geen `lib/v0` importeren): `render-markdown-lite` (`cleanWidgetAnswer`/`renderMarkdownLite`), `visitor-id` (`getOrCreateVisitorId`), `contrast` (`bestForegroundOn`). Zo niet-neutraal → kopieer de functie.
- **Component:** FAB-launcher (kleur/positie uit settings) → chat-paneel → bericht-lijst → input. **Streaming:** POST `/api/v1/chat?org=<slug>` met headers `x-chatmanta-embed: <token>` + `x-chatmanta-visitor: <id>`, body `{question, version, history}`; parse NDJSON-regels; render de `answer-delta`/terminal events. **Token-refresh op 401/403:** GET `/api/v1/widget/token?org=<slug>` → nieuw token → retry één keer (port `refreshEmbedToken` uit de V0-component).
- **postMessage:** emit `{type:'chatmanta:ready'}` + `{type:'chatmanta:resize', state, side}`; luister `{type:'chatmanta:host', mobile}` (port uit V0 — lost de iframe-matchMedia-valkuil op, zie [[widget_embed_iframe_gotchas]]).
- **SKIP (V2 / niet §1.5):** thread-history-drawer, thumbs-feedback, contact-request, fake-site-chrome, org-skins. Flag in de PR wat je oversloeg.
- **Loader `public/widget-v1.js`:** port `public/widget.js` 1:1 maar: `iframe.src = origin + '/embed-v1/' + org + '?h=' + host (+ '&m=1' mobiel)`; `data-org` attribuut (of `data-chatbot`); origin-checked postMessage. (`origin` = `new URL(script.src).origin`.)

### H. `app/v1/app/instellingen/*` — widget-appearance-sectie (klant-editor)
Voeg aan de V1-klant-settings een **"Widget"-sectie** toe: accentColor (kleurkiezer), position (links/rechts), headerTitle, welcomeMessage, launcherText. Persisteer in `chatbots.settings` jsonb (bestaat). Voeg de velden toe aan `V1_DEFAULT_CHATBOT_SETTINGS` + `mergeChatbotSettings` (defensieve coercion) + de **`ALLOWED_PATCH_FIELDS`-whitelist** (anders dode knoppen). **NIET** `allowed_domains` (Jorion-beheerd → M-D-admin). De embed-pagina (§F) leest deze velden.
> Houd het minimaal: 5 velden, hergebruik de bestaande settings-form-patronen. Geen logo-upload (V2).

### I. V1 startup-assert: `IP_HASH_SALT` (M-A-review-vervolg)
De publieke widget logt nu **echte bezoeker-IP's** (gehasht). Voeg aan de V1-startup-assert (zoek de bestaande — V0 heeft `lib/v0/server/startup-assert.ts`; V1 heeft een eigen env-assert sinds PR-3 §3, vind 'm) een **WARN** (niet hard-fail) toe als `IP_HASH_SALT` ontbreekt: zonder salt is de IP-hash zwakker pseudonimiseerbaar. Hard-fail zou de boot breken tot de ops-env staat → daarom WARN + harde flag in de Eindlijst. *(Als er geen schone V1-assert-plek is, sla deze stap over en flag 'm puur in de Eindlijst — geen nieuwe assert-infra optuigen.)*

## Verificatie (alles groen; GEEN billable LLM/embedding-calls)
1. `npx tsc --noEmit`
2. `Remove-Item -Recurse -Force .next; npm run build` (let op: de embed-pagina + loader moeten bouwen; geen SSG-crash).
3. `npm run test:unit` (grep-gate + bestaande tests groen; voeg een klein testje toe als je niet-triviale logica buiten een component schrijft, bv. een origin-lock/sameOrigin-helper).
4. **Schrijf** een non-billable smoke-plan in de PR-omschrijving (de orchestrator doet de live browser-smoke ná migratie 0008 + het zetten van `allowed_domains`/settings via service-role). Bouw GEEN script dat een echte chat-LLM-call doet.

## Commit & PR
Bouw in volgorde A→I, **commit per chunk** (backend B-E eerst + `tsc`, dan frontend F-H, dan I). Niet pushen, geen PR, migratie 0008 NIET toepassen. Rapporteer: files, tsc/build/test-output, wat je oversloeg (V2-extra's), en elke V0-aanname die niet klopte.
