# Widget-installatie: intern draaiboek (done-for-you)

Voor Sebastiaan en Niels. De vaste volgorde om de V1-widget bij een klant live te
krijgen, plus wat je doet als hij niet verschijnt. Klantgerichte instructies staan
in het dashboard (`/v1/app/widget`, stap 2; teksten in `lib/v1/widget/install-guide.ts`).

Begrippen:
- **Snippet**: de ene regel `<script src="https://www.chatmanta.nl/widget-v1.js" data-org="<slug>" defer></script>`.
- **Allowlist** (`chatbots.allowed_domains`): de domeinen waarop de widget mag laden. Leeg = overal (fail-open).
- **Heartbeat**: een ping uit de ingesloten widget die `widget_last_seen_at/_origin` zet. Een **signaal**, geen bewijs: de host komt van de client.

## 1. Intake (5 minuten, vóór je iets plaatst)

Vraag en noteer (in het admin-dashboard, niet in de repo):
1. **Welk systeem?** WordPress, Drupal, Wix, Squarespace, Shopify, Webflow, Joomla, Google Tag Manager, of eigen code.
2. **Wie heeft toegang?** De klant zelf (CMS-login), een webbouwer, of alleen een hostingpartij. Geen login: stuur de tekst uit "Stuur naar je webbouwer" (dashboard, stap 2).
3. **Welke domeinen?** Hoofddomein, www-variant, subdomeinen (shop., nl., en.), tweede merk-domeinen en testomgevingen (`*.wixsite.com`, `*.myshopify.com`, `*.webflow.io`, `*.squarespace.com`, staging-URL's).
4. **Caching, optimizer, cookiebanner, CSP?** Vraag welke plugins/diensten draaien (WP Rocket, LiteSpeed, W3TC, Cloudflare, Varnish, Drupal page cache; Cookiebot, CookieYes, Complianz).

## 2. Allowlist instellen

Admin → Organisaties → klant → tab **Widget** → Toegestane websites. Voeg elk domein uit de intake toe.
- Matching is exact per host (alleen `www.` wordt genegeerd). Een subdomein moet er dus apart in.
- Laat de lijst nooit leeg bij een betalende klant: leeg = elke site mag embedden (kostenrisico).

## 3. Snippet plaatsen

Kopieer de snippet uit het klantdashboard (of de admin), nooit overtypen. Plaats hem **op elke pagina, vlak voor `</body>`**, met `defer`.

| Platform | Waar | Valkuil |
|---|---|---|
| WordPress | Plugin **WPCode** → Code Snippets → Header & Footer → Footer | Niet via de thema-editor (weg na thema-update). WordPress.com alleen met plugin-abonnement. |
| Drupal | `html.html.twig` van het actieve thema vóór `</body>`, of een module als Asset Injector | Tekstblokken strippen `<script>`. **Altijd cache legen** (Prestaties → Alle caches wissen / `drush cr`). Helpt dat niet: de page-cache-tabellen via de database legen is het noodpad. |
| Wix | Instellingen → Aangepaste code → Body - einde, alle pagina's | Alleen met premium-abonnement + eigen domein. |
| Squarespace | Code-injectie → Footer | Alleen in abonnementen met eigen code. |
| Shopify | `layout/theme.liquid` vóór `</body>` | Bij een themawissel opnieuw plaatsen. |
| Webflow | Site settings → Custom code → Footer code, daarna **publiceren** | Betaald site-abonnement nodig. |
| Joomla | Template `index.php` vóór `</body>` | De editor strippt `<script>` in artikelen. Cache wissen. |
| Google Tag Manager | Tag "Aangepaste HTML", trigger **DOM Ready** of **Window Loaded**, daarna publiceren | Container niet gepubliceerd = niets live. |
| Eigen code | Gedeelde footer/layout vóór `</body>` | — |

Sinds de loader-hardening (wachten op `<body>`) werkt de snippet ook als hij per ongeluk in de `<head>` staat of `async` heeft, maar de footer blijft de standaard.

### Bekende stoorzenders
- **Caching** (nummer 1): plugin, hosting, CDN. Na plaatsen altijd legen.
- **Optimizers** die scripts samenvoegen of uitstellen (LiteSpeed "JS combine", WP Rocket "delay JS", Cloudflare Rocket Loader): zet een uitzondering voor `widget-v1.js`. De loader zoekt zijn eigen tag terug als `currentScript` leeg is, maar een samengevoegd script verliest `data-org`.
- **Cookiebanners met auto-blocking**: markeer de snippet als functioneel/noodzakelijk. De widget plaatst geen cookies (alleen een localStorage-id in de eigen iframe).
- **Content-Security-Policy**: `https://www.chatmanta.nl` toestaan in `script-src` en `frame-src`.
- **Apex-domein**: code met `https://chatmanta.nl` (zonder www) werkt via een redirect; de loader accepteert sinds deze ronde zowel apex als www van de eigen origin.

## 4. Verifiëren

1. Open de klantsite in een **privévenster** (geen cache, geen ingelogde CMS-sessie).
2. Rechts- of linksonder staat de chatknop. Open hem één keer.
3. Browserconsole: geen `[chatmanta] widget-v1.js: ...`-waarschuwing.
4. Dashboard → Widget → Status → **Controleer opnieuw**: "Gezien op je site", met de juiste host.

**Open `/embed-v1/<slug>` nooit direct als "test".** Sinds deze ronde telt zo'n bezoek niet meer als heartbeat (geen frame, geen host), maar het zegt ook niets over de installatie.

## 5. Geen signaal: beslisboom

1. **Staat de snippet in de HTML?** Bekijk de paginabron (Ctrl+U) en zoek op `widget-v1.js`.
   - Nee → niet gepubliceerd, verkeerde plek, of **cache**. Leeg alle caches en kijk opnieuw.
   - Ja, maar met een andere/afwijkende `data-org` → opnieuw kopiëren uit het dashboard.
2. **Snippet staat er, maar geen iframe?** (DevTools → Elements, zoek `iframe[src*="embed-v1"]`)
   - Kijk in de console naar `[chatmanta]`-waarschuwingen (geen script-tag gevonden, geen `data-org`).
   - CSP-fout in de console → CSP aanpassen.
   - Niets in de console → optimizer of cookiebanner houdt het script tegen.
3. **Iframe staat er, maar geen knop?**
   - Domein niet op de allowlist → de iframe is leeg; de console toont "[ChatManta] De chat-widget is niet geactiveerd voor dit domein". Voeg het domein toe (stap 2).
   - Widget gepauzeerd door de klant → status-schakelaar in het klantdashboard.
   - Iframe toont een 404 → slug klopt niet (typfout, verwijderde org).
4. **Knop werkt, maar status blijft "nog niet gezien"?** De heartbeat telt alleen in een frame met een vreemde host. Controleer of de site niet op een ChatManta-domein draait en of de pagina een referrer/`?h=` meegeeft. Het blijft een signaal: de chat zelf is de echte test.

## 6. Afronden

- Noteer in het admin-dashboard welk platform, wie toegang heeft en welke cache er draait (handig bij de volgende wijziging).
- Mail de klant kort dat de chatbot live staat en waar hij zelf kan pauzeren.
