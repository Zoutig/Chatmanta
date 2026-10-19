# 020 — Installatie-tooling: de grotere versnellers voor "widget live op de klantsite"

**Status:** PLAN (19 okt 2026). Nog niets gebouwd. Per fase akkoord van Sebastiaan.
**Grondslag:** het installatie-onderzoek van 19 okt (recon §6 "Time-to-live van de widget") plus de
completeness-critic. De kernbeweringen zijn opnieuw in de bron nagelezen (pad:regel hieronder).
**Raakt:** V1 (widget, embed-route, admin). V0 blijft ongemoeid, tenzij expliciet genoemd.

---

## 0. Samenvatting en aanbeveling

Een widget installeren is technisch al één regel code. Bij de eerste testklant (een Drupal-site) zat
de vertraging niet in de code, maar in **diagnose**: niemand kon zien *waarom* de widget niet
verscheen (paginacache, verkeerd domein, script niet geplakt). Vannacht bouwt de install-branch de
goedkope kant (loader robuuster, betere platforminstructies, "stuur naar je webbouwer" via mailto,
eerlijkere statuslabels, intern installatieprotocol). Dit plan gaat over de zeven grotere
versnellers die daar bewust buiten vallen.

| # | Versneller | Tijdwinst per klant (schatting) | Moeite | Risico | Advies |
|---|---|---|---|---|---|
| 4 | Geblokkeerde embed-pogingen loggen | 15-30 min, bij elke klant met een subdomein/staging | S | laag (met vangrails) | **Bouwen, eerst** |
| 6 | Nieuwe-klant-wizard in de admin | 10-20 min bij **elke** klant + dicht de fail-open-landmijn | M | laag | **Bouwen, tweede** |
| 3 | "Controleer mijn website"-scan | 15-60 min bij elke mislukte installatie (≈ 1 op 3) | M | middel (SSRF) | **Bouwen, derde (admin eerst)** |
| 5 | Wildcard/subdomein-allowlist | ±10 min + een dag wachten, alleen bij multi-subdomein-klanten | M | middel (security-grens) | Uitstellen tot #4 de vraag aantoont |
| 7 | Snippet per mail naar de webbouwer (Resend) | ±5 min t.o.v. mailto | S-M | middel (spam/reputatie, AVG) | Niet nu; mailto (vannacht) volstaat |
| 1 | WordPress-plugin | 5-10 min bij WP-klanten die zélf installeren | L (+ doorlopend onderhoud) | middel (supply chain, review) | Niet nu; trigger: ±10 WP-zelfinstalleerders |
| 2 | GTM-communitytemplate | 0-5 min, zelden | M + contractwijziging | middel | Niet doen; Custom HTML-tag dekt het |

**Aanbeveling: bouw #4 → #6 → #3 (in die volgorde, als drie kleine PR's), en parkeer #5, #7, #1 en #2
met een expliciete trigger.**

Waarom deze volgorde, in gewone taal:
- **#4 eerst**, omdat het de goedkoopste manier is om *te zien* wat er misgaat. Vergelijk het met een
  rookmelder: hij lost de brand niet op, maar je weet tenminste wáár hij is. Het is ook het meetinstrument
  voor #5: pas als de logs laten zien dat klanten op subdomeinen vastlopen, is wildcard-matching de moeite
  (en het security-risico) waard.
- **#6 tweede**, omdat het bij *elke* nieuwe klant tijd scheelt en een bekende landmijn bij de bron dicht:
  een lege `allowed_domains` betekent nu "de widget werkt op elke website" (fail-open, kostenrisico).
- **#3 derde**, omdat het de meeste tijd per *mislukte* installatie scheelt, maar een nieuw uitgaand
  fetch-oppervlak opent (SSRF, zie §3.3). Het ontwerp hieronder is het "plan vooraf" dat AGENTS.md voor
  security-werk vraagt. Begin met de admin-variant: de eerste klanten installeren we toch zelf (done-for-you).
- **#1 en #2 niet nu**: een WordPress-plugin is een apart softwareproduct met eigen onderhoud,
  review-traject en securitymeldingen, voor een winst die WPCode-instructies grotendeels al geven. Een
  GTM-template vraagt een wijziging in het widget-contract voor een kanaal dat bijna niemand gebruikt.

Geen van de aanbevolen fases vraagt een migratie. Geen ervan is billable, behalve de optionele
"pagina's ontdekken"-stap in de wizard (Firecrawl, expliciete knop).

---

## 1. Besluiten die Sebastiaan moet nemen

Per besluit mijn aanbeveling mét reden. "Vastgelegd" = volgt een bestaande keuze; "eigen keuze" = van mij.

| # | Besluit | Aanbeveling | Reden |
|---|---|---|---|
| B1 | Ziet de klant zelf dát (en op welke host) zijn widget geblokkeerd werd, of alleen de admin? | **Alleen admin in fase 1**; de klant krijgt een generieke hint ("Werkt het niet op een ander domein? Laat het ons weten") | Eigen keuze. De Referer is door iedereen te vervalsen; een klant die "evil.example" in zijn dashboard ziet staan, schrikt onnodig. Admin kan het duiden. |
| B2 | Keur je het SSRF-ontwerp van de site-scan (§3.3) goed als "plan vooraf"? | **Ja, met de vangrails zoals beschreven** | Vastgelegd principe: nieuwe uitgaande fetch = security-werk = plan vooraf (AGENTS.md "Plan voorleggen"). |
| B3 | Komt de site-scan ook in het klantdashboard, of alleen admin? | **Admin eerst (fase 3a), klant pas na 2-3 echte installaties (fase 3b)** | Eigen keuze. Done-for-you is nu het model; de klantvariant vraagt nettere teksten en meer foutpaden. |
| B4 | Scan bij een lege allowlist: weigeren of de website uit de kennisbank gebruiken? | **Weigeren (fail-closed): "stel eerst de toegestane domeinen in"** | Eigen keuze. Houdt de fetch-grens simpel (alleen hosts die een admin bewust heeft ingevoerd) en duwt naar #6. |
| B5 | Wordt `allowed_domains` in de wizard verplicht? En mag de editor daarna nog leeg opslaan? | **Wizard: verplicht. Editor: leeg mag, maar met een rode bevestiging** | Eigen keuze. Interne/test-orgs moeten soms open kunnen; voor echte klanten is leeg een fout. |
| B6 | Wildcard-allowlist: nu bouwen, later, of nooit? | **Later, als #4 ≥ 2 klanten met subdomein-blokkades toont** | Verandert de semantiek van een security-grens; zonder bewezen vraag is per-subdomein toevoegen goedkoper. |
| B7 | WordPress-plugin en GTM-template: beide staan nergens in de scope-docs (hard rule 1: "staat het nergens, vraag"). Akkoord met "niet nu" + triggers? | **Ja** | Zie §3.6 en §3.7. |
| B8 | Snippet zelf mailen vanuit ChatManta (Resend), of bij de mailto van vannacht blijven? | **Bij mailto blijven** | Eigen keuze. Zelf mailen naar willekeurige adressen maakt ons domein een mogelijke spam-relay en voegt AVG-verwerking toe, voor ±5 min winst. |
| B9 | Wizard: website-URL apart opslaan (migratie) of alleen gebruiken om domeinen voor te vullen? | **Niet opslaan (geen migratie)** | Eigen keuze. De scan gebruikt `https://<eerste allowed domain>/` als default; de crawl bewaart zijn `root_url` al in `knowledge_sources`. |

---

## 2. Context: hoe het nu werkt (pad:regel)

### 2.1 De installatieketen
- **Embed-code** in het klantdashboard: één regel
  `<script src="${origin}/widget-v1.js" data-org="${slug}" defer></script>` (`app/v1/app/widget/install-step.tsx:56`).
  Toegestane domeinen ziet de klant alleen-lezen, met "Geen beperking, werkt op elke website" bij een lege
  lijst (`install-step.tsx:105-113`).
- **Loader** `public/widget-v1.js` (113 regels): vlag vóór de checks (`:5-6`), `document.currentScript` zonder
  fallback (`:8-9`), origin uit `script.src` (`:17`), iframe naar `/embed-v1/<slug>?h=<host>` (`:44-45`),
  `document.body.appendChild` zonder null-check (`:58`). → wordt vannacht gehard (install-branch).
- **Embed-pagina** `app/embed-v1/[slug]/page.tsx`: `parentHost = Referer ?? ?h=` (`:30`); `loadV1Embed`
  (`lib/v1/widget/load-embed.ts:29-92`) geeft `blocked` bij een allowlist-mismatch (`:57`) én bij een
  ontbrekend `EMBED_TOKEN_SECRET` (`:59-65`). Er wordt **niets gelogd**. `EmbedBlocked` doet alleen een
  `console.warn` zonder de geziene host (`app/embed-v1/[slug]/embed-blocked.tsx:10-14`).
- **Allowlist-match** `lib/widget/origin-allowlist.ts:48-59`: exacte host na lowercase en `www.`-strip;
  leeg → `open` (fail-open). Dit bestand wordt **ook door V0 gebruikt** (`app/embed/[slug]/page.tsx:11,49`,
  `app/v0/klantendashboard/widget/components/widget-form.tsx:21`).
- **Allowlist beheren** kan alleen de admin: `setAllowedDomainsAction`
  (`app/v1/admin/organizations/[id]/actions.ts:612-650`), max 20 domeinen, regex `^[a-z0-9.-]+$` (dus geen `*`),
  met audit-log `chatbot.allowed_domains.update`.
- **Heartbeat** `app/api/v1/widget/ping/route.ts:26-73` zet `widget_last_seen_at` en het (door de client
  te kiezen, dus spoofbare) `widget_last_seen_origin`. → ping-filter wordt vannacht gebouwd.
- **"Installatie testen"** is een herlaadknop van die twee kolommen (`app/v1/app/widget/actions.ts:63-89`),
  geen test.
- **Admin-overzicht** noemt een org `detected` zodra `allowed_domains` gevuld is, ook zonder ping
  (`lib/v1/admin/overview.ts:298-312`; bewust zo gebouwd, alleen het label klopt niet). → label-fix vannacht.

### 2.2 Wat er al is om op te bouwen
- **Foutstore** `admin_error_groups` (V1-migr `0019`, `supabase/migrations-v1/0019_v1_admin_error_groups.sql`):
  `organization_id` nullable FK, **RLS aan zonder policy** (alleen service-role leest/schrijft, `:14-16,54`),
  fingerprint-upsert via `admin_error_capture()` (`:69-105`), surface `'widget'` toegestaan (`:26-28`).
  Schrijven gaat via `captureError()` (`lib/v1/observability/error-capture.ts:131-149`): fire-and-forget in
  `after()`, timeout 800 ms, PII-redactie, en een globale cardinaliteits-cap van 5000 open groepen met
  overflow-bucket (`:24, 91-113`). Die cap is globaal, **niet** per org of IP.
- **Rate-limiters** (Upstash) in `lib/v0/server/rate-limit.ts` (`buildLimiter` `:193`, `getClientIp` `:297`);
  V1-routes gebruiken ze al (`app/api/v1/widget/ping/route.ts:13`).
- **SSRF-guard** `validateCrawlUrl` (`lib/rag/crawler/validateCrawlUrl.ts:85-133`): alleen http(s), blokkeert
  interne hostnamen, private/gereserveerde IPv4/IPv6, en resolvet DNS. `isPrivateIP` (`:74`) is niet geëxporteerd.
  Let op: hij valideert *vóór* de fetch; de fetch resolvet opnieuw (DNS-rebinding-venster). Bij Firecrawl is
  dat acceptabel (fetch op hún infra), bij een eigen fetch niet.
- **Org aanmaken** `createClientOrganization(companyName, ownerEmail)` (`app/v1/admin/organizations/actions.ts:74-150`):
  org + invite + membership + chatbot + audit, met rollback. Vraagt **geen** website en **geen** domeinen.
  Formulier: `app/v1/admin/organizations/new/new-org-form.tsx` (2 velden).
- **Pagina's ontdekken** bestaat voor de klant (`discoverPagesAction`, `app/v1/app/kennisbank/actions.ts:103-127`,
  per-org `crawl:`-bucket, SSRF-check op elke gevonden URL). De admin heeft alleen een retry
  (`app/v1/admin/jobs/actions.ts:27-71`).
- **Mail**: `sendEmail()` (`lib/notifications/email.ts:19-56`), Resend REST, fail-safe, `RESEND_FROM` verplicht
  (geverifieerd verzenddomein is chatmanta.com, niet .nl).

### 2.3 Wat de install-branch vannacht doet (niet dubbelen)
Volgens de nachtopdracht (recon §6, items met `buildable_tonight_safely: true`), branch
`feat/seb/installatie-sneller`:
1. Loader-hardening in `public/widget-v1.js` (body-null → wachten op DOMContentLoaded, vlag pas na mount,
   `currentScript`-fallback, vaste prod-origin als `script.src` herschreven is, apex→www, `!important`-styles,
   één `console.info`-diagnoseregel). Geen contractwijziging.
2. Ping alleen als de widget echt ingesloten is (`window.parent !== window` + `?h=`), plus server-vangnet.
3. Platforminstructies uitbreiden (WPCode i.p.v. Thema-editor, Wix, Squarespace, Webflow, Shopify, Drupal,
   Joomla, GTM Custom HTML, Jimdo, Lightspeed) + vaste stap "leeg je cache".
4. "Stuur naar je webbouwer"-blok (kopieerknop + `mailto:`; wij versturen niets).
5. Optionele "robuuste" snippet-variant (optimizer-/consent-attributen).
6. Eerlijke statuslabels; "Installatie testen" → "Status verversen".
7. Klantactie "Ander domein toevoegen? Laat het ons weten" (mailto) en neutrale tekst bij een lege lijst.
8. Intern installatieprotocol als doc.

Op het moment van schrijven had de install-worktree nog geen commits; **controleer bij uitvoering van dit
plan eerst wat er werkelijk gemerged is** (`git log main -- public/widget-v1.js app/v1/app/widget`). De
blocked-logging (#4) stond in de recon als "vannacht bouwbaar", maar is uit de nachtgolf gehouden omdat het
een write vanaf een publiek, niet-geauthenticeerd pad is (critic §E). Dit plan levert de vangrails.

---

## 3. Ontwerp per versneller

### 3.1 (#4) Geblokkeerde embed-pogingen loggen — grootte S

**Waarde.** Bij een blokkade ziet de admin binnen een minuut in de Issues-tab: "Widget van org X
geblokkeerd op host `shop.klant.nl`". Nu kost dat een mailwisseling en giswerk.

**Ontwerp.**
- In de `blocked`-tak van `loadV1Embed` (`lib/v1/widget/load-embed.ts:57`) een nieuwe `kind`-variant met reden:
  `{ kind: 'blocked'; reason: 'origin' | 'token_secret'; seenHost: string | null }`. Het render-gedrag blijft
  identiek (niets tonen).
- De logging zit **niet in `page.tsx`**, maar in een helper naast `load-embed.ts`
  (`lib/v1/widget/log-embed-block.ts`, `server-only`). `load-embed.ts` bestaat juist om de embed-pagina vrij
  te houden van V1-backend-imports (no-adhoc-service-client-grep-gate). De pagina roept alleen
  `logEmbedBlock(result)` aan, of `loadV1Embed` doet het zelf in `after()`.
- Bij `reason: 'origin'` roept die helper `captureError` aan met:
  - `surface: 'widget'`, `code: 'EMBED_ORIGIN_BLOCKED'`, `severity: 'warning'`, `organizationId: org.id`,
    `enforceCap: true`;
  - `context.seenHost` = genormaliseerde host (`normalizeHost`), afgekapt op 255 tekens en gefilterd op
    `^[a-z0-9.-]+$` (zelfde idee als `cleanHost` in de ping-route); `context.allowed` = de huidige lijst
    (die kent de admin al; geen PII).
  - **Fingerprint op org + code, níét op host.** De Referer is door iedereen te vervalsen; per host
    fingerprinten zou een aanvaller met willekeurige hosts de globale cap van 5000 laten vollopen en echte
    fouten in de overflow-bucket duwen. Gevolg: per org één groep met teller en de *laatst* geziene host
    (last-write-wins). Dat is genoeg voor diagnose.
  - **Hoe dat in de code moet.** `computeFingerprint` (`lib/observability/fingerprint.ts:51-59`) hasht
    `surface|code|org|route|(topFrame of message)`. Eén groep per org komt er dus alleen als: `message` en
    `title` **vaste tekst** zijn (bv. "Widget geblokkeerd: host niet op de allowlist"), er **geen `error`**
    wordt meegegeven (anders ontstaat er een stack/topFrame), `context.topFrame` niet gezet wordt,
    `context.route` vast is (`/embed-v1/[slug]`, niet de echte URL) en de host **alleen** in `context.seenHost`
    staat. De weergave "geblokkeerd op host `shop.klant.nl`" komt in de admin-UI uit `context.seenHost`, niet
    uit de titel.
- Bij `reason: 'token_secret'`: één systeemfout `EMBED_TOKEN_SECRET_MISSING`, `severity: 'error'`,
  `organizationId: null` (configuratiefout, raakt alle orgs). Ook deze tak krijgt een rem (zie vangrails):
  anders levert elke widget-pageview bij álle klanten tijdens die storing een RPC plus count-query op.
  Daarnaast altijd een `console.error` (gratis, zichtbaar in Vercel-logs en Sentry).
- `EmbedBlocked` krijgt de geziene host mee in de console-tekst ("niet geactiveerd voor `shop.klant.nl`").
  Dat is info die de bezoeker zelf al heeft (zijn eigen adresbalk), dus geen lek.

**Vangrails (de critic-eis "cap per org/IP").**
- Elke paginaweergave op een geblokkeerde site rendert de embed opnieuw. Zonder rem wordt dat één RPC
  (plus een count-query door `enforceCap`) per pageview. Daarom vóór `captureError` Upstash-checks, elk met
  een eigen prefix. `buildLimiter` (`lib/v0/server/rate-limit.ts:193`) is niet geëxporteerd; volg het
  bestaande patroon en voeg een geëxporteerde getter toe (zoals `getClientErrorRateLimiter`, `:266`):
  - per org: **1 schrijfactie per minuut** (`@chatmanta/rl-embedblocked-org`, key = org-id);
  - per IP: **5 per minuut** (`@chatmanta/rl-embedblocked-ip`). De IP komt uit de bestaande
    `getClientIpFromHeaders()` (`:315`): die alleen exporteren, geen nieuwe helper schrijven.
  - token_secret-tak: **1 per minuut, globaal** (`@chatmanta/rl-embedblocked-secret`, vaste key
    `token_secret`), geen IP-check nodig.
  - **Volgorde: eerst de org-check, dan pas de IP-check.** De org-check weigert vrijwel altijd (1/min) en is
    dan een goedkope early-exit: een flood met vervalste Referers op één slug kost zo per request één
    Upstash-commando, niet twee. De embed-pagina heeft zelf geen IP-rate-limit; de Upstash-calls blijven dus
    onbegrensd in aantal, maar zijn goedkoop. Een in-memory voorfilter per instance (bv. "deze org in de
    laatste 60 s al gelogd") voorkomt ook die ene call in de meeste gevallen; neem dat mee.
  - Wordt een check geweigerd: stil niets loggen. Valt Upstash weg: de bestaande in-memory-fallback volgt.
- Alles in `after()`, zodat de render niet wacht (de blokkade-render is toch leeg).
- Bovengrens: ≤ 1.440 upserts per org per dag; in de praktijk een handvol.

**RLS / multi-tenancy / SA-1.** Geen nieuwe tabel. `admin_error_groups` heeft RLS aan zonder policy; alleen
de service-role-wrapper (`getV1ServiceRoleClient`, al gebruikt door `error-capture.ts:14`) schrijft. De
org-id komt uit de slug-lookup op de server, niet uit client-input. Er is geen leespad voor klanten (B1).
**AVG.** De host is een domeinnaam, geen persoonsgegeven; geen IP opslaan (alleen als rate-limit-key in
Upstash met TTL van de sliding window). **Kosten.** Verwaarloosbaar (Upstash-calls alleen op het
blocked-pad).

**Admin-weergave.** Op de Widget-tab van de klant (`app/v1/admin/organizations/[id]/_tabs/widget-tab.tsx`)
een regel "Laatste blokkade: `<host>` (n× sinds <datum>)" met een knop "Voeg `<host>` toe aan de toegestane
domeinen" (vult de bestaande `AllowedDomainsEditor` voor, geen auto-opslaan: de admin beslist, want de host
kan vervalst zijn).

**Wat dit niet ziet.** `evaluateEmbedAccess` geeft `open` als er geen host is (geen Referer én geen `?h=`,
`lib/widget/origin-allowlist.ts:44-54`; bekend restrisico, `docs/AGENT_LANDMIJNEN.md` § Widget & embed). Die
pogingen worden niet geblokkeerd en dus ook niet gelogd. Zie open vraag 7.

**Tests.** Unit: de blocked-variant geeft de juiste reden + genormaliseerde host; host-sanitizer; limiter
weigert de tweede call binnen een minuut (InMemory-limiter); de token_secret-tak wordt ook geremd;
**twee verschillende `seenHost`-waarden voor dezelfde org geven dezelfde fingerprint**; volgorde
org-check vóór IP-check (bij een geweigerde org-check wordt de IP-limiter niet aangeroepen). Handmatig: allowlist op `a.test`, embed vanaf
een lokale pagina op `b.test` → één Issues-rij, tweede pageview binnen een minuut → teller ongewijzigd.

---

### 3.2 (#6) Nieuwe-klant-wizard in de admin — grootte M

**Waarde.** Elke klant start met een ingevulde allowlist (landmijn "lege `allowed_domains` = elke site mag
embedden", `docs/AGENT_LANDMIJNEN.md:581-584`, dicht bij de bron) en de admin hoeft niet meer langs drie
schermen. Let op: daarmee is de grens nog niet helemaal dicht. Een iframe zonder Referer en zonder `?h=`
(bv. een eigen iframe met `referrerpolicy="no-referrer"`) krijgt ook bij een gevulde lijst `open`
(`origin-allowlist.ts:44-54`). De wizard dicht de *lege-lijst*-landmijn, niet het geen-host-pad. Ook Niels kan zo een klant aanmaken zonder Claude Code.

**Scope-check.** "Self-service signup met onboarding-wizard" is V2 (`docs/V2_SCOPE_EN_PRINCIPES.md:93`).
Dit is uitdrukkelijk **niet** self-service: het blijft invite-only, de wizard is een beter formulier voor de
Jorion-admin. Valt dus binnen V1 (`V2_SCOPE_EN_PRINCIPES.md:260`).

**Ontwerp (fase 2a, geen Firecrawl).**
- `new-org-form.tsx` krijgt twee velden erbij:
  1. **Website** (verplicht): vrije invoer, genormaliseerd naar `https://<host>/`.
  2. **Toegestane domeinen** (verplicht, textarea): automatisch voorgevuld met de host uit stap 1 (`www.`
     telt al mee via `normalizeHost`). De admin vult subdomeinen/staging aan. Hint: "Denk aan shop./nl./
     staging-domeinen (bv. de testomgeving van de webbouwer)."
- `createClientOrganization` krijgt een derde parameter `{ websiteUrl, allowedDomainsRaw }`:
  - validatie via dezelfde `parseAllowedOrigins` + regex + max 20 als `setAllowedDomainsAction`
    (één gedeelde helper `validateAllowedDomains()` extraheren, zodat wizard en editor nooit uit elkaar lopen);
  - de website-host moet in de lijst staan (anders melding);
  - de chatbot-insert (`actions.ts:125-130`) krijgt direct `allowed_domains` mee, zodat er geen moment
    zonder lijst bestaat; de bestaande rollback dekt een fout. **Maar:** de insert slikt `23505` (er is al
    een chatbot) stil in, en dan wordt de lijst niet gezet terwijl de wizard succes meldt. Daarom in het
    23505-pad een `update({ allowed_domains })` op de bestaande chatbot van die org
    (`.eq('organization_id', orgId)`, `.is('deleted_at', null)`); faalt die, dan `throw` → rollback;
  - audit-metadata krijgt `allowed_domains` erbij (zoals `chatbot.allowed_domains.update`).
- Na succes: een "Volgende stappen"-blok met links naar de klant-detail (Kennisbank, Widget-tab) en de
  embedcode om te kopiëren (dezelfde string als `install-step.tsx:56`).
- **B5:** de editor (`allowed-domains-editor.tsx`) mag leeg blijven opslaan, maar vraagt dan een expliciete
  bevestiging ("De widget werkt dan op élke website. Alleen voor interne/test-orgs.").

**Fase 2b (optioneel, billable): pagina's ontdekken.** Een aparte knop "Ontdek pagina's (kost Firecrawl-tegoed)"
na het aanmaken. Dat vraagt een admin-variant van `discoverPagesAction` + `startSelectedCrawlAction` met
`orgId` uit de route, `requireAdminActor`, de per-org `crawl:`-bucket en de Firecrawl-gate. Dit overlapt
volledig met "Kennisbank-tab namens de klant" uit het admin-onderzoek (grootte L). **Advies: 2b niet los
bouwen, maar meenemen in dat admin-kennisbankwerk**; de wizard linkt er dan naartoe.

**Datamodel.** Geen migratie (B9): `chatbots.allowed_domains text[]` bestaat (V1-migr `0008`), de crawl
bewaart zijn `root_url` in `knowledge_sources` (`0003`). Optioneel later: lead → klant koppelen (vult naam,
e-mail en website voor vanuit `/v1/leads`), maar dat vraagt een kolom en is een apart plan.
**SA-1.** `requireJorionAdmin` blijft de gate; er komt geen client-ID binnen behalve de nieuwe org zelf.
**AVG.** Geen nieuwe persoonsgegevens (website en domeinen zijn bedrijfsgegevens).

**Tests.** Unit op `validateAllowedDomains` (gedeeld met de editor; bestaande gevallen blijven groen) en op
"website-host moet in de lijst staan". Unit/integratie: het 23505-pad (chatbot bestaat al) zet de lijst alsnog.
Handmatig/Playwright: org aanmaken op V1-lokaal → chatbot heeft direct de lijst; fout halverwege → rollback
laat geen org achter.

---

### 3.3 (#3) "Controleer mijn website"-scan — grootte M (3a admin) + S (3b klant)

**Waarde.** Vervangt de nep-test. In één klik: "script gevonden, slug klopt, maar je pagina komt uit een
cache (`x-drupal-cache: HIT`) — leeg je cache". Bij de eerste testklant had dit het grootste deel van de
zoektijd gescheeld.

**Wat de scan doet** (pure analyse in `lib/v1/widget/install-check.ts`, los unit-testbaar, geen netwerk):
| Check | Signaal | Uitkomst |
|---|---|---|
| Script aanwezig | `<script … src="…/widget-v1.js"` | ok / fail "niet gevonden" |
| Slug klopt | `data-org`/`data-chatbot` = org-slug | ok / fail "andere code geplakt" |
| Origin | src-host = `www.chatmanta.nl` (apex of preview-URL → waarschuwing) | ok / warn |
| Oude V0-code | `/widget.js` met data-org | warn "oude code, vervang" |
| Plaatsing | in `<head>` zonder `defer` | warn (na de loader-fix van vannacht minder kritiek) |
| Paginacache | `age`, `x-cache`, `cf-cache-status`, `x-litespeed-cache`, `x-drupal-cache`, `x-drupal-dynamic-cache` = HIT | info "leeg je cache als je net hebt geplakt" |
| CSP | `Content-Security-Policy`-header én `<meta http-equiv>`; `script-src`/`frame-src`/`child-src`/`default-src` zonder chatmanta.nl | fail met de exacte regel om toe te voegen |
| Optimizers | Rocket Loader (`/cdn-cgi/…rocket-loader`, herschreven `type`), LiteSpeed, WP Rocket, Autoptimize | warn + verwijzing naar de robuuste snippet |
| Cookie-banner met auto-blocking | Cookiebot, CookieYes, Complianz | info "markeer als functioneel" |
| Tag Manager | `googletagmanager.com/gtm.js` | info "via GTM geplaatst? Dan ziet de scan het niet; kijk naar de heartbeat" |
| Platform | `meta generator`, Shopify/Wix/Squarespace/Webflow-markers | toont de juiste platforminstructie |
| Allowlist | eindhost (na redirects) staat op `allowed_domains` | ok / fail "voeg toe" |

De scan voert **geen JavaScript** uit (gewone HTML-fetch). Een script dat via GTM of een plugin pas in de
browser wordt toegevoegd, is dus onzichtbaar; dat staat expliciet in het resultaat. De heartbeat blijft het
bewijs van een werkende installatie (na de ping-fix van vannacht); de scan is diagnose.

**SSRF-vangrails (B2) — de kern van dit plan.** SSRF = "server-side request forgery": een aanvaller laat
óns systeem een adres ophalen dat hij zelf niet kan bereiken, zoals interne cloud-metadata. Alledaags:
iemand vraagt de receptie om "even" een pakketje op te halen in een ruimte waar hij zelf niet in mag.
1. **Alleen hosts van de allowlist.** De gebruiker mag een pad kiezen, maar de host moet (na `normalizeHost`)
   op `allowed_domains` van de eigen org staan. Lege lijst → weigeren (B4). Dat maakt de scan geen open
   proxy: alleen domeinen die een Jorion-admin bewust heeft ingevoerd. De allowlist is op zichzelf **geen**
   bescherming tegen interne hosts: `setAllowedDomainsAction` (`[id]/actions.ts:627`) accepteert expliciet
   `localhost`. De scan weigert daarom altijd `localhost`, hosts zonder punt en de interne suffixen uit
   `validateCrawlUrl` (`.local`, `.internal`, …), los van wat er op de lijst staat.
2. **Alleen `https:` op poort 443.** Geen http, geen afwijkende poorten, geen IP-literal als host, geen
   gebruikersnaam/wachtwoord in de URL.
3. **IP-check bij het verbinden, niet alleen vooraf.** Eigen fetch via `node:https` met een eigen
   `lookup`-functie die elk geresolved adres door `isPrivateIP` haalt (exporteren uit
   `validateCrawlUrl.ts:74`). Zo kan DNS-rebinding (eerst een publiek IP, bij de echte verbinding een intern
   IP) niet tussen check en fetch glippen. Geen nieuwe dependency nodig.
   `validateCrawlUrl` draait daarnaast vooraf voor nette foutmeldingen.
   - **Eerst `isPrivateIP` aanscherpen, dan pas exporteren.** Tot nu toe was het een voorcheck vóór
     Firecrawl; nu wordt het de echte grens. `isPrivateIPv6` (`validateCrawlUrl.ts:59-72`) mist ranges die
     naar een intern IPv4-adres kunnen leiden: IPv4-mapped in hex-vorm (`::ffff:7f00:1`), IPv4-compatible
     (`::a.b.c.d`, `::/96`), NAT64 (`64:ff9b::/96`) en 6to4 (`2002::/16`). Aanpak: het adres eerst normaliseren
     naar 16 bytes (bv. via `new URL('http://[' + ip + ']').hostname` of een kleine parser), de ingebedde IPv4
     decoderen en die door `isPrivateIPv4` halen; NAT64/6to4/`::/96` weigeren we gewoon helemaal (klantsites
     draaien daar niet op). Dit verscherpt ook de crawler-check; dat is gewenst.
   - **De `lookup` moet beide aanroepvormen aankunnen.** Node 20+ zet bij `https.request` standaard
     `autoSelectFamily` aan en roept de eigen `lookup` dan aan met `{ all: true }`; die verwacht een lijst
     adressen terug. Zonder die optie verwacht Node één adres. De eigen lookup resolvet daarom altijd met
     `all: true`, controleert **elk** adres, weigert zodra er één privé is, en geeft het resultaat terug in de
     vorm die de aanroep vroeg. Een eenvoudiger alternatief is `family: 4` + `autoSelectFamily: false`
     forceren (alleen IPv4); kies dat als de dubbele vorm te foutgevoelig blijkt.
4. **Redirects handmatig, max 3.** Elke hop opnieuw regel 1-3. Redirect naar een host buiten de allowlist →
   stoppen en dat *als bevinding* melden ("je site stuurt door naar `x.nl`, die staat niet op de lijst") —
   vaak precies de oorzaak.
5. **Begrenzing.** Alleen `GET`, timeout 5 s totaal, body-cap 1,5 MB (stream afbreken), alleen
   `text/html`, geen cookies, geen eigen auth-headers, vaste User-Agent
   `ChatManta-InstallCheck/1.0 (+https://www.chatmanta.nl)`.
6. **Rate-limit.** Per org 10 scans per uur en per gebruiker 20 per uur (Upstash, eigen prefix). Admin
   hetzelfde per doel-org. Dat vraagt een kleine uitbreiding van `lib/v0/server/rate-limit.ts`: de
   limiters kennen nu alleen een vast venster van 60 s (`UpstashRateLimiter` met
   `slidingWindow(n, '60 s')` `:121`, `InMemoryRateLimiter` met `windowMs = 60_000` `:62`). Voeg een
   optionele `windowMs` toe aan `buildLimiter` en aan beide limiter-klassen (default 60 s, bestaande
   aanroepen ongewijzigd) en een geëxporteerde getter `getInstallCheckRateLimiter(kind)`.
7. **Server action, geen route.** Geen publiek endpoint, geen fetch-proxy die de client met een vrije URL kan
   aanroepen (hard rule 7). De response bevat alleen de bevindingen, nooit de opgehaalde HTML.
8. **Logging.** Geen HTML opslaan. Wel een audit-regel `widget.install_check` (resultaat-samenvatting,
   geen URL-query-string) zodat terug te zien is wie wanneer scande.

**SA-1.**
- Klantvariant (3b): `getSessionOrg()` + `requireOrgMember(orgId)` (zoals `toggleWidgetActiveAction`,
  `app/v1/app/widget/actions.ts:39-45`); org en allowlist uit de sessie, nooit uit client-input.
- Adminvariant (3a): `requireAdminActor()` + chatbot via `getOrgChatbot(svc, orgId)` met `.eq('organization_id', orgId)`.

**Kosten.** Geen Firecrawl, geen LLM. Alleen Vercel-functietijd (≤ 5 s per scan) en uitgaand verkeer
(≤ 1,5 MB). Praktisch nul. **AVG.** De opgehaalde pagina is de publieke site van de klant; we bewaren niets.

**Bekende beperking.** Een WAF (bv. Cloudflare "bot fight mode") kan Vercel-IP's weigeren (403/challenge).
Dan zegt de scan eerlijk "kon je site niet lezen, controleer handmatig in een privévenster" en niet "fout".

**UI.**
- 3a: knop "Installatie controleren" op de admin-Widget-tab, met optioneel padveld (default `/`) en een
  resultatenlijst (groen/oranje/rood + één zin advies).
- 3b: dezelfde component in stap 3 van `/v1/app/widget` (`status-step.tsx`), plus spiegelen naar de
  demo-kopie `app/voorbeeld/(dashboard)/widget/` (daar met een vaste, fictieve uitkomst, géén echte fetch).

**Tests.** Unit (grootste deel): fixtures van HTML + headers per scenario (script ok, verkeerde slug, V0-code,
CSP meta/header, Drupal-cache HIT, Rocket Loader-herschrijving, GTM, Wix-generator). Netwerklaag: unit met een
nep-`lookup` die een privé-IP teruggeeft → geweigerd; `isPrivateIP` weigert `::ffff:7f00:1`, `::127.0.0.1`,
`64:ff9b::a00:1`, `2002:7f00:1::`; de lookup in beide vormen (enkel adres en `{ all: true }`, waarbij één
privé-adres tussen publieke genoeg is om te weigeren); `localhost` en een host zonder punt op de allowlist
→ geweigerd; redirect naar een host buiten de lijst → bevinding;
4e redirect → stop; body > cap → afgebroken. Eén handmatige run tegen `www.chatmanta.nl` zelf.

---

### 3.4 (#5) Wildcard/subdomein-allowlist — grootte M (uitstellen, B6)

**Waarde.** Klanten met veel subdomeinen of wisselende staging-URL's hoeven niet per host te mailen.
**Waarom uitstellen.** De allowlist is de belangrijkste kostenbescherming van de widget (het embed-token
is alleen aan de slug gebonden). Een te ruime wildcard laat vreemde sites onze chat op kosten van de klant
draaien. Pas bouwen als #4 aantoont dat het speelt. Kanttekening: de grens is nu al niet dicht. Wie een
eigen iframe zonder Referer (en zonder `?h=`) maakt, krijgt `open` (`origin-allowlist.ts:44-54`). De echte
vangnetten daarachter zijn de rate-limits en de vragen-limieten per org. Een wildcard maakt de grens dus
ruimer, maar maakt hem niet van "dicht" naar "open"; weeg het in die verhouding.

**Ontwerp als het doorgaat.**
- **V1-eigen functie.** `lib/widget/origin-allowlist.ts` is gedeeld met V0; daarom een nieuwe
  `evaluateEmbedAccessV1` in `lib/v1/widget/origin-allowlist.ts` (critic §D.3: eerst forken). V0 blijft exact.
- **Syntax.** `*.klant.nl` = elk subdomein van `klant.nl`, op elke diepte, **maar niet `klant.nl` zelf**
  (die zet je er apart bij; de wizard vult hem al voor). Geen `*` midden in een naam, geen `*` alleen.
- **Verboden basissen.** Minimaal twee labels na `*.` (`*.nl` en `*.co.uk` kunnen niet), en een vaste
  denylist van multi-tenant-hostingdomeinen waar iedereen een subdomein kan aanmaken: `myshopify.com`,
  `wixsite.com`, `webflow.io`, `squarespace.com`, `vercel.app`, `netlify.app`, `github.io`, `pages.dev`,
  `wordpress.com`, `herokuapp.com` e.d. Daar alleen exacte hosts (dus `klant.myshopify.com`, niet
  `*.myshopify.com`). Geen public-suffix-dependency (SA-11); de lijst staat in code met een test.
- **Editor + validatie.** De gedeelde `validateAllowedDomains()` (uit fase 2a) accepteert de
  wildcard-vorm, met dezelfde denylist. De klant ziet de wildcard leesbaar ("alle subdomeinen van klant.nl").
- **Datamodel.** Geen migratie: `text[]` slaat `*.klant.nl` gewoon op. De oude V1-functie leest het als
  exacte host, dus deploy-volgorde: eerst de nieuwe matcher, dan pas wildcards invoeren.
- **Tests.** Matrix: apex, `www.`, 1 en 2 niveaus diep, `evilklant.nl` (geen match!), `klant.nl.evil.com`
  (geen match), denylist-basissen geweigerd, V0-matcher ongewijzigd. Plus `npm run v1:test-org-isolation`.

---

### 3.5 (#7) Snippet per mail naar de webbouwer (Resend) — grootte S-M (niet nu, B8)

Vannacht komt er een kopieer-tekst + `mailto:`: de mail gaat dan uit de mailclient van de klant zelf.
Zelf versturen voegt weinig toe (±5 min, iets professioneler) en kost:
- **Misbruik/reputatie:** een ingelogde gebruiker kan ons verzenddomein naar willekeurige adressen laten
  mailen. Nodig: alleen owner/admin-rol, vaste template zonder vrije HTML, hooguit een korte notitie
  (escaped, ≤ 500 tekens), cap 3 per org per dag, `reply_to` = de klant.
- **AVG:** het adres van de webbouwer is een persoonsgegeven van een derde. Niet opslaan; in de audit-log
  hooguit het domeindeel.
- **Bezorgbaarheid:** onverwachte mail van een onbekend domein met een `<script>`-regel erin belandt vaak in spam.
- **Proces:** testmails versturen valt onder "akkoord vragen" (AGENTS.md).

**Trigger om het alsnog te bouwen:** klanten melden dat de mailto niet werkt (bv. geen mailclient
ingesteld, webmail-only). Dan via `sendEmail()` (`lib/notifications/email.ts:19`) met de vangrails hierboven.

---

### 3.6 (#1) WordPress-plugin — grootte L + onderhoud (niet nu, B7)

**Wat hij minimaal doet.** Instellingenpagina met één veld "ChatManta-code (slug)" (gevalideerd op
`^[a-z0-9-]+$`, opgeslagen via de Settings API met nonce en `manage_options`-capability), en
`wp_enqueue_script()` van `https://www.chatmanta.nl/widget-v1.js` in de footer met `defer` (WP 6.3+:
`strategy`), het `data-org`-attribuut via de filter `wp_script_attributes`/`script_loader_tag` (met
`esc_attr`), plus de optimizer-uitsluitingen (`data-cfasync="false"`, `data-no-optimize="1"`, `nowprocket`).
Optioneel: een link "Controleer installatie" naar #3. Omdat de plugin alleen de loader laadt, bereiken
loader-verbeteringen klanten **zonder** plugin-update: de plugin kan bewust "dom" blijven.

**Distributie: zip vs wordpress.org.**
| | Zip (zelf hosten) | wordpress.org-directory |
|---|---|---|
| Installeren | klant uploadt via Plugins → Nieuwe plugin → Uploaden | zoeken op "ChatManta" in WP-admin |
| Updates | geen automatische updates, tenzij we een eigen update-server bouwen (`Update URI` + update-transient-hook = extra onderhoud) | automatisch via WP |
| Drempel | geen review | handmatige review (wachttijd wisselt, vaak weken), GPL-licentie, readme met een verplichte sectie over externe diensten (welke data naar chatmanta.nl gaat + links naar voorwaarden/privacy), SVN-repo |
| Vertrouwen | lager ("onbekende zip") | hoger, en vindbaar (marketingkanaal) |
| Onderhoud | weinig | "Tested up to" bij elke WP-major bijwerken, anders verschijnt een waarschuwing; reageren op securitymeldingen van het plugin-team |

**Versies.** SemVer in de plugin-header en `readme.txt` (`Stable tag`), changelog in de readme, publieke
repo (bv. `chatmanta-wp`, GPL). Elke release: test op de laatste twee WP-versies en de gangbare PHP-versies,
en op een block-theme én een klassiek thema.

**Waarom niet nu.** WPCode-instructies + de robuuste snippet (vannacht) geven ±90% van de waarde. De eerste
klanten installeren we zelf. Een plugin is een tweede product met eigen supply-chain-verantwoordelijkheid
(SA-11) en een publiek securityprofiel.
**Trigger:** ±10 WordPress-klanten die zélf installeren, of een webbureau-partner dat er om vraagt. Dan:
eerst zip (snel, testklanten), daarna pas wordpress.org (vindbaarheid).

---

### 3.7 (#2) GTM-communitytemplate — niet doen (B7)

- Een officiële template draait in de sandbox van GTM. `injectScript` kan **geen** `data-org`-attribuut
  zetten. De loader zou de slug dan ook uit `widget-v1.js?org=<slug>` moeten lezen: een uitbreiding van het
  widget-API-contract (AGENTS.md: "plan voorleggen") voor één kanaal. Daarnaast een publieke GitHub-repo,
  de review van de Template Gallery en permissies (`inject_script` op onze URL) in het template-manifest.
- Een **Custom HTML-tag** met de gewone regel werkt al, en na de loader-hardening van vannacht ook op
  vroege triggers. De platforminstructie (vannacht) beschrijft die route.
- **Trigger om te heroverwegen:** een klant of bureau dat alleen via GTM mag werken én Custom HTML niet
  mag gebruiken (sommige organisaties verbieden dat). Dan eerst het `?org=`-contract als los plan.

---

## 4. Fasering

| Fase | Inhoud | Grootte | Migratie | Billable | Akkoord nodig vóór start |
|---|---|---|---|---|---|
| **1** | #4 blocked-logging + host in console + "laatste blokkade" op admin-Widget-tab | S | nee | nee | ja (publiek schrijfpad) — dit plan |
| **2a** | #6 wizard: website + verplichte allowlist, gedeelde `validateAllowedDomains`, bevestiging bij leeg in de editor | M | nee | nee | ja (B5) |
| **3a** | #3 site-scan, admin-variant | M | nee | nee | ja (B2, SSRF) |
| **3b** | #3 site-scan in het klantdashboard + demo-spiegel | S | nee | nee | ja (B3), na 2-3 echte installaties |
| 2b | Wizard "pagina's ontdekken" → onderdeel van het admin-kennisbankplan | — | nee | ja (Firecrawl) | apart plan |
| later | #5 wildcard (trigger: #4 toont ≥ 2 klanten), #7 mail (trigger: mailto faalt), #1 WP-plugin (trigger: ±10 WP-zelfinstalleerders), #2 GTM (trigger: GTM-only-klant) | M / S-M / L / M | nee | — | ja |

Elke fase = eigen branch `feat/seb/<…>` en eigen PR. DoD per fase: `npm run verify`, `npm run build`
(eerst `.next/` wissen), unit-tests uit §3, en voor fase 1 en 3a een handmatige verificatie op een
lokale testpagina. Na merge: AGENT_LANDMIJNEN § Widget & embed bijwerken (fase 1: "blokkades staan in
Issues, één groep per org"; fase 3: "scan ziet geen GTM-/JS-injectie").

---

## 5. Risico's

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Blocked-logging als schrijfversterker (veel pageviews op een geblokkeerde site, een bot met vervalste Referer, of een ontbrekend `EMBED_TOKEN_SECRET`) | middel | Issues-tab vol, DB-writes | Fingerprint per org (vaste message/title, host alleen in context), Upstash 1/min per org (eerst) en 5/min per IP, 1/min globaal voor token_secret, in-memory voorfilter, globale cap blijft |
| Geen-host-pad (geen Referer, geen `?h=`) omzeilt een gevulde allowlist | laag-middel | widget op een vreemde site, kosten | Bestaand restrisico, niet nieuw; vangnet = rate-limits + vragen-limieten; open vraag 7 |
| Vervalste host in de Issues-tab leidt tot een verkeerde allowlist-toevoeging | laag | widget draait op een vreemde site | Admin-only (B1), knop vult alleen vóór, geen auto-opslaan; protocol: host eerst bij de klant checken |
| SSRF via de scan (rebinding, redirect, open proxy) | laag (na vangrails) | toegang tot interne adressen | Allowlist-only, https/443, IP-check bij het verbinden, max 3 redirects met hercheck, server action, rate-limit |
| Scan geeft vals "niet gevonden" (GTM, JS-injectie, WAF) | middel | klant ongerust | Expliciete "kan niet zien"-uitkomsten; heartbeat blijft het bewijs |
| Wizard en editor valideren verschillend | middel | inconsistente lijsten | Eén gedeelde `validateAllowedDomains()` |
| Wildcard te ruim (`*.myshopify.com`) | middel als gebouwd | kosten op vreemde sites | Denylist + ≥ 2 labels + V1-eigen matcher + testmatrix |
| Install-branch van vannacht wijzigt dezelfde bestanden (`load-embed.ts`, `widget-tab.tsx`, `status-step.tsx`) | hoog | merge-conflicten | Pas starten na merge van `feat/seb/installatie-sneller`; rebase op main |
| Demo-kopie loopt uit de pas | middel | demo toont iets wat het product niet doet | 3b spiegelt naar `app/voorbeeld/(dashboard)/widget/` met vaste fictieve uitkomst |

---

## 6. Open vragen

1. Heeft de admin-Widget-tab na vannacht al een "Installatie controleren"-knop of embedcode (admin-onderzoek
   noemde dat "niet vannacht")? Zo ja, haakt 3a daar direct op in.
2. Willen we `EMBED_ORIGIN_BLOCKED` ook als attentiesignaal (rode stip) in het admin-overzicht, of volstaat de
   Issues-tab + Widget-tab?
3. Moet de scan V0-`widget.js` actief als fout melden, of komt V0-code bij echte klanten nooit voor? (Advies:
   warn, kost niets.)
4. Voor de wizard: wil Niels het formulier zelf gebruiken? Dan de hints in klanttaal schrijven en de
   `customer_owner` in `admin_org_profile` meteen op Niels zetten.
5. Moeten blokkades na N dagen automatisch op `resolved` (bestaande retentie van `admin_error_groups`), of
   blijft de groep open tot de admin hem afhandelt? (Advies: bestaande retentie volgen; auto-reopen bij een
   nieuwe blokkade bestaat al, `0019:101-104`.)
6. Bij het latere WP-plugin-besluit: onder welke naam/entiteit publiceren (Jorion Solutions als
   plugin-auteur) en wie beantwoordt supportvragen op wordpress.org?
7. Willen we het geen-host-pad (embed zonder Referer én zonder `?h=`, nu `open`) zichtbaar maken? Advies:
   in fase 1 meetellen als `EMBED_NO_PARENT_HOST` (severity `info`, zelfde rem, één groep per org), zodat we
   zien hoe vaak het voorkomt vóór we beslissen of het fail-closed moet. Dat laatste is een security-besluit
   (gedrag van V0 en V1) en hoort in een eigen plan.
8. Moet `localhost` in de gedeelde `validateAllowedDomains()` alleen voor interne/test-orgs toegestaan zijn?
   Advies: ja, maar dat vraagt een manier om een org als "intern" te herkennen; tot die er is, is de
   harde weigering in de scan (§3.3 punt 1) genoeg.

---

## Review verwerkt (19 okt 2026)

Alle acht bevindingen zelf nagelezen in de bron; alle acht terecht (geen false positives).

**Aangepast:**
- **token_secret-tak zonder rem** (belangrijk): globale limiter 1/min + altijd `console.error`, in vangrails,
  risicotabel en tests (§3.1).
- **`isPrivateIPv6` mist ranges** (belangrijk): hex-IPv4-mapped, `::/96`, NAT64 en 6to4 nagelezen in
  `validateCrawlUrl.ts:59-72`; aanscherpen vóór export is nu een expliciete stap, met testgevallen (§3.3 punt 3).
- **`buildLimiter` niet geëxporteerd en alleen 60 s**: bevestigd (`:62`, `:121`, `:193`). Plan noemt nu de
  echte wijziging (window-parameter + getters) en hergebruikt `getClientIpFromHeaders` (`:315`) (§3.1, §3.3 punt 6).
- **Fingerprint valt alsnog per host uiteen**: bevestigd in `fingerprint.ts:51-59`. Vaste message/title, geen
  `error`, host alleen in `context.seenHost`, plus test "twee hosts = één fingerprint" (§3.1).
- **Geen-host-pad is fail-open**: bevestigd (`origin-allowlist.ts:44-54`). Risico-inschatting in §3.2, §3.4 en §5
  bijgesteld; meten als open vraag 7.
- **23505-pad zet de lijst niet**: bevestigd (`actions.ts:125-130`, regelnummer in het plan gecorrigeerd).
  Update in dat pad + test (§3.2).
- **`localhost` op de allowlist + Node `{ all: true }`-lookup**: bevestigd (`[id]/actions.ts:627`). Scan weigert
  interne hosts los van de allowlist; lookup handelt beide vormen af, met `family: 4` als terugvaloptie (§3.3).
- **Upstash-volgorde en logging in `page.tsx`**: org-check eerst als early-exit, in-memory voorfilter, en de
  `captureError`-aanroep verhuisd naar een helper naast `load-embed.ts` (§3.1).

**Verworpen:** niets. Twee punten zijn bewust niet in dit plan opgelost, maar als open vraag gezet: het
geen-host-pad fail-closed maken (raakt V0 én V1, eigen security-plan) en `localhost` per org-type beperken
(vraagt een "interne org"-kenmerk dat nog niet bestaat).
