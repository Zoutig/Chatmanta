# SPEC — Feedbacksysteem Fase 1 (eerste launch)

Bron-ontwerp: `docs/feedback/FEEDBACKSYSTEEM_PLAN.md`. Dit is de afgebakende
build-scope met testbare acceptatiecriteria.

## What

Een ingelogde dashboard-klant kan via een nieuw "Feedback"-scherm in het
klantendashboard een gestructureerde melding indienen (type, urgentie, beschrijving,
optioneel naam/e-mail/chat-ID/vraag, optioneel één bijlage) en krijgt een bevestiging
op het scherm. Operator Niels beheert alle meldingen in een nieuwe "Feedback"-tab in
het admin-dashboard: een filterbare lijst, een detailpagina met de volledige melding +
bijlage, en knoppen om de status te veranderen — met een zichtbare statushistorie. De
status is niet zichtbaar voor de klant.

## Acceptance criteria

- [ ] Migratie 0043 maakt `admin_feedback` + `admin_feedback_events` (RLS uit,
      `admin_*`-precedent) en een **private** Storage-bucket `feedback-attachments`;
      `npm run migrate:status` toont 0043 als toegepast.
- [ ] Klant op `/klantendashboard/feedback` ziet een formulier met: type (select,
      5 opties), urgentie (radio, 3 opties), beschrijving (textarea), optioneel
      naam/e-mail/chat-ID/vraag, optioneel bijlage, privacy-checkbox.
- [ ] Verzendknop is disabled tot verplichte velden (type, urgentie, beschrijving ≥10
      tekens) + privacy-checkbox geldig zijn.
- [ ] Bij verzenden wordt een `admin_feedback`-rij opgeslagen met `organization_id` uit
      de **server-side** cookie (niet uit client-payload), `source='klantendashboard'`,
      `status='nieuw'`, plus een `created`-event in `admin_feedback_events`.
- [ ] Een geldige bijlage (jpg/jpeg/png/gif/webp/pdf, ≤10MB) wordt naar
      `feedback-attachments/<org>/<feedback>/<naam>` geüpload en het pad + de
      bestandsnaam staan op de rij.
- [ ] Na succes ziet de klant een bedank-bevestiging (paneel of `/feedback/verzonden`)
      met de tekst uit het ontwerp; de status wordt nergens aan de klant getoond.
- [ ] Operator op `/admindashboard/feedback` ziet een lijst van alle meldingen (alle
      orgs), nieuwste eerst, met type, urgentie, org, korte beschrijving en tijd, en kan
      filteren op status, type, urgentie en org.
- [ ] Operator-detailpagina `/admindashboard/feedback/[id]` toont de volledige melding,
      contextvelden, de bijlage via een kortlevende signed-URL, status-actieknoppen
      (`nieuw`/`in_behandeling`/`opgelost`/`gesloten`) en de statushistorie (events).
- [ ] Een statuswijziging door de operator update `status`+`updated_at` en schrijft een
      `status_change`-event; de wijziging is na refresh zichtbaar.
- [ ] Beide dashboards hebben een nieuw zijbalk-item "Feedback"; de admin-zijbalk toont
      een open-count-badge.
- [ ] `npx next build` (na `Remove-Item -Recurse -Force .next`) is groen; typecheck groen.

## Out of scope (NIET in deze fase)

- GEEN e-mailnotificaties (naar Niels of bevestiging naar invuller) — Fase 3.
- GEEN klant-zichtbare status of klant-overzicht van eigen meldingen.
- GEEN publieke widget-bezoeker-feedback (geen nieuwe publieke API-route).
- GEEN operator-`priority`-control, comments-UI, Copy-for-Claude, zoeken — Fase 2.
  (De `priority`-kolom en de `comment`/`internal_note`-event-kinds wórden in de migratie
  aangelegd, maar krijgen in Fase 1 nog geen UI.)
- GEEN nieuwe V0 bot-versie; RAG-pipeline blijft ongemoeid.

## Edge cases

- **Lege/te-korte beschrijving** (<10 tekens) → client + server weigeren, `INPUT_INVALID`.
- **Te-lange beschrijving** (>8000 tekens) → server weigert via CHECK-constraint/validatie.
- **Te-groot of verkeerd bestandstype** → server-side geweigerd vóór upload; melding
  wordt niet opgeslagen met een ongeldige bijlage.
- **Geen bijlage** → rij wordt opgeslagen met `attachment_path = null` (normaal pad).
- **Privacy-checkbox niet aangevinkt** → submit geblokkeerd.
- **Niet-ingelogd** (geen `v0_auth`-cookie) → `requireV0Auth()` → `AUTH_REQUIRED`
  (proxy redirect naar /login dekt de UI).
- **Rate-limit** (spam) → `checkMutationLimit()` → `RATE_LIMIT` met retry-after.
- **Onbekende/lege org-cookie** → val terug op de bestaande active-org-resolutie (dev-org).
- **Lege feedback-lijst** (admin) → nette empty-state, geen crash.
- **Bijlage-object ontbreekt** bij detail-weergave → toon "bijlage niet beschikbaar"
  i.p.v. een kapotte link.
