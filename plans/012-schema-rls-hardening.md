# Plan 012: Schema/RLS-hardening batch (V0 + V1 migraties)

> **Executor-instructies**: Volg dit plan stap voor stap. Draai elk
> verificatie-commando en bevestig het verwachte resultaat vóór je verder gaat.
> Gebeurt er iets uit "STOP conditions", stop dan en rapporteer — improviseer
> niet. Als je klaar bent, werk de statusrij voor plan 012 bij in
> `plans/README.md` (tenzij een reviewer je dispatchte en zei dat hij de index
> beheert).
>
> **⚠️ MENSELIJKE GATE — LEES DIT EERST.** Dit plan schrijft twee nieuwe
> migratie-bestanden die het **V0-prod** én **V1-prod** Supabase-project raken
> (datamodel + RLS). Je maakt de bestanden aan en verifieert ze **statisch**,
> maar je draait `npm run migrate` / `npm run migrate:v1` **NIET** zonder
> expliciete "go" van Sebastiaan. Zie Stap 6 en STOP conditions.
>
> **Drift-check (draai eerst)**:
> `git diff --stat 3437648..HEAD -- supabase/migrations/0002_v0_rag.sql supabase/migrations/0032_v0_website_crawler.sql supabase/migrations/0049_security_hardening.sql supabase/migrations/0053_v0_contact_requests.sql supabase/migrations-v1/0002_v1_rag_core.sql supabase/migrations-v1/0010_v1_conversations.sql supabase/migrations-v1/0011_v1_contact_requests.sql supabase/migrations-v1/0015_v1_quiz.sql supabase/migrations-v1/0016_v1_feedback_tickets.sql lib/v0/crawler/processCrawl.ts lib/v1/feedback/db.ts`
> Verwacht: **lege output** (geen van deze bestanden is sinds dit plan gewijzigd
> — gemergde migraties zijn onveranderlijk). Is de output NIET leeg, vergelijk
> dan de "Current state"-excerpts hieronder met de live code; bij een mismatch =
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (RLS-policy-herschrijvingen + `NOT NULL` op een live tabel + prod-migraties; volledig menselijk gated)
- **Depends on**: geen code-afhankelijkheid. **Numerieke reservering**: plan 011 claimt V1-migratienummer `0026` (zie de plan-011-rij in `plans/README.md`) — deze migratie gebruikt daarom V1 `0027`. De twee migraties zijn onderling onafhankelijk (volgorde maakt niet uit voor de runner).
- **Category**: migration / security / rls
- **Planned at**: commit `3437648`, 2026-07-06

## Why this matters

Een regel-voor-regel migratie-sweep vond zes losstaande, low-severity schema-/RLS-inconsistenties. Geen ervan is een actief cross-tenant lek, maar samen vervuilen ze de zorgvuldig opgebouwde security-baseline en zetten ze vallen op het launch-kritieke V1-pad:

- Twee RLS-policies (`document_chunks` in V0 én V1, en `contact_requests` in V1) filteren **niet** op soft-deleted parent-rijen, terwijl elke zuster-policy dat wél doet. Op V1 (echte per-user auth) betekent dit dat een org-member via een rauwe PostgREST-`GET` de inhoud van een "verwijderd" document — of een soft-deleted **contactverzoek met echte bezoeker-PII** — nog kan uitlezen tot de retentie-cron 'm hard wist. RLS (niet de app-query) is daar de grens; de app-filters compenseren nu toevallig, maar dat is geen beveiliging.
- Een trigger-functie uit migratie `0053` mist de `search_path`-pin die migratie `0049` net op alle zusterfuncties zette — de Supabase-advisor `function_search_path_mutable`-WARN keert daardoor terug (exploiteerbaarheid nihil, maar het vervuilt de schone baseline).
- Een FK-child-kolom (`document_chunks.website_page_id`, `ON DELETE CASCADE` sinds `0032`) heeft geen backing-index → elke website-recrawl seq-scant de grootste tabel (V0-only; V1 kent geen `website_pages`).
- Eén V1-audit-tabel (`v1_feedback_ticket_event`) mist `organization_id` en schendt daarmee de multi-tenancy hard rule — de enige tabel in de hele V1-range `0013-0025` die de conventie niet volgt (sibling `v1_quiz_event` draagt org wél).

Na dit plan is de RLS-/schema-baseline weer consistent en advisor-schoon, zonder gedragswijziging op de bestaande service-role-paden.

## Belangrijke context & correcties op de oorspronkelijke opdracht

Deze zijn tijdens verificatie tegen de bron (commit `3437648`) vastgesteld — neem ze letterlijk over:

1. **Geen `CREATE INDEX CONCURRENTLY`.** De migratie-runner `scripts/migrate.mjs` (regels 203-209) draait **elk** migratiebestand binnen één `begin`/`commit`-transactie. `CREATE INDEX CONCURRENTLY` mag niet in een transactieblok en zou de hele migratie laten crashen. Gebruik een **gewone** `CREATE INDEX IF NOT EXISTS`. V0 is een low-volume demo-sandbox, dus de korte schrijf-lock is verwaarloosbaar. (De oorspronkelijke opdracht noemde "CONCURRENTLY op prod" — dat is met deze runner onmogelijk.)
2. **De `document_chunks`-soft-delete-gap zit in twee schema's.** De opdracht labelde dit als "V0 RLS", maar dezelfde policy-gap staat óók in het V1-productieschema (`supabase/migrations-v1/0002_v1_rag_core.sql:110`). In V1 is dit het **echte-impact-pad** (V1 heeft echte auth + gevulde `organization_members`). Dit plan fixt daarom **beide** policies: de V0-versie in de V0-migratie, de V1-versie in de V1-migratie.
3. **`handle_new_auth_user`-email-fix is bewust UITGESTELD** (niet toegepast in deze batch). Zie "Maintenance notes → Uitgesteld". Reden: latent (geen e-mailloze auth-methode aangezet), LOW-confidence, en de fix vereist een product-/auth-beslissing (welke auth-methodes ondersteunt V1) die geen executor autonoom mag nemen — plus hij raakt de auth-signup-transactie (grotere blast-radius dan de pure hygiene-fixes).
4. **`migrate.mjs` doet checksum-drift-detectie** (regels 99-145): een reeds-toegepaste migratie is onveranderlijk. Wijzig **nooit** een bestaand migratiebestand — al je fixes gaan in de twee **nieuwe** bestanden.

## Current state

De relevante bestanden en de exacte code zoals die nu bestaat (commit `3437648`).
**Geverifieerd (2026-07-08):** geen enkele latere migratie dropt of herschrijft
`document_chunks_select_org_members` (V0 én V1) of
`contact_requests_select_org_members` (V1) — de excerpts hieronder zijn de live,
actieve policies; de drop+recreate in dit plan is dus de éérste herschrijving.

### Migratie-runner (verklaart de "geen CONCURRENTLY"-regel)
- `scripts/migrate.mjs:198-220` — de apply-lus. Elk bestand draait in een transactie:
  ```js
  for (const file of pending) {
    ...
    await client.query('begin');
    await client.query(sql);          // ← hele migratie in één transactie
    await client.query('insert into public._migrations ...');
    await client.query('commit');
  ```

### Fix V0-A: `0053` trigger-functie zonder `search_path`-pin
- `supabase/migrations/0053_v0_contact_requests.sql:99-107` — functie zonder pin:
  ```sql
  create or replace function public.v0_contact_requests_touch_updated_at()
  returns trigger
  language plpgsql
  as $$
  begin
    new.updated_at := now();
    return new;
  end;
  $$;
  ```
- `supabase/migrations/0049_security_hardening.sql:43` — het patroon dat 0053 had moeten volgen (0049 pinde 9 functies, regels 34-43):
  ```sql
  alter function public.v0_org_settings_touch_updated_at()        set search_path = '';
  ```

### Fix V0-B: ontbrekende backing-index op `document_chunks.website_page_id`
- `supabase/migrations/0032_v0_website_crawler.sql:113-115` — de `ON DELETE CASCADE`-FK zonder backing-index:
  ```sql
  alter table public.document_chunks
    add constraint document_chunks_website_page_fk
    foreign key (website_page_id) references public.website_pages(id) on delete cascade;
  ```
- `supabase/migrations/0002_v0_rag.sql:94-99` — de enige bestaande indexen op `document_chunks` zijn `(organization_id, document_id)` en `embedding` (hnsw); geen op `website_page_id`. In V0 is `website_page_id` nullable (XOR met `document_id`, CHECK op `0002:88-91`).
- `lib/v0/crawler/processCrawl.ts:60-65` — het delete-pad dat op elke recrawl draait en via CASCADE de ongeïndexeerde child raakt:
  ```ts
  // Idempotency: oude pagina's + (via CASCADE) hun chunks weg.
  const { error: delErr } = await sb
    .from('website_pages')
    .delete()
    .eq('knowledge_source_id', knowledgeSourceId);
  ```

### Fix V0-C + V1-C: `document_chunks` SELECT-policy mist soft-delete-filter
- `supabase/migrations/0002_v0_rag.sql:103-113` — V0-policy, alléén org-check:
  ```sql
  create policy "document_chunks_select_org_members"
    on public.document_chunks
    for select
    to authenticated
    using (
      organization_id in (
        select organization_id
        from public.organization_members
        where user_id = (select auth.uid())
      )
    );
  ```
- `supabase/migrations/0002_v0_rag.sql:55-66` — de `documents`-policy die het patroon zet (`deleted_at is null and organization_id in (...)`).
- `supabase/migrations-v1/0002_v1_rag_core.sql:110-117` — **dezelfde gap in V1-prod** (org-only, geen soft-delete-filter). In V1 is `document_chunks.document_id` **NOT NULL** (`0002:95`), dus geen NULL-tak nodig.
- `supabase/migrations-v1/0002_v1_rag_core.sql:55-63` — de V1-`documents`-policy die het patroon zet.

### Fix V1-A: `contact_requests` SELECT-policy mist `deleted_at is null`
- `supabase/migrations-v1/0011_v1_contact_requests.sql:36` — kolom bestaat: `deleted_at        timestamptz,`
- `supabase/migrations-v1/0011_v1_contact_requests.sql:54-61` — policy zonder soft-delete-filter:
  ```sql
  create policy "contact_requests_select_org_members"
    on public.contact_requests for select to authenticated
    using (
      organization_id in (
        select organization_id from public.organization_members
        where user_id = (select auth.uid())
      )
    );
  ```
- `supabase/migrations-v1/0010_v1_conversations.sql:51-59` — het patroon dat `contact_requests` had moeten volgen (`threads`-policy met `deleted_at is null and ...`).
- `app/v1/app/contactverzoeken/actions.ts:96-113` — **soft-delete is LIVE** (`deleteContactRequestAction` zet `deleted_at`), dus de gap is actueel, niet hypothetisch:
  ```ts
  .from('contact_requests')
  .update({ deleted_at: new Date().toISOString() })
  ```
- `lib/v1/observability/retention.ts:74-81` — de retentie-cron hard-delete keyt op `created_at`, niet op `deleted_at`; een soft-deleted PII-rij overleeft dus tot 90 dagen na `created_at` en blijft RLS-selectbaar.

### Fix V1-B: `v1_feedback_ticket_event` mist `organization_id`
- `supabase/migrations-v1/0016_v1_feedback_tickets.sql:74-86` — tabel zonder org-kolom:
  ```sql
  create table if not exists public.v1_feedback_ticket_event (
    id          uuid        primary key default gen_random_uuid(),
    feedback_id uuid        not null references public.v1_feedback_ticket(id) on delete cascade,
    kind        text        not null,
    from_status text,
    to_status   text,
    body        text,
    author      text        not null default 'operator',
    created_at  timestamptz not null default now(),
    ...
  );
  ```
- `supabase/migrations-v1/0016_v1_feedback_tickets.sql:91-92` — RLS AAN, GEEN policy (service-role-only).
- `supabase/migrations-v1/0015_v1_quiz.sql:152-156` — de sibling-audit-tabel die org **wél** draagt (het patroon om te volgen):
  ```sql
  create table if not exists public.v1_quiz_event (
    ...
    organization_id uuid        not null references public.organizations(id) on delete cascade,
    chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
    ...
  );
  ```
- `lib/v1/feedback/db.ts:105-126` — de **enige** insert-plek (`addTicketEvent`); ontvangt alléén `feedbackId`, geen org:
  ```ts
  const { error } = await getV1ServiceRoleClient()
    .from(EVENTS)
    .insert({
      feedback_id: feedbackId,
      kind: ev.kind,
      ...
      author: ev.author ?? 'operator',
    });
  ```
  → Omdat de insert-plek geen org kent, vullen we `organization_id` DB-side via een BEFORE INSERT-trigger die 'm uit de parent-ticket kopieert. **`db.ts` hoeft niet te wijzigen.**

### Repo-conventies die hier gelden
- Migratie-commentaar/headers in het **Nederlands** (zie elke `supabase/migrations*/*.sql`).
- **Nieuwe migratie = RLS-policies + hardening in dezelfde file.** Elke nieuwe trigger-functie krijgt een `set search_path`-pin (exact de les uit fix V0-A) — anders herhalen we de 0053-fout.
- Migraties zijn strikt volgnummer-gesorteerd (`scripts/migrate.mjs:52-54` sorteert op bestandsnaam). Nooit een bestaand bestand editen (checksum-drift = harde stop).

## Commands you will need

| Doel | Commando | Verwacht bij succes |
|------|----------|---------------------|
| Drift-check | zie kop van dit plan | lege output |
| Typecheck | `npm run typecheck` | exit 0, geen fouten |
| V0-migratiestatus | `npm run migrate:status` | nieuwe file als `· pending`, geen `DRIFT` |
| V1-migratiestatus | `npm run migrate:v1:status` | nieuwe file als `· pending`, geen `DRIFT` |
| V0-migratie toepassen (**alleen na go**) | `npm run migrate` | `→ 0055_... ✓` |
| V1-migratie toepassen (**alleen na go**) | `npm run migrate:v1` | `→ 0027_... ✓` |

> `migrate:status` / `migrate:v1:status` verbinden read-only met de prod-DB en vereisen `DATABASE_URL` / `V1_DATABASE_URL` in `.env.local`. Faalt het commando met een ontbrekende-env- of connectie-melding, dan is dat een **omgevingslimiet, geen plan-fout** — val terug op de grep-checks in Stap 4 en ga door naar de menselijke gate.

## Scope

**In scope** (de enige bestanden die je aanmaakt/wijzigt):
- `supabase/migrations/0055_v0_schema_rls_hardening.sql` — **nieuw** (fixes V0-A, V0-B, V0-C)
- `supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` — **nieuw** (fixes V1-A, V1-B, V1-C)
- `plans/README.md` — alleen de statusrij van plan 012

**Out of scope** (NIET aanraken, ook al lijken ze verwant):
- Elk bestaand migratiebestand — onveranderlijk (checksum-drift = harde runner-stop). Alle fixes gaan in de twee nieuwe files.
- `lib/v1/feedback/db.ts` en alle andere app-code — de V1-B-fix is bewust volledig DB-side (trigger). Geen TS-wijziging in deze batch.
- `handle_new_auth_user` / `public.users.email` — bewust uitgesteld (zie Maintenance notes).
- `parent_chunks`-policies (V0 `0008`, V1 `0002:81`) — dezelfde soft-delete-gap, maar buiten de gebriefte scope; genoteerd als sibling-follow-up in Maintenance notes.
- Firecrawl-crawler, RAG-engine, widget — niet geraakt.

## Git workflow

- Branch: `git checkout -b feat/seb/schema-rls-hardening` (nooit op `main`). Controleer vóór elke commit: `git rev-parse --abbrev-ref HEAD`.
- Eén commit per logische eenheid; conventional-commit-stijl (voorbeeld uit repo: `feat(v1): widget-levenscyclus — heartbeat-ping ...`). Bijv.:
  - `fix(db): V0 schema/RLS-hardening — 0053 search_path-pin, website_page_id-index, chunks soft-delete-filter (migr 0055)`
  - `fix(db): V1 schema/RLS-hardening — contact_requests + document_chunks soft-delete-filter, feedback_event org_id (migr 0027)`
- **Niet** pushen of een PR openen tenzij Sebastiaan daarom vraagt.

## Steps

### Stap 1: Branch + reserveer/valideer migratienummers

1. Maak de branch: `git checkout -b feat/seb/schema-rls-hardening`.
2. Bevestig de vrije volgnummers:
   - V0: `ls supabase/migrations | sort | tail -3` → hoogste is `0054_v0_cache_epoch.sql`. Jouw nieuwe file wordt **`0055`**.
   - V1: `ls supabase/migrations-v1 | sort | tail -3` → hoogste is `0025_v1_org_suspend.sql`. **`0026` is gereserveerd door plan 011** (zie de plan-011-rij in `plans/README.md`) — gebruik **`0027`**, óók als er lokaal nog geen `0026`-bestand is.
3. Collisie-check op open PR's (parallelle branches kunnen hetzelfde nummer claimen):
   `gh pr list --state open --search "migration in:title,body" --limit 10` en scan op `0055` / `0026` / `0027`.

**Verify**: `git rev-parse --abbrev-ref HEAD` → `feat/seb/schema-rls-hardening`. Geen open PR claimt `0055` (V0) of `0027` (V1).

**STOP** als een open PR `0055` of `0027` al claimt → kies het eerstvolgende vrije nummer, pas de bestandsnamen + de drift-check-paden + README consistent aan, en noteer de afwijking.

### Stap 2: Schrijf de V0-migratie

Maak `supabase/migrations/0055_v0_schema_rls_hardening.sql` met exact deze inhoud:

```sql
-- 0055_v0_schema_rls_hardening.sql
-- Schema/RLS-hardening batch (V0). Drie onafhankelijke fixes uit de
-- migratie-RLS-sweep van 2026-07-07. Puur additief / RLS-herschrijving —
-- geen datamodel-uitbreiding, geen wijziging aan bestaand app-gedrag.
--
--   A. search_path-pin op v0_contact_requests_touch_updated_at (herstelt de
--      0049-hardening die 0053 per ongeluk terugdraaide).
--   B. Backing-index op document_chunks.website_page_id (ontbrekende index onder
--      de ON DELETE CASCADE-FK uit 0032 -> elke recrawl seq-scant document_chunks).
--   C. document_chunks SELECT-policy filtert nu chunks van soft-deleted
--      parent-documents weg (consistent met de documents-policy in 0002).

-- ---------------------------------------------------------------------------
-- A. search_path-pin. Vgl. 0049 dat de lege search_path op alle 9
--    touch-/sql-functies zette. De body raakt geen enkele tabel
--    (new.updated_at := now() -> resolvet uit pg_catalog), dus de lege
--    search_path is aantoonbaar veilig.
--    (NB comment bevat bewust niet de letterlijke pin-syntax: de grep-verify
--    hieronder telt exact 1 voorkomen.)
-- ---------------------------------------------------------------------------
alter function public.v0_contact_requests_touch_updated_at() set search_path = '';

-- ---------------------------------------------------------------------------
-- B. Backing-index op de FK-child-kolom document_chunks.website_page_id.
--    Partieel: ~helft van de chunks heeft website_page_id NULL (document-chunks).
--    GEEN `concurrently`: scripts/migrate.mjs draait elke migratie in één
--    transactie (regels 203-209) en CREATE INDEX CONCURRENTLY mag niet in een
--    transactieblok. V0 is een low-volume demo-sandbox, dus de korte
--    schrijf-lock van een gewone CREATE INDEX is verwaarloosbaar.
-- ---------------------------------------------------------------------------
create index if not exists document_chunks_website_page_idx
  on public.document_chunks (website_page_id)
  where website_page_id is not null;

-- ---------------------------------------------------------------------------
-- C. document_chunks SELECT-policy: chunks van een soft-deleted document
--    (documents.deleted_at not null) worden nu weggefilterd, net als de
--    documents-policy (0002:55-66) al deed. Chunks uit gecrawlde pagina's
--    (document_id NULL) blijven zichtbaar -- die kennen geen documents-parent.
--    Herschrijving: drop + recreate (identieke org-check + soft-delete-clausule).
--    Service-role-reads bypassen RLS ongewijzigd.
-- ---------------------------------------------------------------------------
drop policy if exists "document_chunks_select_org_members" on public.document_chunks;
create policy "document_chunks_select_org_members"
  on public.document_chunks
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
    and (
      document_id is null
      or not exists (
        select 1
        from public.documents d
        where d.id = document_chunks.document_id
          and d.deleted_at is not null
      )
    )
  );
```

**Verify**: `git status --short supabase/migrations/0055_v0_schema_rls_hardening.sql` → `A` of `??` (bestand bestaat). En:
`grep -c "search_path = ''" supabase/migrations/0055_v0_schema_rls_hardening.sql` → `1`;
`grep -c "document_chunks_website_page_idx" supabase/migrations/0055_v0_schema_rls_hardening.sql` → `1`;
`grep -c "d.deleted_at is not null" supabase/migrations/0055_v0_schema_rls_hardening.sql` → `1`.

### Stap 3: Schrijf de V1-migratie

Maak `supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` met exact deze inhoud:

```sql
-- 0027_v1_schema_rls_hardening.sql
-- Schema/RLS-hardening batch (V1). Drie fixes uit de migratie-RLS-sweep van
-- 2026-07-07. HUMAN-GATED: raakt V1-prod-datamodel + RLS.
--
-- NB volgnummer: 0026 is GERESERVEERD door plan 011 (is_jorion_admin-lockdown).
-- Deze migratie is 0027 en is onafhankelijk van 011 (geen volgorde-afhankelijkheid).
--
--   A. contact_requests SELECT-policy verbergt voortaan soft-deleted rijen
--      (consistent met threads/documents; PII-tabel -> soft-delete moet ook via
--      RLS verbergen, niet alleen via app-filters).
--   B. v1_feedback_ticket_event krijgt organization_id (multi-tenancy hard rule;
--      sibling v1_quiz_event draagt org wél). Gevuld uit de parent-ticket via een
--      BEFORE INSERT-trigger -> geen app-wijziging nodig.
--   C. document_chunks SELECT-policy filtert chunks van soft-deleted parent-docs
--      weg (dezelfde gap als V0-fix C; in V1 is dit het echte-impact-pad, want
--      V1 heeft echte per-user auth + gevulde organization_members).

-- ---------------------------------------------------------------------------
-- A. contact_requests SELECT-policy: soft-deleted PII-rijen verbergen.
--    deleteContactRequestAction (app/v1/app/contactverzoeken/actions.ts:96-113)
--    zet deleted_at LIVE; de retentie-cron wist pas na 90d op created_at, dus
--    zonder deze filter blijft een "verwijderde" PII-rij RLS-selectbaar.
-- ---------------------------------------------------------------------------
drop policy if exists "contact_requests_select_org_members" on public.contact_requests;
create policy "contact_requests_select_org_members"
  on public.contact_requests
  for select
  to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- B. v1_feedback_ticket_event.organization_id (multi-tenancy hard rule).
--    1) kolom (nullable) + FK  2) backfill uit parent-ticket
--    3) BEFORE INSERT-trigger die org uit de parent kopieert (search_path
--       gepind, vgl. fix V0-A -> we herhalen de 0053-fout niet)
--    4) NOT NULL  5) index.
--    addTicketEvent (lib/v1/feedback/db.ts:105-126) hoeft NIET te wijzigen:
--    de trigger vult organization_id bij elke insert vanuit de parent.
-- ---------------------------------------------------------------------------
alter table public.v1_feedback_ticket_event
  add column if not exists organization_id uuid
  references public.organizations(id) on delete cascade;

update public.v1_feedback_ticket_event e
  set organization_id = t.organization_id
  from public.v1_feedback_ticket t
  where e.feedback_id = t.id
    and e.organization_id is null;

create or replace function public.v1_feedback_ticket_event_set_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is null then
    select t.organization_id
      into new.organization_id
      from public.v1_feedback_ticket t
      where t.id = new.feedback_id;
  end if;
  return new;
end;
$$;

drop trigger if exists v1_feedback_ticket_event_set_org on public.v1_feedback_ticket_event;
create trigger v1_feedback_ticket_event_set_org
  before insert on public.v1_feedback_ticket_event
  for each row
  execute function public.v1_feedback_ticket_event_set_org();

alter table public.v1_feedback_ticket_event
  alter column organization_id set not null;

create index if not exists v1_feedback_ticket_event_org_idx
  on public.v1_feedback_ticket_event (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- C. document_chunks SELECT-policy: chunks van soft-deleted parent-docs
--    wegfilteren. In V1 is document_chunks.document_id NOT NULL (0002:95),
--    dus geen NULL-tak nodig. Zelfde gap als V0-fix C; hier het echte-impact-pad.
-- ---------------------------------------------------------------------------
drop policy if exists "document_chunks_select_org_members" on public.document_chunks;
create policy "document_chunks_select_org_members"
  on public.document_chunks
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
    and not exists (
      select 1
      from public.documents d
      where d.id = document_chunks.document_id
        and d.deleted_at is not null
    )
  );
```

**Verify**: `git status --short supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → bestand bestaat. En:
`grep -c "deleted_at is null" supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → `1` (contact_requests-fix);
`grep -c "add column if not exists organization_id" supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → `1`;
`grep -c "set search_path = ''" supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → `1` (trigger-functie gepind);
`grep -c "set not null" supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → `1`;
`grep -c "d.deleted_at is not null" supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → `1`.

### Stap 4: Statische verificatie (vóór de gate)

1. **Typecheck** (regressie-vangnet; er is geen TS-wijziging, dus dit moet gewoon groen blijven):
   `npm run typecheck` → exit 0, geen fouten.
2. **Migratie pickup + geen drift** (vereist DB-env; zie noot bij "Commands"):
   - `npm run migrate:status` → regel `· pending  0055_v0_schema_rls_hardening`, en géén `!! DRIFT`.
   - `npm run migrate:v1:status` → regel `· pending 0027_v1_schema_rls_hardening`, en géén `!! DRIFT`.
   - Faalt een status-commando op ontbrekende env/connectie: dat is een omgevingslimiet — noteer het en ga door.
3. **Fallback-grep** (altijd uitvoerbaar, ook zonder DB): bevestig dat geen bestaand migratiebestand is aangeraakt:
   `git status --short supabase/migrations supabase/migrations-v1` → alléén de twee nieuwe files (`0055_...`, `0027_...`) verschijnen; geen gewijzigde bestaande file.

**Verify**: `npm run typecheck` exit 0; `git status --short` toont uitsluitend de twee nieuwe migratiebestanden (+ later `plans/README.md`).

### Stap 5: Commit

Commit de twee migratiebestanden (bij voorkeur als twee logische commits, zie Git workflow). Werk daarna de statusrij van plan 012 bij in `plans/README.md` (de `| 012 |`-rij; van "TODO (plan geschreven; ⚠️ prod-apply-gate)" naar bijv. "IN PROGRESS (migraties geschreven, wacht op prod-apply-gate)") en commit dat.

**Verify**: `git log --oneline -3` toont je commits; `git status` schoon (of alleen verwachte staged wijzigingen).

### Stap 6: MENSELIJKE GATE — toepassen op prod (NIET zonder "go")

> Dit is een migratie op **V0-prod én V1-prod**. Draai de apply-commando's **uitsluitend** nadat Sebastiaan expliciet akkoord heeft gegeven. Tot dan: STOP hier en rapporteer dat de bestanden klaar staan voor review + apply.

Na Sebastiaans "go" (door Sebastiaan of onder zijn toezicht):
1. `npm run migrate` → verwacht `→ 0055_v0_schema_rls_hardening ... ✓`.
2. `npm run migrate:v1` → verwacht `→ 0027_v1_schema_rls_hardening ... ✓`.

**Post-apply-verificatie** (via `psql`/Supabase SQL-editor of MCP `execute_sql` op het juiste project — V0 vs V1):

| Fix | Check | Verwacht |
|-----|-------|----------|
| V0-A | `select proconfig from pg_proc where proname='v0_contact_requests_touch_updated_at';` | bevat `search_path=""` |
| V0-B | `select 1 from pg_indexes where tablename='document_chunks' and indexname='document_chunks_website_page_idx';` | 1 rij |
| V0-C / V1-C | `select pg_get_expr(polqual, polrelid) from pg_policy where polname='document_chunks_select_org_members';` | bevat `deleted_at` |
| V1-A | `select pg_get_expr(polqual, polrelid) from pg_policy where polname='contact_requests_select_org_members';` | bevat `deleted_at is null` |
| V1-B | `select attnotnull from pg_attribute where attrelid='public.v1_feedback_ticket_event'::regclass and attname='organization_id';` | `t` (true) |
| V0-A (advisor) | Supabase advisor `get_advisors(type: security)` op het **V0**-project | `function_search_path_mutable` noemt `v0_contact_requests_touch_updated_at` niet meer |

**Verify**: alle rijen in de tabel hierboven geven het verwachte resultaat. Werk daarna de plan-012-statusrij in `plans/README.md` bij naar `DONE (<commit-sha>; migr 0055 + 0027 op prod)`.

## Test plan

Er is **geen TS-testcode** in deze batch (puur DB-migraties + RLS). Verificatie loopt via:
- `npm run typecheck` — regressie-vangnet, exit 0 (geen app-wijziging verwacht).
- `migrate:status` / `migrate:v1:status` — bestandspickup + geen checksum-drift.
- De post-apply-SQL-checklist in Stap 6 — het echte bewijs dat de DDL correct draaide.
- **Handmatige RLS-rooktest (aanbevolen, na apply, op V1)**: met een authenticated org-member-JWT (niet service-role): (1) soft-delete een test-contactverzoek via de dashboard-knop; (2) doe een rauwe `select * from contact_requests where id = '<dat id>'` onder diezelfde user-client → verwacht **0 rijen** (vóór de fix: 1 rij). Idem voor een soft-deleted document + `select from document_chunks`.

## Done criteria

Machine-checkbaar. ALLE moeten gelden:

- [ ] `npm run typecheck` exit 0.
- [ ] `supabase/migrations/0055_v0_schema_rls_hardening.sql` bestaat en bevat fixes A, B, C (grep-checks Stap 2 slagen).
- [ ] `supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` bestaat en bevat fixes A, B, C (grep-checks Stap 3 slagen).
- [ ] `grep -l "set search_path" supabase/migrations/0055_v0_schema_rls_hardening.sql supabase/migrations-v1/0027_v1_schema_rls_hardening.sql` → toont **beide** bestanden (V0-A pint de 0053-functie; V1-B's nieuwe trigger-functie is gepind).
- [ ] `git status --short supabase/migrations supabase/migrations-v1` toont **alleen** de twee nieuwe files (geen bestaande migratie gewijzigd).
- [ ] Geen bestand buiten de in-scope-lijst gewijzigd (`git status`).
- [ ] `plans/README.md`-statusrij voor 012 bijgewerkt.
- [ ] **(Na gate)** `npm run migrate` en `npm run migrate:v1` beide `✓`; post-apply-SQL-checklist (Stap 6) volledig groen.

## STOP conditions

Stop en rapporteer (improviseer niet) als:

- De drift-check niet-leeg is, of een "Current state"-excerpt niet matcht met de live code (codebase is sinds dit plan gedrift).
- Een open PR `0055` (V0) of `0027` (V1) al claimt en je het nummer niet eenduidig kunt herschikken.
- `npm run migrate:status` / `migrate:v1:status` `!! DRIFT` meldt op een bestaande migratie — dat is een pre-existing probleem buiten dit plan.
- Een apply-commando faalt (bijv. `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` — dan is per ongeluk `concurrently` in de SQL geslopen; verwijder het) of de migratie rolt terug.
- Je merkt dat een fix een out-of-scope-bestand vereist (bijv. je denkt dat `lib/v1/feedback/db.ts` tóch moet wijzigen) — verifieer eerst of de trigger-aanpak echt niet volstaat vóór je scope uitbreidt.
- Je overweegt de uitgestelde `handle_new_auth_user`-fix alsnog toe te voegen — doe dat NIET zonder expliciete opdracht (zie Maintenance notes).
- Sebastiaan heeft geen "go" gegeven voor de prod-apply → blijf bij Stap 6 staan.

## Maintenance notes

Voor wie deze code na de merge beheert:

- **De V1-B-trigger vult `organization_id` DB-side.** `addTicketEvent` in `lib/v1/feedback/db.ts` levert bewust géén org aan; de `before insert`-trigger kopieert 'm uit de parent-ticket. Wie ooit een tweede insert-pad naar `v1_feedback_ticket_event` toevoegt: de trigger dekt dat automatisch, maar als je org expliciet wilt meesturen, mag dat (de trigger overschrijft alleen wanneer `organization_id is null`). PR-reviewer: check dat de trigger-functie `set search_path = ''` heeft en alle tabelrefs schema-qualified zijn (`public.v1_feedback_ticket`) — anders breekt hij onder lege search_path.
- **Uitgesteld — `handle_new_auth_user` nullable-email (aparte beslissing).** `public.users.email` is `not null` (`supabase/migrations-v1/0001_core_tenancy.sql:63`) maar de trigger kopieert `new.email` (`:174-177`) dat in `auth.users` nullable is. Nu onbereikbaar (V1 gebruikt uitsluitend e-mail-invites; geen anonymous/phone/e-mailloze OAuth). Zodra zo'n auth-methode wordt aangezet, faalt de signup-trigger (23502) en kan de gebruiker niet inloggen. **Niet in deze batch** omdat de fix een productkeuze vergt: (a) `users.email` nullable maken, of (b) een deterministische fallback in de trigger (`coalesce(new.email, new.id::text || '@no-email.local')`). Aanbeveling: kies (b) zodra een e-mailloze methode op de roadmap komt — het houdt het NOT-NULL-contract intact en voorkomt de signup-rollback. Vereist Sebastiaans akkoord (raakt de auth-signup-transactie).
- **Sibling-gap `parent_chunks`** (V0 `0008`, V1 `supabase/migrations-v1/0002_v1_rag_core.sql:81`) heeft exact dezelfde soft-delete-policy-gap als `document_chunks`, maar viel buiten de gebriefte scope. Als je later de RLS-consistentie volledig wilt sluiten: pas dezelfde `not exists (... documents.deleted_at ...)`-clausule toe op de `parent_chunks_select_org_members`-policy in een volgende migratie.
- **Waarom geen CONCURRENTLY:** `scripts/migrate.mjs` wrapt elke migratie in een transactie. Wil je ooit een echt CONCURRENTLY-index op prod (bij groot volume), dan moet dat buiten de runner om (los `psql`-commando) — niet via een migratiebestand.
- **PR-reviewer let op:** (1) beide policies zijn `drop + recreate` van bestaande policy-namen — bevestig dat de nieuwe USING-clausule de org-check ongewijzigd laat en alléén de soft-delete-filter toevoegt; (2) de `NOT NULL` op `v1_feedback_ticket_event.organization_id` staat ná backfill + trigger in dezelfde transactie, dus veilig op een niet-lege tabel; (3) geen enkel bestaand migratiebestand is aangeraakt (checksum-drift).
