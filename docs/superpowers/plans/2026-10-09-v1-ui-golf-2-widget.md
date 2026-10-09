# Plan: V1 UI-redesign golf 2 (widget, Widget-scherm, Preview)

Spec: `docs/superpowers/specs/2026-10-09-v1-ui-golf-2-widget-design.md`. Extra besluit (Seb, 2026-10-09): stap 1 Uiterlijk = **direct bewerken + opslaanbalk**.

Werkregels: één commit per taak (`feat(v1-ui): …`), na elke taak `npm run typecheck` + `npm run test:unit`. V0-paden (`app/embed/`, `app/widget/`, `public/widget.js`, `public/widget-v1.js`, `app/klantendashboard/`, `lib/widget/`) en alle server actions/API-routes blijven onaangeroerd. `git checkout -- AGENTS.md` vóór elke commit.

**Herzien na plan-panel (scope, randgevallen, harde regels).** Wijzigingen t.o.v. de eerste versie staan gemarkeerd met *(panel)*.

## Testomgeving *(red-team)*
Lokaal draait V1 tegen het **V1-prod-project** (er is geen apart V1-dev-project). Daarom:
- Widget-tests mocken `/api/v1/widget/ping`, `/api/v1/chat` en `/api/v1/contact-request` met `page.route` in **elke** test (geen echte chats, geen `query_log`, geen contactverzoek, geen overschreven `widget_last_seen_origin`).
- Opslaan/schakelaar-tests op het Widget-scherm alleen op de fake seed-org (`member@example.com`), met de oorspronkelijke waarden teruggezet aan het eind. Vooraf akkoord van Seb (elke save purget de answer-cache van die org).
- De testpagina die `widget-v1.js` laadt wordt geserveerd vanaf een tweede lokale poort (klein statisch servertje in de scratchpad), niet uit `public/`. De seed-org moet een lege allowlist hebben of localhost toestaan; vooraf checken.

## Task 1: Gedeelde widget-weergave + helpers
- Files (nieuw): `lib/v1/widget/appearance.ts` *(panel: in lib, puur, server+client)*, `app/embed-v1/_widget/widget-view.tsx` (incl. inline SVG-iconen), `app/embed-v1/_widget/widget.css`, `lib/v1/widget/__tests__/appearance.test.ts`.
- Approach:
  - `appearance.ts` (pure module, geen React, geen `'use client'`): type `WidgetAppearance` (`accentColor, position, headerTitle, subtitle, welcomeMessage, launcherText, logoStyle, customLogoDataUrl, starterQuestions`); `safeAccent` (alleen `#rrggbb`, zelfde regel als de server, anders `#0C1E2E`); `safeLogoDataUrl` (geankerde regex `^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$`, anders `null`); `normalizeStarters(list, show)` (trim, leeg eruit, max 4, elk item afgekapt op 120 tekens; `show === false` → `[]`) *(panel)*; `toWidgetAppearance(settings, fallbackTitle)` die **expliciet per veld** kiest, nooit spread *(panel)*. Alleen `import type` uit `settings-config` (anders sleept het server-code de client-bundels in); de hex-regel wordt gedupliceerd *(red-team)*. Logo alleen als `logoStyle === 'custom-logo'` én de data-URL geldig is.
  - `WidgetView` = presentatie. Twee modi *(panel)*: `embed` (`fixed` binnen de iframe) en `contained` (`absolute` binnen een relatieve ouder; `open` gestuurd door de ouder, `autoFocus={false}`). Props: `appearance`, `mode`, `isMobile`, `open`, `onOpenChange`, `messages` (`id, role, content: ReactNode, streaming, error, retryable`), `pending`, `onSend`, `onRetry`, `peek`, `belowMessages` (slot voor contact), `launcher` (bool, default true).
  - Opbouw volgens bord B · Diepzee: kop (avatar, titel, ondertitel, sluitknop; begroeting groot bij leeg gesprek, max 3 regels), berichten (`#F6F8FA`, fade-in, typ-indicator, foutbubbel met "Opnieuw proberen" alleen als `retryable`), startvragen als zachte knoppen, getint invoerveld (16px op mobiel tegen iOS-zoom) *(panel)*, voetregel, launcher met icoon dat naar een kruisje draait.
  - Geometrie embed-desktop *(panel)*: marge ≥ 20px rondom binnen de iframe, paneelhoogte `calc(100% - launcher - marges)` (werkt ook als de iframe korter is dan 720), schaduwblur begrensd zodat niets hard afsnijdt. Peek-tooltip max 2 regels.
  - Toegankelijkheid *(panel)*: paneel `role="dialog"` met label, launcher `aria-expanded`, Escape sluit (embed), focus terug naar de launcher na sluiten.
  - Regel in de component: de logo-data-URL gaat alleen in `<img src>`, nooit in CSS of `dangerouslySetInnerHTML` *(panel)*.
  - `widget.css`: alles onder `.cmw` (`cmw-`-prefix), zet zelf `font-family`, `color` en `color-scheme: light` *(panel: root-layout kan `html.dark` zetten)*; kleuren via `--cmw-accent`/`--cmw-fg`; beweging volgens spec §5; `prefers-reduced-motion` zet alles uit.
- Tests: `appearance.test.ts`: `safeAccent` (geldig, `#abc` → fallback, onzin), `safeLogoDataUrl` (png ok, svg ok, svg met rommel erachter nee, `javascript:`/`data:text/html`/`https:` nee, null), `normalizeStarters` (trim, leeg, >4, >120 tekens, `show=false`), `toWidgetAppearance` levert **exact** de verwachte key-set ook als settings extra velden (`notificationEmail`, `extraInstructions`) bevat *(panel)*.

## Task 2: Bezoekers-widget op de gedeelde weergave
- Files: `lib/v1/widget/load-embed.ts`, `app/embed-v1/[slug]/page.tsx` (font), `app/embed-v1/[slug]/v1-widget.tsx`, nieuw `app/embed-v1/_widget/contact-form.tsx`, nieuw `lib/v1/widget/chat-history.ts` + test.
- Approach:
  - `loadV1Embed`: props uit `toWidgetAppearance` + de bestaande velden; expliciet per veld. Geen extra query.
  - `page.tsx`: `v1Font.variable` op een wrapper zodat Plus Jakarta 400–700 in de iframe beschikbaar is *(panel)*. Paused/blocked/notfound ongewijzigd.
  - `V1Widget` houdt alle logica (heartbeat, token-refresh, `runChat`, `submitContact`, postMessage, tooltip-timer) en rendert `WidgetView mode="embed"`. Assistant-content blijft `renderMarkdownLite(content, accent, false)`.
  - **Sluiten blijft direct** (geen vertraagde resize-post) *(panel)*. Openen: resize-post zoals nu; de open-animatie start pas als het iframe-venster echt groot is (`resize`-event met `innerHeight > 200`, fallback na ~300 ms), zodat hij niet in de 110×110-iframe begint; tot dan staat het paneel onzichtbaar *(red-team)*.
  - **Opnieuw proberen** *(panel)*: alleen op het laatste assistant-bericht, alleen als `!pending`. `chat-history.ts` levert `historyForRetry(messages, errorId)`: alle turns vóór de vraag die faalde, zonder foutbubbels en zonder de vraag(en) waarvan het antwoord faalde. Retry vervangt de foutbubbel door een nieuwe lege assistant-bubbel en roept `runChat(vraag, …)` aan. De normale `send` gebruikt dezelfde filter, zodat een mislukte vraag ook niet als wees in de geschiedenis blijft.
  - Lege antwoordbubbel aan het einde van de stream wordt `error: true` (met retry) *(panel)*. Fouttekst bij `!res.ok` wordt "Deze chat is even niet beschikbaar." (zonder "ververs de pagina", want er is nu een knop).
  - `contact-form.tsx`: bestaand formulier verplaatst en restyled; state, validatie, honeypot en payload ongewijzigd.
- Tests: unit-tests `chat-history.test.ts` (fout in het midden, fout als laatste, twee fouten op rij, geen fout). Playwright via een **lokale testpagina die `widget-v1.js` laadt** *(panel)* (scratchpad-HTML geserveerd door de dev-server, of `page.setContent` met het script van `localhost:<port>`) op 1440×900, 1366×700 en 390×844: dicht, peek, open, gesprek, fout + opnieuw (route-mock 500 op `/api/v1/chat`), contactformulier, Escape, reduced motion.

## Task 3: Preview op de gedeelde weergave
- Files: `app/v1/app/preview/page.tsx`, `preview-frame.tsx`, `v1-chat.tsx`, nieuw `preview.css`.
- Approach: `PageHeader` ("Test je chatbot", één zin, secundaire actie "Naar Widget"); geen-toegang/geen-chatbot als `EmptyState`. `PreviewFrame` in V1-tokens (nep-browserbalk + rustige nep-site). `V1PreviewWidget` houdt `askV1` + localStorage, rendert `WidgetView mode="contained"`, `open` start op `true`, geen autofocus. Appearance via `toWidgetAppearance`, aangeroepen in `page.tsx` (server); de client krijgt alleen `WidgetAppearance`, nooit de ruwe settings *(panel + red-team)*. Zelfde regel voor het Widget-scherm: het live voorbeeld krijgt alleen `WidgetAppearance`.
  - Fouten *(panel)*: opgeslagen als `error: true` met `code`; geschiedenis via dezelfde `chat-history`-filter; oude opgeslagen berichten die met "Er ging iets mis" beginnen gelden als fout. Retry alleen bij tijdelijke codes (`FAILED`, `RATE_LIMITED`, onverwachte throw), niet bij `MONTHLY_LIMIT`, `BUDGET_EXHAUSTED`, `FORBIDDEN`, `NO_CHATBOT`, `ORG_SUSPENDED`.
- Tests: Playwright: vraag → antwoord, herladen behoudt gesprek, 1440 + 390. Het retry-pad is gedekt door de `chat-history`-unit-tests en de Task 2-route-mock *(panel)*.

## Task 4: Widget-scherm in drie stappen
- Files: `app/v1/app/widget/page.tsx`, `widget-form.tsx` (wordt de samenstelling), nieuw `appearance-step.tsx`, `install-step.tsx`, `status-step.tsx`, `widget-screen.css`, `format.ts` + test.
- Approach:
  - `page.tsx`: `PageHeader` met `StatusPill` + "Bekijk chatbot". Status: `is_active=false` → gepauzeerd, anders de shell-regel (ooit verkeer → live, documenten → testmodus, anders concept). Hiervoor roept de pagina `getShellCounts` opnieuw aan; de dubbele reads met de layout accepteren we (`React.cache` helpt niet omdat de client een argument is) *(red-team)*. `widgetMissing` wordt in `page.tsx` berekend en als boolean doorgegeven (`attention.ts` hangt aan `server-only`-modules) *(red-team)*. Geef `origin` (uit request-headers) en `nowMs` mee als props → geen `window`/`Date.now()` tijdens render *(panel: hydration)*. Geen-toegang/geen-chatbot als compacte staat *(panel)*.
  - **Uiterlijk:** velden links (kleur: de bestaande presets als eigen swatches + `<input type="color">`; icoon: drie tegels incl. upload; positie: `Segmented`; titel, ondertitel, welkomstbericht, tekst bij de knop), rechts sticky `WidgetView mode="contained"` met voorbeeldgesprek. Opslaanbalk **inline in deze stap** (geen nieuwe `_ui`-component) *(panel)*: verschijnt bij `dirty`, Opslaan stuurt alleen gewijzigde velden (`changedFields(base, draft)`), daarna base én draft uit de teruggegeven `settings`; Annuleren zet terug. Logo uploaden/verwijderen slaat direct op en werkt alleen de logo-velden in base én draft bij, zonder andere ongesavede velden te wissen *(panel)*. Hex-invoer wordt client-side gevalideerd met dezelfde regel als de server *(panel)*. Toast bij succes/fout. Import van `saveChatbotSettingsAction` expliciet uit `../instellingen/actions` *(panel)*.
  - **Installeren:** code + kopieerknop (toast), één zin, `v1-details` per platform, alleen-lezen rij toegestane domeinen; slug ontbreekt → `AttentionBlock level="critical"`.
  - **Status:** `Switch` aan/uit (optimistisch, terugdraaien + fout-toast), "Gevonden op je site" (origin + `formatLastSeen`) of "Nog niet gevonden", waarschuwing als `widgetMissing` (boolean van de server), "Installatie testen" met toast.
  - `format.ts`: `formatLastSeen(iso)` met `timeZone: 'Europe/Amsterdam'` → #418.
- Tests: `format.test.ts` (één winter-, één zomertijdgeval); `changedFields` (geen wijziging → leeg, één veld, logo); Playwright: kleur wijzigen → voorbeeld verandert, balk verschijnt, opslaan → toast, herladen behoudt; `#abc` in het hexveld → foutmelding, geen save; logo wijzigen terwijl titel ongesaved is → titel blijft; kopiëren → toast; schakelaar; 1440 + 390; geen console-hydration-warning.

## Task 5: Laadskeletten
- Files: `app/v1/_ui/skeleton.tsx`.
- Approach: `widget` = kop + drie stap-blokken (eerste twee kolommen); `chat` = kop + nep-browserframe met paneel rechtsonder.
- Tests: visueel op de Vercel-preview met vertraagde RSC-route.

## Task 6: Opruimen en verifiëren
- Harde gates: `grep -rn "klant-\|klantendashboard" app/v1/app/widget app/v1/app/preview app/embed-v1` → leeg; `git diff origin/main --stat -- app/embed app/widget public/widget.js public/widget-v1.js app/klantendashboard lib/widget app/api` → leeg.
- Ship-feature §5: Codex-review (max 2 rondes), `chatmanta-reviewer` op de Task 2-diff (publiek pad), schone `next build`, Playwright, Vercel-preview (routes 200, geen `pageerror`, geen hydration-warning op `/v1/app/widget`).

## Bewust niet gedaan (uit het panel)
- Vertraagde sluit-animatie (race met de resize; spec vraagt alleen openveren).
- Een gedeelde `SaveBar` in `_ui` (één gebruiker; promoveren als een tweede scherm hem nodig heeft).
- Een derde `static`-modus.

## Vervolgpunten (geen onderdeel van deze PR, melden in de PR)
- Elke Uiterlijk-save roept `purgeAnswerCache` aan, terwijl uiterlijk geen antwoorden raakt; dat wist ook de FAQ-pre-cache tot de volgende cron. Bestaand gedrag; voorstel: purge alleen bij antwoord-relevante velden.
- Logo als data-URL zit twee keer in elke iframe-load (HTML + RSC-data), tot ~2×270 KB. Gecachete logo-route als vervolg.
- Peek-tooltip verschijnt opnieuw 4 s na elke keer sluiten (bestaand gedrag).
