# Linkknoppen + Engelse widget (fase 1) — eerste testklant

Status: plan goedgekeurd door Seb in de chat (2026-10-14). Aanleiding: testklant
(groothandel aandrijftechniek, ~150 PDF-handleidingen op de eigen site) wil (1) Engels,
(2) een directe knop naar de juiste handleiding, (3) nul gedoe.

## Wat

Een per-klant instelling **Linkknoppen** (standaard uit). Staat hij aan, dan mag de bot
links geven — **alleen wanneer de bezoeker vraagt naar een document, handleiding, download
of plek op de site** — en die verschijnen in de widget als knop. Links komen uitsluitend
uit de gecrawlde content van de klant zelf (pagina-URL's + links die óp die pagina's staan,
zelfde domein). Daarnaast: de vaste widget-teksten volgen de taal van de bezoeker (NL/EN),
en de antwoord-cache serveert geen antwoord in de verkeerde taal.

## Waarom regel 9 een uitzondering krijgt

Regel 9 (geen bronlinks in V1, 2026-06-30) kwam doordat de bot onder élk antwoord een
volledige, niet-klikbare URL zette. Deze modus doet precies het omgekeerde: alleen op
verzoek, nooit kale URL's, altijd klikbaar. Default blijft uit voor alle klanten.

## Acceptatiecriteria

1. Org met vlag UIT: gedrag byte-identiek aan nu (geen links in prompt, geen klikbare links).
2. Org met vlag AAN, vraag "handleiding FRENIC Mega" → antwoord met 1–3 knoppen naar échte
   PDF-URL's van de site; geen kale URL in de tekst.
3. Vraag zonder navigatie-intentie (bv. "wat is jullie telefoonnummer") → geen link.
4. Verzonnen URL of URL van een ander domein → nooit klikbaar (label blijft als tekst).
5. URL's met spaties/haakjes (`%20`, `%28C2%29`) blijven correct klikbaar.
6. Cache-hit levert dezelfde knoppen als de verse run.
7. Engelse browser → widget-teksten Engels; Engelse vraag krijgt nooit een gecacht NL-antwoord
   (en andersom).
8. Vlag aan/uit zetten leegt de antwoord-cache van die klant.
9. Preview in het klantdashboard gedraagt zich gelijk aan de widget (gedeelde cache!).
10. V0 en /voorbeeld ongewijzigd.

## Buiten scope

PDF-inhoud inlezen (fase 2), componentpagina's, crawl-limiet, Engelse dashboard-UI,
klikstatistiek op knoppen, welkomstbericht per taal (klant zet een tweetalige tekst).

## Ontwerp

- **Migratie V1-0031**: `organizations.link_buttons_enabled boolean not null default false`.
  Geen RLS-wijziging (zelfde redenering als 0029: write alleen via SA-1-gegate admin-action
  op service-role; reads via service-role of member-RLS).
- **`lib/v1/org-flags/link-buttons.ts`**: `getOrgLinkButtons(client, orgId)` (fout → false)
  en `applyLinkButtons(config, enabled)` → `sourceLinksEnabled` + `sourceLinksMode: 'on-request'`.
  Gebruikt in widget-chat.ts, actions.ts (preview) en load-embed.ts.
- **`RagConfig.sourceLinksMode?: 'append' | 'on-request'`** (undefined = append = V0-gedrag).
  On-request: eigen prompt-intro; allowlist = Bron-URL's + same-host markdown-links uit de
  context-chunks; kale URL's in het antwoord → toegestaan = markdown-link, anders weg.
- **Sanitizer-robuustheid**: URL-vergelijking op gedecodeerd pad; canonieke output met
  `%20/%28/%29` zodat renderers niet op spaties/haakjes breken; link-regex accepteert één
  niveau haakjes in de URL.
- **Cache**: response krijgt `extras.allowedLinkUrls` mee; hit-pad sanitizet tegen
  bron-URL's ∪ die lijst. Taalcheck op hit (alleen bij autoDetectLanguage): vraagtaal
  nl/en ≠ antwoordtaal nl/en → miss.
- **Widget**: `linkify` = vlag && niet-streaming. Regel/lijst-item dat alleen uit één link
  bestaat → knop (`cmw-linkbtn`, nieuw tabblad, `rel=noopener noreferrer`). UI-teksten via
  `lib/v1/widget/widget-strings.ts`; taal = browser (bij autoDetect) of primaryLanguage.
- **Admin**: schakelaar "Linkknoppen" in de Beheer-tab, purge cache + audit-log.

## Verificatie

Unit-tests (source-links, renderer, strings, flag-helper), typecheck, build, Playwright op
de preview. Live: org inrichten op V1-prod, ~30 pagina's crawlen, vlag aan, 15 testvragen
NL/EN. Volledige eval overgeslagen (akkoord Seb): alles achter een default-uit vlag.
