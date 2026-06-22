# SPEC — Contactverzoeken (V0)

## Wat (in mensentaal)
Wanneer de widget-bot merkt dat een bezoeker contact met een mens wil (terugbellen, offerte, "kan iemand mij bellen"), biedt hij dat conversationeel aan. Zegt de bezoeker ja, dan verschijnt een kort formulier in de widget (naam, e-mail/telefoon, korte toelichting die de bot voorvult, voorkeur bellen/mailen, toestemmingsvinkje). Na verzenden landt het verzoek in een nieuwe per-org tab "Contactverzoeken" op het klantendashboard, en krijgt de ondernemer een e-mail. De ondernemer werkt verzoeken weg via status Nieuw → Opgepakt → Afgehandeld + notitie. Per-org aan/uit (standaard uit). Gegevens na 90 dagen automatisch verwijderd.

## Acceptatiecriteria (onafhankelijk testbaar)
1. **Detectie & aanbod (alleen bij toggle aan):** bij intentie ("bel mij", "offerte", "ik wil contact") biedt de bot ná het antwoord contact aan; bij gewone info-vragen, smalltalk, off-topic of injection NIET. Toggle uit → geen detectie-call, geen aanbod.
2. **Formulier:** naam verplicht; voorkeur "bellen" → telefoon verplicht, "mailen" → e-mail verplicht (client- én server-side); toelichting/onderwerp voorgevuld door de bot (gesanitized); toestemmingsvinkje verplicht.
3. **Opslag:** verzoek landt in `v0_contact_requests` met juiste `organization_id`; `consent_given=true` afgedwongen op DB-niveau; minstens één van e-mail/telefoon afgedwongen; max 1 actief verzoek per gesprek (visitor).
4. **Beveiliging:** publieke submit-route is embed-token-gated met org gebonden aan de gesigneerde slug-claim; cross-origin/onbekende-org/getamperde-org wordt geweigerd; beide rate-limiters actief; honeypot.
5. **Mail:** ondernemer krijgt mail (adres-keten override → account → env → anders luid loggen); verzoek wordt altijd eerst opgeslagen (mail = best-effort, nooit-throw, via `after()`).
6. **Dashboard-tab:** alleen zichtbaar bij toggle aan; lijst met status-badge; status + notitie + verwijderen persisteren; sidebar-badge telt "Nieuw"; null-safe link naar het bron-gesprek.
7. **Retentie:** verzoeken > 90 dagen worden via de bestaande cron volledig (hard) verwijderd; andere retentie-termijnen raken ze niet.
8. **Geen regressie:** eval-baseline (antwoord-output) byte-identiek; `rag.ts` ongewijzigd; cost-telemetrie ongemoeid.

## Buiten scope (expliciet NIET)
- Geen generieke "rich card"/herbruikbaar veld-systeem in de widget — exact één hard-coded `ContactFormCard`.
- Geen aanpasbare bot-tekst, geen door-de-klant-gekozen velden (alleen optioneel apart meldingsadres).
- Geen captcha (validatie + honeypot volstaan voor v1).
- Geen voorkeurstijd/bedrijfsnaam-veld.
- Geen nieuwe bot-versie (v0.X) — gated toevoeging op de huidige versie.
- Geen echte per-org-auth/isolatie — dat is een V1-blocker (SA-1), bewust uitgesteld.
- Geen admin/cookie-submit-pad — contact-request is alleen-embed in v1.

## Edge cases
- Eerste-turn-submit vóór `commitTurn` (after()): `thread_id` mag permanent NULL zijn → link rendert null-safe, geen fallback-belofte.
- Detectie-LLM faalt/hangt → `{wantsContact:false}`, geen event, stream sluit normaal (eigen try/catch vóór finally).
- Geen geldig meldingsadres → verzoek opgeslagen + `captureError('CONTACT_NOTIFY_NO_ADDRESS')` luid, geen throw.
- Embed-token verloopt tijdens traag invullen → widget refresht token vóór submit + 1 retry op 401.
- Submit ná soft-delete van een eerder verzoek → nieuwe actieve rij (geen valse idempotente 200).
- Toggle uit terwijl een oud verzoek bestaat → tab/NavItem verborgen (data blijft tot retentie).

## Bewuste hard-rule-afwijking (bevestigd door Sebastiaan)
Eerste V0-feature met echte derde-partij-bezoeker-PII. V0 heeft geen per-org-isolatie → klant A kan via org-switch bij verzoeken van klant B. Geaccepteerd voor de testfase mét vangrails (consent-constraint, code-laag org-isolatie, token-slug-binding, 90d harde delete). Gedocumenteerd als V1-blocker in PR + AGENTS.md-disclaimer.
