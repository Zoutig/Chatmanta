# Feedbacksysteem — Fase 2 + Fase 3 (bouw-spec)

> Vervolg op Fase 1 (PR #151, `ea97989`). Bouwt op `origin/main`. **Migratie-vrij**:
> `admin_feedback.priority` (nullable, CHECK low/normal/high/urgent) en
> `admin_feedback_events` (kinds created/status_change/comment/internal_note)
> bestaan al sinds 0043. Geen nieuwe tabellen/kolommen.

## What

Twee dingen bovenop de Fase 1-kernsnede:

**Fase 2 — Operator-beheer+ (uitsluitend admin-dashboard, niets klant-zichtbaar):**
- Operator zet/wist een `priority` (low/normal/high/urgent) op een melding; de wijziging
  komt in de historie.
- Operator voegt notities toe: een **interne notitie** of een **reactie** (beide
  append-only events, gerenderd in de bestaande historie-lijst).
- Voor technische meldingen (`type=bug`) een **"Kopieer voor Claude Code"**-knop:
  PII-geredigeerde markdown-payload (spiegel van de Issues-tab).
- Inbox krijgt **vrij-tekst zoeken** (op beschrijving/vraag) en een **source-filter**,
  naast de bestaande status/type/urgentie/org-filters.

**Fase 3 — E-mailnotificaties (Resend, fail-safe):**
- Bij een nieuwe klant-melding gaat een **operator-notificatie** naar
  `FEEDBACK_NOTIFY_EMAIL` (fallback `niels@chatmanta.com`) met een deep-link naar de
  admin-detailpagina.
- Als de indiener een geldig e-mailadres opgaf, gaat een **bevestigingsmail** naar de
  indiener.
- Verzenden is volledig **gated op `RESEND_API_KEY`**: geen key → no-op (gelogd), nooit
  blokkerend; elke verzendfout wordt geslikt (de melding wordt altijd opgeslagen).

## Acceptance criteria

1. Operator zet prioriteit "Hoog" → label/pill reflecteert het na refresh + event in historie.
2. Operator wist prioriteit → `priority` null + event gelogd.
3. Interne notitie toevoegen → verschijnt in historie als "Interne notitie" + body + operator.
4. Reactie toevoegen → verschijnt als "Reactie".
5. `type=bug`-melding toont "Kopieer voor Claude Code"; niet-bug toont 'm niet. Payload bevat
   type/urgentie/status/org/beschrijving/context + "Vraag aan Claude Code"; PII in vrije tekst
   gemaskeerd.
6. Zoekbalk: term + submit → alleen meldingen waarvan beschrijving/vraag de term bevat.
7. Source-filterchips filteren op bron.
8. **Zonder `RESEND_API_KEY`**: submit slaagt; log "email skipped"; geen throw (unit + integratie).
9. **Met `RESEND_API_KEY`** (live-verificatie door Sebastiaan): melding indienen → operator-mail
   naar `FEEDBACK_NOTIFY_EMAIL`.
10. E-mailbouwers geven juiste subject/ontvanger/deep-link; bevestiging alleen bij geldig
    `submitterEmail` (unit).
11. Typecheck + `next build` schoon; bestaande Fase 1 E2E (`tests/v0/feedback.spec.ts`) blijft groen.

## Out of scope

- Klant-zichtbare status/terugkoppeling (blijft verborgen, Fase 1-beslissing #4).
- Publieke widget-feedback-route.
- Prioriteit als **nieuw** event-kind / migratie — gelogd als `internal_note` om migratie-vrij te blijven.
- Bulk-acties, toewijzing, SLA-timers, bijlage-in-mail.
- Resend domein/DNS-setup — Sebastiaan levert key + geverifieerd domein voor de live-test.

## Edge cases

- Lege/whitespace notitie → `INPUT_INVALID`.
- Notitie > 4000 tekens → `INPUT_INVALID`.
- Ongeldige priority-waarde → `INPUT_INVALID`.
- Lege zoekterm → geen filter (alles). Zeer lange zoekterm → gecapt (120).
- Malformed `submitterEmail` → geen bevestigingsmail (operator-mail gaat wel).
- `RESEND_API_KEY` aanwezig maar Resend geeft 4xx/5xx → geslikt, gelogd; submit ongemoeid.
- Copy-for-Claude op bug zonder context → payload geldig ("(geen extra context)").

## PLAN — taken (≈ één commit per taak)

1. **Types** — `FEEDBACK_PRIORITY_LABELS`; `search` op `FeedbackFilter`.
2. **Datalaag** (`feedback.ts`) — `setFeedbackPriority(id, priority|null)` (logt `internal_note`);
   `search` in `listFeedback` (`.or` ilike op description/question).
3. **Actions** (`app/actions/controlroom.ts`) — `setFeedbackPriorityAction(id, priority|'')`,
   `addFeedbackNoteAction(id, kind, body)`; server-side validatie.
4. **Copy-for-Claude** — `lib/controlroom/feedback-claude-payload.ts` (puur) + unit-test.
5. **Admin-detail UI** — prioriteit-control (client) + notitie-invoer (client) + Copy-knop voor bugs;
   inhaken in `[id]/page.tsx`.
6. **Admin-lijst UI** — zoekbalk (GET-form) + source-filterchips; `q`/`source` searchParams.
7. **Fase 3 e-mail-core** — `lib/notifications/email.ts` (`sendEmail` via fetch, gated) +
   `lib/notifications/feedback-email.ts` (bouwers) + unit-tests.
8. **Inhaken** — e-mail in `submitFeedbackAction` (fail-safe) + `.env.local.example`-keys.
9. **Gates** — typecheck, build, eslint, unit, E2E, Codex-review, live-mail-verificatie.
