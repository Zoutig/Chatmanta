# Feedbacksysteem (klant-meldingen) — bouw-klaar plan

> Status: **ontwerp goedgekeurd, nog niet geïmplementeerd.** Opgesteld na kritische
> analyse van `ChatManta_Feedbackformulier.md` (extern conceptplan) en de huidige
> codebase op `origin/main` (a49a8bb).
>
> Dit is een **dashboardfeature**, geen nieuwe V0 bot-versie. Het raakt de
> RAG-pipeline niet.

## Beslissingen (door Sebastiaan bevestigd, 2026-05-30)

1. **Tabelnaam** `admin_feedback` (+ `admin_feedback_events`) — akkoord.
2. **E-mailnotificaties** → later (eigen fase, ná de eerste launch).
3. **Naam/e-mail indiener** → optioneel in V0 (geen per-user identiteit; bij
   ingevuld bewaren we `privacy_accepted_at` als AVG-bewijs).
4. **Klant-zichtbare status** → nee. Operator-tool-model: RLS uit, `admin_*`-precedent.
5. **Bijlagen** → **wél in de eerste launch.** Trekt Supabase Storage de MVP in.
6. **Indienen** → uitsluitend ingelogde dashboard-klanten (géén publieke widget-route).
7. **Prioriteit** → operator-zetbaar `priority`, los van klant-`urgency`.

---

## A. Doel en scope

Een meldingen-/feedbacksysteem waarmee een org-gebonden klant gestructureerde
feedback indient via het klantendashboard, en operator Niels die centraal beheert
(status, prioriteit, interne notitie, historie) in het admin-dashboard.

- **Indienen:** klanten in het klantendashboard (V0: achter de gedeelde gate, org
  uit cookie).
- **Beheren:** operator (Niels) in het admin-dashboard, nieuwe "Feedback"-tab.
- **In scope eerste launch:** tabellen + org-scoped indien-formulier **mét
  bijlage-upload** + admin-lijst/detail + statusflow + status-historie + zijbalk-items.
- **Latere fases:** filters/prioriteit/comments-UI/Copy-for-Claude (Fase 2),
  e-mailnotificaties via Resend (Fase 3).
- **Expliciet níet:** klant-zichtbare statusterugkoppeling; publieke
  widget-bezoeker-feedback.

---

## B. Rollen en rechten

| Rol | Indienen | Eigen melding zien | Alle meldingen zien | Status/prioriteit | Comment/notitie | Verwijderen |
|---|---|---|---|---|---|---|
| **Klant** (klantendashboard) | ✅ (org uit cookie) | ❌ (geen identiteit; status verborgen) | ❌ | ❌ | ❌ | ❌ |
| **Operator/Niels** (admin) | ✅ (`source='intern'`) | ✅ | ✅ alle orgs | ✅ | ✅ | ✅ (AVG) |
| **Systeem** (toekomst) | ✅ (`source='systeem'`) | — | — | — | — | — |

Autorisatie in V0: `proxy.ts`-gate + `requireV0Auth()` in elke server action;
service-role uitsluitend via `lib/controlroom/server/feedback.ts`.

---

## C. Feedbacktypes

Eén `type`-enum (géén losse `label`-as zoals het conceptplan voorstelde — die was
een redundante 1-op-1 dubbeling):

| `type` | Klant-keuze (label in UI) |
|---|---|
| `antwoordkwaliteit` | Fout antwoord van de chatbot |
| `bug` | Technisch probleem |
| `dashboard` | Dashboard / portaalprobleem |
| `feedback` | Algemene feedback |
| `wens` | Suggestie of wens |

Plus een `source`-as voor het onderscheid klant- vs interne- vs systeemfeedback:
`klantendashboard` | `widget` | `intern` | `systeem`.

---

## D. Datamodel

Migratie **0043** (verifieer nummer met de `check-migration`-skill vóór bouw — er
staat open PR #143). RLS **uit**, met de `admin_*`-kop-comment (volgt het precedent
van `0038_controlroom_admin_overlay.sql` en `0039_admin_error_groups.sql`).
Bestaande data wordt niet geraakt; `v0_feedback` (de 👍/👎-ratings) blijft ongemoeid.

### `admin_feedback`

| Veld | Type | Verplicht | Waarom |
|---|---|---|---|
| `id` | uuid pk default gen_random_uuid() | ✅ | — |
| `organization_id` | uuid **not null** (plain, admin_*-conventie) | ✅ | multi-tenancy + AVG-afbakening |
| `source` | text not null default `'klantendashboard'` CHECK in (klantendashboard,widget,intern,systeem) | ✅ | klant/intern/systeem onderscheid |
| `type` | text not null CHECK in (antwoordkwaliteit,bug,dashboard,feedback,wens) | ✅ | triage |
| `urgency` | text not null CHECK in (low,normal,high) | ✅ | klant-ingevuld |
| `priority` | text null CHECK in (low,normal,high,urgent) | ❌ | operator-prioriteit, los van urgency |
| `status` | text not null default `'nieuw'` CHECK in (nieuw,in_behandeling,opgelost,gesloten) | ✅ | `gesloten` = wontfix/duplicate |
| `description` | text not null CHECK char_length between 10 and 8000 | ✅ | de melding (grens = anti-DoS) |
| `submitter_name` | text null (≤120) | ❌ | optioneel; geen identiteit in V0 |
| `submitter_email` | text null (≤200, format-check in app) | ❌ | nodig zodra bevestigingsmail (Fase 3) |
| `chat_id` | text null (≤120) | ❌ | optioneel; later resolvebaar naar `v0_threads` |
| `question` | text null (≤2000) | ❌ | context |
| `attachment_path` | text null | ❌ | pad in private bucket (eerste launch) |
| `attachment_name` | text null (≤255) | ❌ | originele bestandsnaam voor weergave |
| `privacy_accepted_at` | timestamptz null | ❌ → ✅ als naam/e-mail ingevuld | AVG-bewijs |
| `context` | jsonb null | ❌ | request-id, bot-versie, user-agent |
| `created_at` | timestamptz not null default now() | ✅ | — |
| `updated_at` | timestamptz not null default now() | ✅ | sorteren/triage |

Indexen: `(status, created_at desc)` (operator-inbox), `(organization_id, created_at desc)`.

### `admin_feedback_events` (status-historie + comments + interne notities, append-only)

| Veld | Type | Verplicht |
|---|---|---|
| `id` | uuid pk | ✅ |
| `feedback_id` | uuid not null references `admin_feedback(id)` on delete cascade | ✅ |
| `kind` | text not null CHECK in (created,status_change,comment,internal_note) | ✅ |
| `from_status` / `to_status` | text null | ❌ |
| `body` | text null (≤4000) | ❌ |
| `author` | text not null default `'operator'` CHECK in (klant,operator,systeem) | ✅ |
| `created_at` | timestamptz not null default now() | ✅ |

### Storage-bucket (eerste launch)

Private bucket `feedback-attachments` (created in dezelfde migratie via
`insert into storage.buckets`). Geen public-policy → toegang uitsluitend via
service-role (operator-gated signed URL). Pad-conventie:
`<organization_id>/<feedback_id>/<bestandsnaam>`.

---

## E. Backend/API plan

**Datalaag** `lib/controlroom/server/feedback.ts` (spiegelt `errors.ts`,
service-role via `sb()` uit `lib/controlroom/server/db.ts`, gooit nooit op leesfouten):

- `createFeedback(input)` → insert `admin_feedback` + `created`-event.
- `listFeedback({status,type,urgency,source,orgId})`, `getFeedback(id)`,
  `listFeedbackEvents(id)`, `getFeedbackSummary()` (open-count voor badge/health-strip).
- `setFeedbackStatus(id,status)`, `setFeedbackPriority(id,priority)`,
  `addFeedbackEvent(id,{kind,body,author})`, `deleteFeedback(id)`.
- `uploadAttachment(orgId, feedbackId, file)` → service-role upload naar bucket,
  retourneert `{ path, name }`.
- `getAttachmentSignedUrl(path)` → `createSignedUrl(path, 60)` (operator-gated).

**Klant-indienen** — server action in `app/klantendashboard/actions.ts`:

```ts
submitFeedbackAction(formData) → actionTry(async () => {
  await requireV0Auth();
  const mut = await checkMutationLimit(); if (!mut.allowed) throw RATE_LIMIT;
  const org = await getActiveOrgFromCookies();      // org NOOIT uit client
  const input = validate(formData);                 // enums, lengtes, e-mailformaat, privacy-checkbox
  let attachment = null;
  const file = formData.get('attachment');
  if (file && file.size > 0) {
    assertAllowed(file);                            // MIME-allowlist + ≤10MB, server-side
    attachment = await uploadAttachment(org.id, /* nieuwe id */, file);
  }
  const id = await createFeedback({ ...input, organization_id: org.id, source: 'klantendashboard', ...attachment });
  return { id };
})
```

`redactPii()` uitsluitend op logging-/capture-paden, niet op de opgeslagen melding
(de klant deelt die bewust).

**Operator-mutaties** — server actions in `app/actions/controlroom.ts` (zoals
`setErrorStatus`): `setFeedbackStatusAction`, `setFeedbackPriorityAction`,
`addFeedbackCommentAction`, `deleteFeedbackAction` — elk `actionTry` +
`requireV0Auth()` + `revalidatePath('/admindashboard','layout')`; status-/comment-
mutaties schrijven een event.

**Config-wijziging (vereist voor 10MB-upload):** `serverActions.bodySizeLimit`
in `next.config` verhogen naar bv. `'12mb'`. (Risico/aandachtspunt, zie Fase 1.)

---

## F. Frontend/UX plan

**Klant (`app/klantendashboard/feedback/`):**

- `NavItem` "Feedback" in `app/klantendashboard/components/sidebar.tsx`.
- `page.tsx` + `feedback-form.tsx` (client; template = `instellingen/components/settings-form.tsx`):
  velden type (select), urgentie (radio), beschrijving (textarea, teller + 8000-cap),
  optioneel naam/e-mail/chat-ID/vraag, bijlage (file input, client-side preview +
  size/MIME-check), privacy-checkbox. Submit disabled tot verplichte velden +
  checkbox. **Geen autofill** (geen identiteit) — hint i.p.v. pre-fill.
- Chat-ID: hulptekst + (nice-to-have) dropdown van recente threads uit `/gesprekken`.
- States: success = inline bedank-paneel of route `/feedback/verzonden`
  (bedanktekst uit conceptplan); `klant-empty`/loading via `useTransition`; error uit
  `ActionFail.error` in sticky bar.

**Operator (`app/admindashboard/feedback/`):** spiegel de Issues-tab.

- `NavItem` in `app/admindashboard/components/sidebar.tsx` met open-count-badge
  (`getFeedbackSummary()`).
- `page.tsx`: health-strip (open/nieuw-count) + filter-chips
  (status/type/urgentie/source/org via `Link`+`buildHref`) + rijen (`type`+`urgency`-pill,
  org, korte beschrijving, tijd) → link naar detail. `force-dynamic`.
- `[id]/page.tsx`: contextgrid (org, type, urgentie, chat-ID, vraag, request-id,
  bot-versie), beschrijving, **bijlage** (signed-URL link/preview), **status-acties**
  (`ErrorStatusActions`-equivalent), prioriteit-control, **events-thread** (historie +
  comments + interne notitie-invoer), en voor `type='bug'` een **"Kopieer voor
  Claude Code"** (`CopyButton` + `buildClaudePayload`-variant).

---

## G. Notificaties

- **Eerste launch:** in-app open-count-badge op de admin-zijbalk (Niels checkt het
  dashboard). Geen e-mail.
- **Fase 3 (later):** e-mail via **Resend** — notificatie naar `niels@chatmanta.com`
  bij nieuwe melding (fail-safe: mislukte mail blokkeert opslag niet) + optionele
  bevestigingsmail naar de invuller (vereist verplicht `submitter_email`). Vereist
  Resend-pakket + geverifieerd domein (blueprint Phase 7-infra naar voren gehaald).

---

## H. Security & privacy

- **Org-isolatie:** `organization_id` NOT NULL, **server-side** uit de cookie gezet
  bij indienen (nooit uit client-payload) → geen cross-org-injectie.
- **Klanten zien elkaars feedback niet:** in V0 géén klant-leespad (status verborgen).
  Geen klant-leesendpoint dat privacy *suggereert* — de cookie is vrij wisselbaar
  (V0-disclaimer).
- **Autorisatie:** `proxy.ts`-gate + `requireV0Auth()` in elke action; service-role
  uitsluitend in `lib/controlroom/server/feedback.ts`.
- **Bijlagen:** private bucket, pad genamespaced per org, alleen serveren via
  kortlevende signed-URL uit een operator-gated action; server-side MIME-allowlist
  (`jpg/jpeg/png/gif/webp/pdf`) + ≤10MB; nooit public bucket.
- **Spam/DoS:** `checkMutationLimit()` op indienen + harde lengtegrenzen via
  CHECK-constraints + body-size-limit op de server action.
- **AVG/PII:** `privacy_accepted_at` opslaan bij naam/e-mail; bewaartermijn aanhaken op
  `admin_privacy_settings`; `redactPii()` op logging-paden; `deleteFeedback` (cascade
  events + bucket-object) voor recht-op-verwijdering.

---

## I. Migraties en backwards-compatibility

- Nieuwe migratie 0043 (verifieer met `check-migration`): twee tabellen + indexen +
  bucket-insert, RLS uit met `admin_*`-kop-comment. **Additief** — geen bestaande data
  geraakt, geen regressie-risico.
- `v0_feedback` (ratings) blijft ongemoeid; naamgevingsonderscheid bewust
  gedocumenteerd in de migratie-comment.
- `next.config` `serverActions.bodySizeLimit` → `'12mb'` (config, geen datawijziging).
- Build-verificatie: `Remove-Item -Recurse -Force .next` + echte `next build`
  (Windows-valkuil) + `npm run migrate:status`.

---

## J. Testplan

- **Unit:** input-validatie (enums, lengtes, e-mailformaat, lege/te-lange beschrijving),
  MIME/size-allowlist, event-aanmaak bij status-/comment-mutatie, Copy-for-Claude
  payload-builder.
- **Integration:** `submitFeedbackAction` schrijft rij + `created`-event met org-id uit
  cookie; bijlage upload → `attachment_path` gevuld; operator-status-action schrijft
  `status_change`-event + update `status`+`updated_at`; rate-limit-pad geeft `RATE_LIMIT`.
- **Permissie:** action zonder `v0_auth`-cookie → `AUTH_REQUIRED`; client kan
  `organization_id` niet injecteren (server resolveert); bijlage van andere org niet
  benaderbaar.
- **UI (Playwright):** klant happy-path → success; verplicht-veld-validatie blokkeert
  submit; te-groot bestand geweigerd; admin-lijstfilter werkt; status-wijziging
  reflecteert na refresh.
- **Handmatig:** end-to-end indienen mét screenshot → verschijnt in admin-tab → bijlage
  zichtbaar via signed URL → statusflow `nieuw → in_behandeling → opgelost`.

---

## K. Gefaseerde implementatie

### Fase 1 — Eerste launch (kernsnede, incl. bijlagen)
Migratie 0043 (`admin_feedback` + `admin_feedback_events` + bucket) +
`next.config` body-size + klant-formulier + `submitFeedbackAction` (incl. upload) +
bedankpagina + admin-lijst/detail/status-acties + status-historie (events) + beide
zijbalk-items.
- *Bestanden:* `supabase/migrations/0043_*.sql`, `lib/controlroom/server/feedback.ts`,
  `app/klantendashboard/feedback/*`, `app/klantendashboard/actions.ts`,
  `app/admindashboard/feedback/*`, `app/actions/controlroom.ts`, beide `sidebar.tsx`,
  `next.config.*`.
- *Afhankelijkheden:* Supabase Storage (al beschikbaar in project); geen nieuwe npm-pakketten.
- *Risico's:* server-action body-size-limit voor 10MB-upload; bucket-policy correct
  privé houden; org-namespacing van paden.
- *Acceptatie:* klant dient melding + screenshot in → org-gebonden rij + event + bucket-
  object opgeslagen → Niels ziet melding, opent bijlage, wijzigt status; status verborgen
  voor klant.

### Fase 2 — Operator-beheer+
Filters (type/urgentie/source/org), operator-prioriteit-control, open-count-badge,
comments/interne-notities-UI, Copy-for-Claude voor bugs, zoeken.
- *Bestanden:* admin `page.tsx`/`[id]`, `feedback.ts`. *Risico:* laag.
- *Acceptatie:* filterbare inbox + prioriteit + comments + badge.

### Fase 3 — E-mailnotificaties (Resend)
Notificatie naar Niels + optionele bevestiging naar invuller. Vereist Resend-setup +
geverifieerd domein; bevestiging vereist verplicht `submitter_email`.
- *Risico:* extern domein/DNS, billable. *Acceptatie:* Niels krijgt mail bij nieuwe
  melding (fail-safe).

---

## Hergebruikte patronen (referenties)

- Operator-inbox-precedent: `app/admindashboard/issues/page.tsx`,
  `app/admindashboard/issues/[groupId]/page.tsx`, `lib/controlroom/server/errors.ts`,
  status-acties in `app/actions/controlroom.ts` (`setErrorStatus`).
- `admin_*`-migratieconventie: `supabase/migrations/0038_controlroom_admin_overlay.sql`,
  `0039_admin_error_groups.sql` (RLS uit, plain uuid, service-role).
- Klant-formulier: `app/klantendashboard/instellingen/components/settings-form.tsx`.
- Server actions: `actionTry()` (`lib/errors/action.ts`, `ActionResult<T>`),
  `getActiveOrgFromCookies()` (`lib/v0/server/active-org.ts`), `requireV0Auth()`
  (`app/actions/_auth.ts`).
- Rate-limit: `checkMutationLimit()` (`lib/v0/server/rate-limit.ts`).
- PII: `redactPii()` (`lib/observability/redact.ts`).
- Service-role: `sb()` (`lib/controlroom/server/db.ts`).
- UI: `app/klantendashboard/klant.css` + `Card`/`Btn`/`Pill`/`MetricCard`/`StatusBadge`/
  `CopyButton`/`ReloadButton`.

---

## Wat uit het conceptplan is overgenomen / aangepast / geschrapt

- **Overgenomen:** veld-taxonomie (type/urgentie/beschrijving/chat-ID/vraag),
  privacy-checkbox, bedank-UX, status-enum als startpunt, bijlage-upload.
- **Aangepast:** `label`-enum opgegaan in `type`; "autofill uit sessie" → handmatig +
  optioneel (geen identiteit in V0); e-mail naar Fase 3; status-historie + comments +
  prioriteit + rate-limit + retentie toegevoegd.
- **Toegevoegd (harde regel):** `organization_id` op elke rij.
- **Geschrapt:** klant-zichtbare status; publieke widget-route; redundante `label`-as.
