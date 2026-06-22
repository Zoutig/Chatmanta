# PLAN — Contactverzoeken (milestone-breakdown)

> Migratienummer = **0053** (worktree-base #204 heeft al 0052_v0_widget_preview). Her-verifiëren met check-migration direct vóór commit.
> Bron: ontwerp-toernooi + plan-review-loop (10 findings F1–F10 verwerkt). Bouw als commit-groepen op één branch `feat/seb/contactverzoeken`, dependency-volgorde aanhouden.

## Architectuur (3 seams + skelet)
- **SEAM 1 settings-key:** `contact_requests` jsonb op `v0_org_settings` (`{enabled:false,notificationEmail:null}`). `getOrgSettings` `.select()` + return-shape VERBREDEN met `contact_requests` (F3 — select pakte 'm niet, "piggyback" was onjuist). get/save via dedicated 1-koloms-upsert (account/setup_skips-patroon), NOOIT `writeOrgSettings` (F7).
- **SEAM 2 offer-event:** `{kind:'contact-offer', prefill:{name?,subject?,toelichting?}, consentText}` als losse NDJSON-wirevorm in `chat/route.ts`, geyield ná generator-drain vóór `controller.close()` — NIET in `rag.ts` (4 answer-done yield-sites + eval-baseline). Gate `enableContactRequests && finalResponse?.kind==='answer'`. Detectie in eigen try/catch binnen de try vóór finally (F6). visitorId = correlatiesleutel.
- **SEAM 3 notify:** fail-safe spiegel van feedback-notify; adres-keten override → `getAccountOverrides().email` → env `CONTACT_REQUEST_NOTIFY_EMAIL` → `captureError('CONTACT_NOTIFY_NO_ADDRESS')` luid; via `after()`.
- **Org-resolutie (F1/F5):** submit-route gebruikt NIET `getActiveOrgId` (→ DEV_ORG-fallback = PII-leak). `?org=<slug>` → `resolveOrgIdFromSlug` (reject bij null) → `verifyEmbedToken(token, slug)` bindt org aan gesigneerde slug-claim.
- **Widget-styling (geverifieerd):** `feedback-form.tsx` gebruikt 15× `var(--klant-*)` die niet in de iframe bestaan → `ContactFormCard` met INLINE styles + widget-kleurtokens (`c.header`/`bestForegroundOn`/`withAlpha`).

## Milestones

### M0 — Migratie 0053 + settings-laag + getOrgSettings-verbreding  [independent]
Files: `supabase/migrations/0053_v0_contact_requests.sql`, `lib/v0/klantendashboard/types.ts`, `lib/v0/klantendashboard/server/settings.ts`, `AGENTS.md`
- Migratie 0053: `CREATE TABLE v0_contact_requests` (kolommen + CHECKs + indexen + PARTIAL UNIQUE(org,visitor_id) WHERE deleted_at IS NULL, 0031-patroon) + ENABLE RLS + SELECT-policy op organization_members-join + updated_at touch-trigger (0028-kopie) + `ALTER v0_org_settings ADD COLUMN IF NOT EXISTS contact_requests jsonb NOT NULL DEFAULT '{}'::jsonb`. Migratie-comment met PII/V1-blocker-noot.
- Datamodel: zie DATAMODEL hieronder.
- Types: `ContactRequest`, `ContactRequestStatus`, `ContactRequestsSettings`.
- F3: `getOrgSettings` `.select()` verbreden met `contact_requests` + geparsed `contactRequests`-veld in return-shape (defensieve parser, default `{enabled:false,notificationEmail:null}`). `getContactRequestsSettings()`/`saveContactRequestsSettings()` via dedicated 1-koloms-upsert (NIET writeOrgSettings; inline-comment + F7).
- AGENTS.md: BESTAANDE V0-sandbox-disclaimer-paragraaf uitbreiden — (1) `/api/v0/contact-request` bij token-gated routes, (2) eerste route met derde-partij-bezoeker-PII, (3) cross-org-leesbaarheid als V1-SA-1-blocker.
- Acceptance: `npm run migrate` brengt 0053 (geen gat 0052→0053 want 0052 bestaat); `list_tables` toont tabel+RLS+CHECKs+UNIQUE+3 indexen; consent=false faalt op chk_consent; email&phone NULL faalt op chk_contactinfo; tweede insert zelfde (org,visitor) actief faalt op partial-UNIQUE; getOrgSettings(slug).contactRequests = default voor org zonder rij; concurrent saveWidgetSettings clobbert toggle niet; `tsc --noEmit` groen.

### M1 — Gedeeld contact-offer skelet (hard-coded event)  [depends-on: M0]
Files: `app/api/v0/chat/route.ts`
- enableContactRequests uit de verbrede getOrgSettings-read (regel ~350, geen extra DB-read; admin body-override toegestaan zoals enableGeneralKnowledge). Yield hard-coded `contact-offer` NDJSON-regel ná de generator-drain vóór `controller.close()`, gegate op toggle && `finalResponse?.kind==='answer'`. NOG GEEN LLM. Losse wirevorm, NIET aan de rag.ts-union. **Serieel met M7 op chat/route.ts; één commit-groep met M0.**
- Acceptance: toggle AAN → exact één `{kind:'contact-offer'}`-regel ná answer-done vóór stream-close; UIT → afwezig; `rag.ts` git-diff leeg; eval-baseline answer byte-identiek.

### M2 — RISICO: widget form-card rendering  [depends-on: M1]
Files: `app/widget/components/chatmanta-widget.tsx`, `public/widget.js`
- Message-type + optioneel `cardContent?:ContactFormCard` (één variant, GEEN generieke discriminator). `contact-offer` vangen in `handleEvent()` (~1266) → aanbieding-bubble + "Ja, neem contact op" → render één `<ContactFormCard>` met INLINE styles + widget-kleurtokens (NIET feedback-form.tsx/klant.css importeren). Exact 5 Q4-velden + hidden honeypot. Submit → `POST /api/v0/contact-request?org=<slug>` met visitorId; embed-token refreshen + 1 retry op 401; succes → bevestiging; afbreken → geen record. Tegen M1's hand-event testen (geen LLM). Iframe-resize respecteren. **Serieel met M8 op widget.**
- Acceptance: in `/embed/<slug>?org=<slug>` met M1-event: bubble ná antwoord; "Ja" toont gestylede card (geen kapotte --klant-*); voorkeur=bellen → telefoon verplicht; honeypot hidden; afbreken laat geen rij; POST draagt ?org; geen generieke card-infra; Playwright-screenshot.

### M3 — Publieke submit-route + anti-spam + token-slug-org-resolutie  [depends-on: M0]
Files: `app/api/v0/contact-request/route.ts`, `lib/v0/klantendashboard/server/contact-requests-write.ts`
- copy-adapt `feedback/route.ts`: dual-auth via `isChatAuthorized` + STRENGERE origin-check (client-error-stijl), BEIDE rate-limiters, honeypot (gevuld→stil ok geen rij), server-side dynamische validatie (voorkeur bepaalt verplicht veld; consent===true; lengte-caps; telefoon-regex nieuw). Org-resolutie F1/F5 (zie seam). thread_id via `findRecentThreadByVisitor(orgId,visitorId,24)` null-tolerant (F4). Idempotent via 23505-conflict van partial-UNIQUE (F8). captureError op alle foutpaden. Toggle-gate (UIT→404/403). **write-module apart van M5's read-module → M3/M5 parallel-veilig.**
- Acceptance: geldig token(slug=acme)+same-origin+?org=acme+consent → 201 + rij org==acme; geen ?org & geen cookie → reject 400/404 (NIET DEV_ORG); ?org=acme maar token voor globex → 401; onbekende ?org → 400/404; tweede submit zelfde visitor actief → idempotent 200; submit ná soft-delete → nieuwe rij; consent ontbreekt→400; voorkeur=call zonder phone→400; honeypot→ok geen rij; toggle UIT→404/403; cross-origin→401; burst→429; geen PII in logs; `tsc` groen.

### M4 — Mail-notificatie 3-traps fail-safe (after())  [depends-on: M3]
Files: `lib/notifications/contact-request-email.ts`, `lib/notifications/contact-request-notify.ts`, `app/api/v0/contact-request/route.ts`
- builders (kopie feedback-email; `isValidFeedbackEmail` herbruikt) + `notifyNewContactRequest` (nooit-throw). Adres-keten (zie seam 3). Mail: naam/contact/voorkeur/toelichting + dashboard deep-link; Reply-To=bezoeker-email indien geldig. Via `after()` ná insert. RESEND_FROM @chatmanta.com. **één commit-groep met M3.**
- Acceptance: met key → mail op verwacht adres + log; zonder key → 201+rij+log "overgeslagen"; geen adres → 201+rij+captureError, geen throw; mail blokkeert response niet; `tsc` groen.

### M5 — Dashboard-tab + sidebar-badge + status/notitie/delete + toggle-UI  [depends-on: M0]
Files: `lib/v0/klantendashboard/server/contact-requests-read.ts`, `app/klantendashboard/contactverzoeken/page.tsx`, `app/klantendashboard/contactverzoeken/actions.ts`, `app/klantendashboard/components/sidebar.tsx`, `app/klantendashboard/layout.tsx`, `app/klantendashboard/components/status-badge.tsx`, `app/klantendashboard/instellingen/components/settings-form.tsx`, `app/klantendashboard/klant.css`
- read-module (apart van M3-write): `listContactRequests`/`getContactRequest`/`updateStatus`/`updateNotes`/`softDelete`/`countContactRequestsNew` — alle org-gescoped, lazy `sb()`. Tab (structuur uit gesprekken/+feedback/) + status-badge + null-safe gesprek-link. Server actions. Sidebar NavItem+badge (`countContactRequestsNew` fetch in layout.tsx); tab+NavItem alleen bij toggle aan. status-badge-union uitbreiden. Toggle-UI in settings-form (#199 switch + bevestigingsmodal) + optioneel notificationEmail-veld. CSS additief + gescoped (raakt admindashboard PR #146 — bestaande selectors niet wijzigen).
- Acceptance: toggle AAN + geseede rij → tab+Nieuw-badge, lijst+status-badge; status-flow + notitie + delete persisteren; link alleen bij thread_id!=null; toggle UIT → tab/NavItem onzichtbaar; toggle persisteert; admindashboard-layout onaangeroerd; `tsc` groen, geen console-fouten.

### M6 — 90-daagse retentie (HARDE delete) in bestaande cron  [depends-on: M0]
Files: `lib/controlroom/server/retention.ts`
- `processContactRequests(orgId, apply)` BINNEN `processOrg`/`runRetentionCleanup` (F2 — cron roept alleen runRetentionCleanup). EIGEN VASTE 90d-cutoff los van `privacy.chatRetentionDays`. cutoff `lt('created_at', now-90d)` (NIET updated_at). VOLLEDIGE harde `.delete()` (niet anonimiseren — AVG). Resultaat in cron-JSON. dryRun telt alleen. Stale file-header (regel 1-2) bijwerken.
- Acceptance: seed 91d + 10d → dryRun toont candidates 1 per org, geen mutatie; zonder dryRun → 91d fysiek weg, 10d blijft; los van per-org chatRetentionDays; handmatige delete blijft werken; header bijgewerkt; `tsc` groen, geen 401 met juiste Bearer.

### M7 — RISICO: gpt-4o-mini intentie-detectie + prefill, vervangt skelet  [depends-on: M1, M2]
Files: `lib/v0/server/contact-intent.ts`, `app/api/v0/chat/route.ts`
- `detectContactIntent({history,question,answer})` = één fail-safe gpt-4o-mini-call (temp 0.0, json_object, kleine max_tokens, try-catch→`{wantsContact:false}`). CONVERSATIE-gericht (NIET #204's `extractContactInfo` — die leest bedrijfs-tekst → bug). Geeft `{wantsContact,confidence,prefill:{name,subject,toelichting}}`. Conservatief (false-neg>false-pos). Vervang M1's hard-coded yield. Eigen try/catch binnen try vóór finally (F6). Gate toggle && kind==='answer'. Prefill sanitizen vóór wire. Niet naar query_log. **Serieel met M1 op chat/route.ts; mergt ná M0+M1.**
- Acceptance: toggle AAN: "bel mij/offerte" → offer + zinnige prefill; info-vraag → geen offer; smalltalk/injection → nooit; toggle UIT → geen call/event; geforceerde fout/hang → `{wantsContact:false}`, stream sluit normaal; eval:run answer-output identiek; cost-telemetrie ongewijzigd; prefill gesanitized; `tsc` groen.

### M8 — End-to-end smoke + PR-hardening  [depends-on: M2, M4, M5, M6, M7]
Files: `app/api/v0/chat/route.ts`, `app/widget/components/chatmanta-widget.tsx` (alleen smoke-tweaks)
- Volledige /embed-flow: vraag → aanbod → form → submit(?org) → mail → tab → status → wissen. PR-template incl. PII-V1-blocker + cross-org-leesbaarheid + Seb-her-bevestiging. Clean-cache `eval:run` (baseline stabiel). `next build` na `.next`-clean (Windows dirty-.next-valkuil). `graphify update`.
- Acceptance: e2e groen in /embed; clean-cache eval identiek; tsc+lint+build schoon; PR-template compleet; AGENTS.md-disclaimer uitgebreid.

## DATAMODEL (migratie 0053, RLS+CHECKs+indexen in dezelfde file)
TABEL `public.v0_contact_requests`:
- `id uuid PK default gen_random_uuid()`
- `organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
- `thread_id uuid NULL REFERENCES v0_threads(id) ON DELETE SET NULL` (mag permanent NULL, F4)
- `visitor_id text NOT NULL` (correlatie + dedup)
- `name text NOT NULL`
- `email text NULL`
- `phone text NULL`
- `preferred_contact text NOT NULL` — CHECK in ('call','email')
- `subject text NULL` (bot-voorgevuld)
- `toelichting text NULL` (bot-voorgevuld)
- `consent_given boolean NOT NULL` — CHECK consent_given = true
- `status text NOT NULL DEFAULT 'nieuw'` — CHECK in ('nieuw','opgepakt','afgehandeld')
- `notes text NULL`
- `created_at timestamptz NOT NULL default now()`
- `updated_at timestamptz NOT NULL default now()` (touch-trigger, 0028-kopie)
- `deleted_at timestamptz NULL` (soft-delete handmatig; retentie = harde delete)

CONSTRAINTS: chk_preferred, chk_status, chk_consent (=true), chk_contactinfo (email NOT NULL OR phone NOT NULL), chk_name_len (1-200), chk_subject_len (<=300), chk_toel_len (<=4000), chk_notes_len (<=4000), PARTIAL UNIQUE(organization_id, visitor_id) WHERE deleted_at IS NULL.

INDEXEN: (organization_id, created_at DESC), (organization_id, status), partial (organization_id, created_at) WHERE deleted_at IS NULL.

RLS: ENABLE; SELECT-policy `contact_requests_select_org_members` op organization_members-join (V1-ready, 0031-kopie); GEEN insert/update/delete-policy (service-role). Comment: in V0 cosmetisch → echte isolatie = code-laag org-filter + token-slug-binding.

TOGGLE: `ALTER v0_org_settings ADD COLUMN IF NOT EXISTS contact_requests jsonb NOT NULL DEFAULT '{}'::jsonb`.

## Commit-groepen (één branch)
M0+M1 · M2 · M3+M4 · M5 · M6 · M7 (ná M0+M1) · M8 (finale). chat/route.ts (M1,M7) en widget (M2,M8) nooit parallel bewerken.
