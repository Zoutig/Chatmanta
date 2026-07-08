# Plan 011: Sluit de V1 `is_jorion_admin` zelf-escalatie (port V0's 0013-lockdown naar V1)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3437648..HEAD -- supabase/migrations-v1 supabase/migrations/0013_lockdown_users_update.sql lib/auth.ts`
> Als een in-scope file sinds deze plan-SHA is gewijzigd, vergelijk de
> "Current state"-excerpts met de live code vóór je verdergaat; bij een
> mismatch = STOP-conditie.

## Status

- **Priority**: P1 (security / launch-blocker)
- **Effort**: S
- **Risk**: LOW-MED — geverifieerd (2026-07-08): géén enkel V1-app-pad schrijft
  `public.users` via de session-client (zie Current state), dus de lockdown kan
  feitelijk geen bestaand profiel-update-pad breken. Het restrisico zit in de
  prod-DDL zelf + de service-role-onboarding-flow (trigger mag die niet blokkeren).
- **Depends on**: none
- **Category**: security / migration
- **Planned at**: commit `3437648`, 2026-07-06
- **⚠️ Menselijke gate**: dit is een datamodel-/security-wijziging op **V1-prod**.
  Sebastiaan moet het toepassen (`npm run migrate:v1`) expliciet goedkeuren
  vóór uitvoering — zie STOP conditions.

## Why this matters

Op het V1-productieschema kan **elke ingelogde gebruiker zichzelf tot
`is_jorion_admin` promoveren** en zo interne Jorion-stafrechten krijgen: toegang
tot alle `/admin/*`-routes en de cross-org service-role-wrappers, en daarmee
lees/schrijf op **alle** tenants (inclusief bezoekers-PII in `contact_requests`).
Dat is een directe schending van de multi-tenancy-hard-rule.

De oorzaak: V1's RLS-policy `users_update_own` laat een user zijn eigen
`public.users`-rij updaten, en Postgres-RLS kan **geen kolommen** filteren. V0
loste dit op met migratie `0013_lockdown_users_update.sql` (kolom-grant-lockdown
+ trigger). **Die fix is nooit naar V1 geport.** De comment in V1's
`0001_core_tenancy.sql:86-91` erkent het gat zelf en parkeerde het naar "a later
phase" — die phase is dit plan.

Nog niet actief misbruikbaar (V1 heeft nog geen echte klant-accounts), maar het
is een **harde blocker vóór de eerste klant-invite**: zodra er een tweede
authenticated account bestaat dat je niet volledig vertrouwt, is het exploiteerbaar.

## Current state

**Het gat — V1, `supabase/migrations-v1/0001_core_tenancy.sql:86-97`:**

```sql
-- A user can update non-sensitive fields on their own row. Note: a user
-- cannot escalate themselves to is_jorion_admin via this policy because
-- the policy USING/CHECK clauses don't restrict columns — RLS on
-- Postgres can't deny per-column writes. Therefore we still require
-- column-level discipline in app code (see lib/auth.ts) and, for hardening
-- in a later phase, a column-level grant revocation.
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
```

Een grep over `supabase/migrations-v1/` (0001–0025) bevestigt: **geen**
`revoke update on public.users`, **geen** `grant update (full_name)`, en **geen**
`prevent_self_admin_escalation`-trigger. (Let op: V1's eigen `0013`-bestand is
`0013_v1_qa_items.sql` — een naamcollisie, niet de lockdown.)

**De exploitketen** — `lib/auth.ts:65-97`:

```ts
export async function requireJorionAdmin(): Promise<User> {
  const user = await requireAuth();
  const supabase = await createClient();               // anon-key + cookie = RLS session-client
  const { data: profile } = await supabase
    .from('users').select('is_jorion_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_jorion_admin) { throw ... }         // een zelf-gezette vlag leest hier true terug
  // MFA step-up faalt OPEN voor niet-ge-enrollde users (nextLevel !== 'aal2')
  ...
}
```

En `lib/supabase/admin.ts` (rond regel 39): `getJorionAdminClient()` roept
`requireJorionAdmin()` aan en geeft dan de **cross-org V1 service-role-client**
terug — dus die hele wrapper hangt aan de zelf-escaleerbare vlag.

**Geverifieerd (2026-07-08): de app-laag heeft geen enkel session-client-schrijfpad
op `public.users`.** Grep over alle `.ts`/`.tsx` op `.from('users')` levert precies
één hit: de SELECT in `lib/auth.ts:70`. `app/v1/app/account/actions.ts:58-61`
schrijft alleen `organizations.name` (service-role); e-mail/wachtwoord lopen via
Supabase Auth (`auth.users`, niet `public.users`). De `grant update (full_name)`
hieronder is dus pure pariteit met V0-0013 plus toekomst-vangnet — er is geen
bestaand gedrag dat ervan afhangt.

**Geverifieerd: de INSERT-escalatieroute is al dicht** (waarom dit plan alleen
UPDATE hoeft te sluiten): `public.users` heeft géén INSERT-policy voor
authenticated (`0001:99`: "handled by trigger"; RLS aan = deny-all), rijen ontstaan
uitsluitend via `handle_new_auth_user()` (`0001:167-188`, security definer,
search_path gepind, zet alléén id/email/full_name → `is_jorion_admin` valt op
kolom-default `false`, `0001:65`), en die functie is niet als RPC aanroepbaar
(`revoke execute`, `0001:195`).

**De te porten V0-fix — `supabase/migrations/0013_lockdown_users_update.sql`**
(lees dit bestand volledig; het is de blauwdruk). Twee lagen:

1. **Kolom-grant-lockdown** (regels 39-41):
   ```sql
   revoke update on public.users from authenticated, anon;
   grant update (full_name) on public.users to authenticated;
   ```
2. **Trigger-sluitsteen** (regels 52-76): `prevent_self_admin_escalation()`
   (`security definer`, `set search_path = public`) die een
   `is_jorion_admin`-mutatie blokkeert wanneer `auth.uid() = old.id`
   (zelf-mutatie), maar service-role doorlaat (`auth.uid()` is dan `NULL` — de
   legitieme Jorion-onboarding via `getJorionAdminClient()`).

**Geverifieerd: V1 hanteert de `revoke execute`-conventie op zulke functies** —
`0001_core_tenancy.sql:195` (op `handle_new_auth_user()`) en
`0021_v1_cache_epoch.sql:28` (op `bump_cache_epoch(uuid)`), telkens
`from public, anon, authenticated`. Neem voor de nieuwe trigger-functie dus
dezelfde regel op (Step 2); de trigger vuurt ook zonder execute-grant omdat hij
`security definer` is en aan de tabel hangt.

## Commands you will need

| Purpose            | Command                                   | Expected on success                    |
|--------------------|-------------------------------------------|----------------------------------------|
| Volgnr.-check V1   | `ls supabase/migrations-v1 \| sort \| tail -3` | hoogste = `0025_*`; nieuwe file = `0026_*` |
| Open-PR-collisie   | `gh pr list --state open --search "migrations-v1" --limit 5` | geen andere open PR claimt `0026` |
| Migratie-status V1 | `npm run migrate:v1:status`               | toont de nieuwe migratie als "pending" |
| Toepassen V1       | `npm run migrate:v1`                       | **alleen ná expliciete go van Sebastiaan** |
| Typecheck          | `npm run typecheck`                        | exit 0                                  |

## Scope

**In scope:**
- `supabase/migrations-v1/0026_v1_lockdown_users_update.sql` **(nieuw)** — de V1-port.

**Out of scope** (NIET aanraken):
- `supabase/migrations/0013_lockdown_users_update.sql` — de V0-bron; alleen lezen.
- `lib/auth.ts`, `lib/supabase/admin.ts` — de app-laag is al correct; dit is puur
  een DB-lockdown. De MFA-fail-open is een aparte, bewust gedocumenteerde keuze —
  raak 'm niet aan in dit plan.
- Elke andere migratie of RLS-policy.
- De V0-`users`-lockdown (0013) is al toegepast op V0 — niet opnieuw doen.

## Git workflow

- Branch: `feat/seb/v1-users-lockdown` (nooit direct op `main`).
- Eén commit; conventional-commit-stijl, bv.
  `fix(v1): sluit is_jorion_admin zelf-escalatie — port 0013-lockdown (migr 0026)`.
- PR met ingevuld `.github/pull_request_template.md`. **Push/merge én
  `npm run migrate:v1` alleen op expliciete go van Sebastiaan** (V1-prod-schema).

## Steps

### Step 1: Reserveer het migratienummer en bevestig het gat

Draai de volgnummer-check en de open-PR-collisiecheck (zie Commands). Bevestig
dat `0026` vrij is. Grep dan zelf het gat na:

```
grep -rn "revoke update on public.users\|prevent_self_admin_escalation\|grant update (full_name)" supabase/migrations-v1/
```

**Verwacht**: **geen** matches (het gat bestaat nog). Vind je wél een match, dan
is de lockdown mogelijk al (deels) geport → **STOP** en rapporteer.

**Verify**: bovenstaande grep → geen output.

### Step 2: Schrijf `supabase/migrations-v1/0026_v1_lockdown_users_update.sql`

Port V0's `0013` tegen het V1-project. Neem letterlijk over: de
`revoke update` + `grant update (full_name)` en de
`prevent_self_admin_escalation()`-functie + trigger uit
`supabase/migrations/0013_lockdown_users_update.sql:33-76`. Behoud de
`security definer` + `set search_path = public` op de functie. Voeg óók
`revoke execute on function public.prevent_self_admin_escalation() from public, anon, authenticated;`
toe — dat is de geverifieerde V1-conventie (0001:195, 0021:28); de trigger vuurt
ook zonder execute-grant omdat hij aan de tabel hangt.

Begin de file met een NL-commentheader in de stijl van de andere
`migrations-v1`-bestanden die uitlegt: (a) welk gat dit sluit, (b) dat het de
port van V0-0013 is, (c) dat service-role (`auth.uid() IS NULL`) ongemoeid blijft
zodat Jorion-onboarding via `getJorionAdminClient()` blijft werken.

**Let op de idempotentie-conventie** van dit repo: gebruik
`create or replace function`, `drop trigger if exists ... ` gevolgd door
`create trigger` — exact zoals V0-0013 doet — zodat de migratie herhaalbaar is.

**Verify**: `npm run migrate:v1:status` → de nieuwe `0026`-migratie verschijnt
als **pending** en de tooling parse't 'm zonder fout. (Dit past nog niets toe.)

### Step 3: Laat Sebastiaan de prod-toepassing goedkeuren, pas dan toe

`npm run migrate:v1` schrijft naar **V1-prod**. Vraag expliciete go. Na go:

**Verify**: `npm run migrate:v1` → exit 0, `0026` toegepast; daarna
`npm run migrate:v1:status` → `0026` als **applied**.

### Step 4: Bewijs dat het gat dicht is (post-migratie-check)

Na toepassing, verifieer op V1-prod dat de lockdown werkt. Als een authenticated
test-sessie beschikbaar is: een poging
`update public.users set is_jorion_admin = true where id = <eigen uid>` moet
falen (GRANT weigert de kolom; de trigger is de tweede verdedigingslaag). Kan je
niet als authenticated user testen, verifieer dan minimaal via
`get_advisors`/`information_schema` dat de kolom-grant en de trigger bestaan:

```
-- LET OP de privilege_type-filter: zonder die filter toont column_privileges óók
-- de table-level SELECT/INSERT-grants die Supabase default aan authenticated geeft
-- (per kolom geëxpandeerd) — dat is verwacht en geen fout.
select column_name from information_schema.column_privileges
  where table_name='users' and grantee='authenticated'
    and privilege_type='UPDATE';   -- verwacht: precies één rij: full_name
select tgname from pg_trigger where tgrelid='public.users'::regclass
  and not tgisinternal;            -- verwacht: users_no_self_admin_escalation
```

**Verify**: UPDATE-kolom-grant beperkt tot `full_name`; trigger
`users_no_self_admin_escalation` aanwezig.

## Test plan

Dit is een pure DB-migratie; er zijn geen TS-unit-tests. Verificatie is de
post-migratie-check (Step 4) + `npm run typecheck` (moet groen blijven — er
verandert geen TS).

- Handmatige negatieve test (sterkste bewijs): een authenticated user die
  `is_jorion_admin = true` op zichzelf probeert te zetten, krijgt een fout
  (grant-weigering of `42501` van de trigger).
- Handmatige positieve test: `full_name` bijwerken op de eigen rij blijft werken.
  NB: er is (geverifieerd) geen app-UI-pad dat dit doet — test op SQL-niveau met
  een authenticated sessie; dit is een pariteits-/toekomst-vangnet-check, geen
  regressietest van bestaand gedrag.
- Regressie: Jorion-onboarding via de service-role (`getJorionAdminClient()`)
  kan `is_jorion_admin` nog steeds op een ándere user zetten (trigger laat
  `auth.uid() IS NULL` door).

## Done criteria

- [ ] `supabase/migrations-v1/0026_v1_lockdown_users_update.sql` bestaat en bevat
      de `revoke update` + `grant update (full_name)` + trigger.
- [ ] `grep -rn "revoke update on public.users" supabase/migrations-v1/` → 1 match (de nieuwe file)
- [ ] `npm run migrate:v1:status` toont `0026` (pending vóór go, applied erna)
- [ ] `npm run typecheck` exit 0
- [ ] Post-migratie: kolom-grant = alleen `full_name`; trigger aanwezig (Step 4)
- [ ] Geen files buiten de in-scope lijst gewijzigd (`git status`)
- [ ] `plans/README.md` statusrij bijgewerkt

## STOP conditions

Stop en rapporteer als:

- Step 1's grep wél een bestaande lockdown-fragment vindt (mogelijk al deels geport).
- `0026` blijkt geclaimd door een open PR (kies dan niet zomaar `0027` — meld het,
  parallelle migraties op V1-prod zijn gevoelig).
- Sebastiaan heeft de prod-toepassing (`npm run migrate:v1`) **niet** expliciet
  goedgekeurd — schrijf dan wél de migratiefile (Step 2) maar pas 'm NIET toe.
- De post-migratie-check (Step 4) laat zien dat de kolom-grant of de trigger niet
  het verwachte effect heeft — draai niets terug op eigen houtje, meld het.
- Je merkt dat V1 geen `full_name`-kolom heeft maar een andere naam voor het
  profiel-veld (verifieer in `0001_core_tenancy.sql`) — pas de grant-kolom aan en
  meld de afwijking.

## Maintenance notes

- Dit is een **security-launch-blocker**: hij hoort vóór de eerste echte
  V1-klant-invite toegepast te zijn (zie `docs/V1_LAUNCH_TODO.md`).
- Toekomstige V1-migraties die kolommen aan `users` toevoegen moeten bewust
  besluiten of `authenticated` er `UPDATE` op mag — de brede `revoke` uit dit
  plan zet de default op "nee", wat het veilige gedrag is. De trigger is de
  vangnet-laag als iemand later per ongeluk een grant verbreedt.
- Wat een reviewer moet checken: (1) dat de service-role-pad (`auth.uid() IS NULL`)
  ongemoeid blijft zodat admin-onboarding werkt; (2) dat `full_name` (en alleen
  dat) nog updatebaar is voor de user; (3) dat de trigger `security definer` +
  `search_path`-pinned is (anders introduceer je een nieuwe advisor-warning — zie
  de 0053-search_path-drift die plan 012 adresseert).
- Bewust NIET in dit plan: de MFA-fail-open in `lib/auth.ts:86-95` (aparte,
  gedocumenteerde availability-keuze) en een geautomatiseerde test (dit repo heeft
  geen RLS-integratietest-harnas tegen een live Postgres).
