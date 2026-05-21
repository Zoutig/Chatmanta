# Widget negative feedback — design

**Status:** draft, awaiting sign-off
**Author:** Claude + Sebastiaan
**Date:** 2026-05-21

## What

Bezoekers van de ChatManta-widget kunnen per bot-antwoord een duim-omlaag (en duim-omhoog) klikken. Bij duim-omlaag krijgen ze de optie om een korte toelichting te typen — vrijwillig. De feedback wordt op de server gepersisteerd en verschijnt in het klantendashboard onder **Gesprekken → Negatieve feedback** als een lijst van losse feedback-items (vraag, bot-antwoord, optionele toelichting, tijd).

Doel: klant ziet snel waar de bot z'n bezoekers teleurstelt, zonder dat de bezoeker meer dan één klik hoeft te doen.

## Acceptance criteria

Widget:
- [ ] Onder élke afgeronde bot-bubble (niet de welkomstbubble, niet tijdens streamen) staan twee kleine icoontjes: 👍 en 👎
- [ ] Klik op 👎 → inline disclosure verschijnt onder die bubble: textarea (placeholder "Wat klopte er niet? (optioneel)") + knoppen "Verstuur" + "Sla over"
- [ ] "Verstuur" zonder tekst is geldig (lege toelichting wordt geaccepteerd)
- [ ] "Sla over" sluit het paneel en registreert toch een 👎 met `comment = null`
- [ ] Klik op 👍 → directe submit zonder follow-up (geen toelichting-flow)
- [ ] Na succesvol verzenden: icoon krijgt "ingevulde" staat (filled vs outline), beide icoontjes worden disabled — feedback per bericht is one-shot
- [ ] Netwerkfout bij submit → korte inline error "Kon feedback niet versturen" + retry mogelijk
- [ ] Werkt voor zowel `answer` als `fallback` als `smalltalk` kinds (alles wat een bot-bubble is)

Backend:
- [ ] Nieuwe migration `0030_v0_feedback.sql` met tabel `v0_feedback`, RLS aan, append-only patroon (geen UPDATE/DELETE policy)
- [ ] `/api/v0/chat` streamt vóór de eerste content-event een `{ kind: 'meta', queryLogId, requestId }` event zodat de widget de id heeft vóór de gebruiker iets kan klikken
- [ ] `logQuery` accepteert een vooraf-gegenereerde id zodat de gestreamde id en de uiteindelijk gepersisteerde row dezelfde id hebben
- [ ] Nieuwe route `POST /api/v0/feedback`: body `{ queryLogId, rating: 'up'|'down', comment?: string }`, valideert dat de query_log-row bestaat in de actieve org, insert in `v0_feedback`
- [ ] Rate-limit: hergebruik bestaande IP-rate-limiter — feedback telt mee in mutation-budget

Dashboard:
- [ ] Server-side wrapper `listNegativeFeedback(orgSlug, since?)` in `lib/v0/klantendashboard/server/feedback.ts`, leest `v0_feedback` JOIN `query_log` voor de vraag/antwoord-context
- [ ] Bij `?filter=negative_feedback` op `/klantendashboard/gesprekken` renderen we een aparte tabel (component `NegativeFeedbackTable`) met kolommen: Vraag · Toelichting · Bot-antwoord (truncated) · Tijd
- [ ] Klik op een rij toont een inline-expand met vraag + volledig bot-antwoord + bronnen (geen aparte detail-route). Bronnen alleen als `query_log.kind = 'answer'`
- [ ] Empty state bestaat al en is hergebruikt (`"Nog geen negatieve feedback"`)
- [ ] Filter-bar telt `negative_feedback`-count net als `unanswered`-banner: bij ≥1 nieuwe negatieve feedback in laatste 7d een subtiel banner op de standaard view

Out of scope:
- Widget-gesprekken persisteren in `v0_threads` (separate feature, eerder besproken pad B) — feedback krijgt optionele `thread_id` kolom voor wanneer dat in de toekomst landt
- Notificatie-systeem (e-mail/dashboard-pop-up bij nieuwe feedback) — alleen passive lijst
- Beantwoorden van feedback / status "opgelost" — alleen lezen
- Aggregaties / charts ("X% positief deze week") — komt later
- Feedback export naar CSV — niet nodig in V0
- Filter binnen feedback-tab (datum-bereik, alleen-met-comment) — feedback is een append-only stroom, alles laatste 30d tonen volstaat voor V0
- Anonimisering / GDPR-tooling — feedback bevat geen PII, comment is bezoeker-input dus binnen ChatManta TOS

## Edge cases

- Bezoeker klikt 👎 vóór de meta-event geland is → button is disabled tot widget `queryLogId` heeft (race komt niet voor in praktijk want meta-event komt binnen <100ms, maar gate is goedkoop)
- Bezoeker geeft feedback, refresht pagina, opent widget opnieuw → nieuwe sessie, feedback-state is verloren (we vragen geen client-side persistence: één klik per page-load is genoeg signaal)
- `query_log`-row verdwijnt (cleanup script) → feedback heeft `ON DELETE CASCADE` op `query_log.id`, dus feedback verdwijnt mee. Bewust: feedback zonder query-context is waardeloos
- Bezoeker submit duim-omlaag twee keer (network retry) → DB-side UNIQUE constraint op `(query_log_id, rating)` blokkeert duplicates; API geeft 200 terug bij duplicate (idempotent vanuit user-perspectief)
- Zeer lange comment (>2000 chars) → server cap op 2000 chars (silent truncate), DB check constraint 2000
- HTML/XSS in comment → comment wordt in dashboard altijd als plain text gerenderd, géén innerHTML
- Geen actieve org-cookie → 401 (zelfde gedrag als bestaande feedback-loze chat-flow)
- Bot-antwoord was een error/`'RATE_LIMIT'` → widget toont géén thumbs (alleen op succesvol antwoord)

## Datamodel — `v0_feedback`

```sql
create table public.v0_feedback (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  query_log_id    uuid        not null references public.query_log(id) on delete cascade,
  thread_id       uuid        null references public.v0_threads(id) on delete set null,
  rating          text        not null check (rating in ('up', 'down')),
  comment         text        null check (comment is null or char_length(comment) <= 2000),
  created_at      timestamptz not null default now(),
  unique (query_log_id, rating)
);

create index v0_feedback_org_created_idx
  on public.v0_feedback (organization_id, created_at desc);

create index v0_feedback_org_rating_idx
  on public.v0_feedback (organization_id, rating, created_at desc);

alter table public.v0_feedback enable row level security;

create policy "v0_feedback_select_org_members"
  on public.v0_feedback
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.
```

## Architectuur

Datapad:
1. Widget POST naar `/api/v0/chat` (ongewijzigd)
2. Chat-route genereert `queryLogId = uuid_v4()` vóór de stream start, stuurt `{ kind: 'meta', queryLogId, requestId }` als eerste NDJSON-event
3. Widget vangt `meta`-event af, koppelt id aan de actieve assistant-message
4. Stream gaat ongewijzigd verder
5. Aan het einde wordt `logQuery(..., overrideId: queryLogId)` aangeroepen via `after()` — dezelfde id eindigt in `query_log.id`
6. Bezoeker klikt 👎 → widget POST `{ queryLogId, rating: 'down', comment?: string }` naar `/api/v0/feedback`
7. Feedback-route resolveert `getActiveOrgId(req)`, valideert dat `query_log_id` in die org bestaat, insert in `v0_feedback`
8. Dashboard leest via `listNegativeFeedback(orgSlug)` (JOIN met query_log voor question/answer-context)

UI-componenten (nieuw):
- `app/widget/components/feedback-buttons.tsx` — twee duimen + inline comment-disclosure, lokale state per message
- `app/klantendashboard/gesprekken/components/negative-feedback-table.tsx` — tabel-component voor feedback-rijen
- `lib/v0/klantendashboard/server/feedback.ts` — server wrapper

UI-componenten (gewijzigd):
- `app/widget/components/chatmanta-widget.tsx` — `BotBubble` krijgt optionele `feedbackProps`; bij undefined → geen knoppen (welkomstbubble); bij present → render `<FeedbackButtons>`
- `app/klantendashboard/gesprekken/page.tsx` — bij `view === 'gesprekken' && filter === 'negative_feedback'` renderen we `<NegativeFeedbackTable>` ipv de threads-tabel
- `lib/v0/server/log.ts` (`logQuery`) — accepteer optionele `overrideId`
- `app/api/v0/chat/route.ts` — genereer `queryLogId`, send meta-event, pass naar logQuery

## Testing

- Manuele Playwright-walkthrough: open widget, stel vraag, klik 👎, type "test", verstuur → check DB row, check dashboard tab
- E2E: 👎 zonder comment, 👍, dubbele klik (UI blokkeert + server idempotent), netwerk-fail
- Geen unit-tests voor het inline-disclosure-component (V0-conventie: UI-states via demo i.p.v. RTL-tests)
- `npm run typecheck` + `npm run lint` na elke task

## Open vragen → beantwoord tijdens brainstorm

- Q: Hoe presenteren in dashboard? → A: Lijst van losse feedback-items (met optionele thread-link voor toekomstige use)
- Q: Widget gaat threads persisteren? → A: Nee, out of scope. Feedback-tabel heeft optionele thread_id voor V1.
- Q: Welke icoontjes? → A: 👍 én 👎 onder elke afgeronde bot-bubble, subtiel

## Migration number

Hoogste bestaand: `0029_cc_collapse_v05_v06_into_v0.sql`. Conflict op `0028` (zowel `0028_cc_assistant_threads.sql` als `0028_v0_org_settings.sql`) — niet ons probleem. **Wij claimen `0030`**. Pre-PR check: `gh pr list --state open --search "supabase/migrations"` om te zien of een andere branch ook `0030` claimt.
