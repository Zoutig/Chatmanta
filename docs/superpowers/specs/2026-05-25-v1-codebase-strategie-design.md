# V1 codebase-strategie — in-place naast een permanente V0-sandbox

**Datum:** 2026-05-25
**Status:** Beslist (richting), nog niet in uitvoering. Pak dit erbij bij de V1-kickoff.
**Beslisser:** Sebastiaan (solo). Brainstorm met Claude.
**Vervangt aanname uit:** `project_v1_auth_spike` (standalone losse-repo auth-spike — zie §8).

---

## 0. TL;DR — wat moet er gebeuren als Sebas zegt "ik begin met V1"

1. **Niet greenfield.** V1 wordt in-place in déze repo gebouwd, als schone laag náást V0.
2. **Eerste technische stap = auth-activatie + end-to-end verificatie.** De auth/tenancy-laag (`lib/auth.ts` + `0001_core_tenancy`) bestáát al en is compleet, maar is nog nooit met een echte sessie gedraaid. Bewijs eerst dat login → sessie → `requireOrgMember()` werkt. Dit ís de "spike", maar in-repo op een branch.
3. **Twee Supabase-projecten.** Aparte productie-DB (V1, echte PII, RLS afgedwongen) en aparte sandbox-DB (V0, fake data, losse auth). Fysieke isolatie.
4. **V0 blijft permanent** achter een geheime route `chatmanta.nl/v0` met eigen login (alleen Sebas + Niels). Geen teardown.
5. **DB-keuze zit vast aan de map**, niet aan een runtime-argument (zie §6) — dit is dé veiligheidsregel.
6. Bouwvolgorde: §11.

---

## 1. De vraag

Moet V1 (productie: echte auth, multi-tenancy, betalende testklanten) op een **volledig nieuwe codebase** (greenfield) of **op de bestaande V0-codebase** gebouwd worden?

Context: V0 is een actief RAG-leerplatform met een bewust onveilige sandbox (gedeeld `V0_DEMO_PASSWORD`, `v0_active_org`-cookie zonder autorisatie, service-role-wrappers die RLS omzeilen). Zie de V0 sandbox-disclaimer in `AGENTS.md`.

## 2. Drijfveren achter de greenfield-verleiding (Sebas)

Alle vier genoemd: (a) V0 voelt rommelig, (b) angst dat onveilige V0-patronen naar productie lekken, (c) wens voor andere/schonere architectuur, (d) psychologisch de leer-speeltuin en het echte product scheiden.

**Sleutelinzicht:** drie van de vier (a, b, d) gaan over de *schil* rond de kern, niet over de kern zelf. En op de architectuur-vraag (c) was het antwoord: *zelfde stack (Next.js 16 + Supabase + pgvector), schonere opbouw* — geen fundamenteel andere bouwstenen. Daarmee valt de enige echte reden voor greenfield weg.

## 3. Beslissing: optie C — in-place V1-laag (geen greenfield)

Drie opties afgewogen:

- **A — Greenfield (nieuwe repo, alles opnieuw):** hoogste effort/risico. Gooit getunede RAG-kernel + 31 migraties empirie weg. Alleen verdedigbaar bij fundamenteel andere stack — niet het geval. **Afgewezen.**
- **B — Nieuwe repo, kernel porten:** schone git-historie, maar kernel/migraties porten is gefriemel, verliest telemetrie-continuïteit, twee repos tijdelijk. Enige winst boven C = schone git-log. **Afgewezen.**
- **C — In-place V1-laag (gekozen):** laagste risico/effort, behoudt tuning + eval-historie, hergebruikt de al-gebouwde auth-laag.

**Doorslaggevende vondst:** de V1-fundering is geen "seeds" maar **gebouwd-en-dormant**:

- `lib/auth.ts` — compleet en echt: `requireAuth()` (`supabase.auth.getUser()`), `requireOrgMember(orgId)` (check op `organization_members`), `requireJorionAdmin()` (check `users.is_jorion_admin`). Geen stub.
- `0001_core_tenancy.sql` — volledig RLS-gehard: `organizations` + `users` (mirror van `auth.users` met `SECURITY DEFINER` sync-trigger) + `organization_members` (role-CHECK, unique pair), RLS-policies op alle drie, soft-delete.
- `lib/supabase/admin.ts` — service-role-wrappers (SA-5): `getJorionAdminClient()`, `getOrgScopedAdminClient()`, `getSystemJobClient()`.
- `lib/ai/llm.ts` — provider-abstractie (`callLLM`, `LLMProvider`, `SupportedModel`) voor Claude-primair / OpenAI-fallback.

De V0-sandbox-cookie is dus *bovenop* een werkende multi-tenant-fundering gelegd in plaats van die fundering te gebruiken. V1 = die fundering aanzetten + de schil eromheen bouwen.

## 4. V0/V1 coexistence-model (permanent, geen teardown)

- **V0 blijft permanent bestaan** als intern oefen-/tuning-instrument. Bereikbaar via geheime route `chatmanta.nl/v0` met eigen login (alleen Sebas + Niels).
- **V1 wordt het echte `chatmanta.nl`** — nieuwe gated route-groups (bv. `app/(app)/` klant-app, `app/(admin)/`, `app/login/`), alles achter `requireAuth()`/`requireOrgMember()`.
- **Harde scheiding:** V1 leest nóóit `v0_active_org`. De `orgId` komt in V1 altijd uit sessie → membership, nooit uit cookie of query-param.

## 5. Database: twee Supabase-projecten (fysieke isolatie)

- **V0-sandbox-project:** alleen fake/synthetische data, losse auth, alleen Sebas + Niels. De bewust-onveilige V0-paden zijn hier ongevaarlijk want het project bevat geen echte data.
- **V1-productie-project:** echte klant-PII, RLS afgedwongen, echte per-user auth.
- **Waarom fysiek i.p.v. gedeelde tabellen + guard:** zolang V0 en V1 dezelfde `organizations`/klantdata-tabellen delen, kan een V0-gebruiker via de service-role-paden naar een echte klant-org switchen → exact het datalek dat we willen uitsluiten. Met twee projecten kán een V0-bug productie niet raken: het heeft de credentials van die database niet. Levert ook het AVG-verhaal in één zin: *"onze interne tuning-sandbox draait op een aparte database met uitsluitend synthetische data; klantdata komt daar nooit."*

## 6. Namespace-gebonden clients (DÉ veiligheidsregel voor "één app, twee DB's")

Gekozen deploy-topologie: **V0 is een route (`/v0`) binnen dezelfde Next-app**, niet een aparte deploy. Eén app praat dan met twee databases — beheersbaar mits:

- V0-code (`lib/v0/`) importeert **uitsluitend** een eigen clientfabriek (bv. `lib/v0/supabase/*`) die hardgecodeerd de **V0-env-vars** (`V0_SUPABASE_URL`, `V0_SUPABASE_ANON_KEY`, `V0_SUPABASE_SERVICE_ROLE_KEY`) gebruikt.
- V1-code importeert het bestaande `lib/supabase/*`, dat naar het **productieproject** wijst.
- Er bestaat **geen** gedeelde client die beide kan bereiken. Welke database je raakt = welk import-pad je gebruikt = in welke map de code staat. Een V0-module kán fysiek geen productieclient construeren.

Dit haalt vrijwel de hele veiligheid van een aparte deploy binnen, ook al draait alles in één app.

## 7. Kernel-graduatie (client-geïnjecteerd)

- Verplaats de model-agnostische kern uit de `v0`-naamruimte naar neutrale huizen (`lib/rag/` bestaat al deels): retrieval (`rag.ts`), `claims.ts`, `hard-facts.ts`.
- **Geen herschrijf — pure verplaatsing**, met één aanscherping: org+chatbot-isolatieparameters blijven **verplicht en niet-optioneel** (precies wat misging bij de cross-org-leak, `eval_retrieval_org_bug`).
- **Client-injectie:** de gegradueerde kernel krijgt de Supabase-client als parameter: `runRagQuery(client, { orgId, chatbotId, … })`. V0-routes geven de V0-client, V1 de V1-client. De retrieval-kern is DB-agnostisch en draait ongewijzigd tegen beide.
- **Shared-by-contract:** de retrieval-tabellen moeten structureel gelijk blijven tussen beide projecten (de kernel vuurt dezelfde SQL). Bewaken dat ze niet uit elkaar lopen.
- **V0-only blijft:** de eval/judge/latency/HyDE-experiment-apparatuur is een V0-leerconcept en splitst eraf (`lib/rag/eval` o.i.d., alleen V0-client).
- **Bot-versioning (v0.4…v0.7.3)** is een V0-leerconcept. V1 promoveert één versie als startconfig en laat de version-switcher uit de klant-facing laag.

## 8. Auth — van dormant naar afgedwongen

- `lib/auth.ts` bestaat en is compleet, maar **nooit end-to-end gedraaid**. "Dormant" = ongetoetst.
- **Aangepaste aanname t.o.v. `project_v1_auth_spike`:** de oorspronkelijke wens was een *standalone* Supabase Auth-spike in een aparte repo, om eerst te leren. Omdat de auth-code al in deze repo bestáát en compleet is, degradeert die spike naar een **in-repo end-to-end verificatie op een branch**: login-pagina bouwen + bewijzen dat `requireAuth()`/`requireOrgMember()` met een echte sessie werken. Het leerdoel blijft, maar de losse-repo-omweg heeft weinig waarde meer.
- **Optioneel:** V0's gedeelde wachtwoord vervangen door twee échte Supabase-Auth-users (Sebas + Niels) in het V0-project — netter dan de wachtwoord-hack, gratis want apart project. Geen blocker.
- Twee logins botsen niet: aparte projecten → aparte cookienamen (Supabase namespaced per project-ref) → leven probleemloos naast elkaar op `chatmanta.nl`.

## 9. Migraties — twee streams

- **V0-project:** de bestaande migraties (0001–0031), grotendeels bevroren; zeldzame V0-schemawijziging via een `migrate:v0`-escape.
- **V1-project:** start van een **gecureerde baseline** — `0001_core_tenancy` + retrieval-tabellen + productie-`query_log`. **Niet** alle `v0_*`-experiment-migraties replayen.
- Praktisch: twee migratiemappen + een project-vlag; `npm run migrate` standaard → V1.

## 10. Guardrails (waarom in-place veilig is)

- **Grep/test-gate (niet optioneel):** faalt als een `lib/v0/`-bestand `@/lib/supabase` importeert, of als een V1-pad `lib/v0/supabase`, `v0/auth-cookie` of `v0/server/active-org` importeert. Dit is de scharnierpin die de "één app, twee DB's"-voetangel neutraliseert.
- **SA-1:** `requireOrgMember(orgId)` / `requireJorionAdmin()` bovenaan elke V1-server-action met client-input-ID.
- **Vector-search isolatie:** orgId + chatbotId verplicht, niet-optioneel.
- **Geen cookie-org in V1:** orgId altijd uit sessie → membership.

## 11. Bouwvolgorde (mapt op Bouwplan-fases; fase 1 grotendeels al af)

1. **Auth-activatie + end-to-end verificatie** — login-pagina; bewijs dat `lib/auth.ts` werkt met een echte sessie. (Dit is de in-repo "spike".)
2. **Onboarding/membership-flow** — Jorion-admin invite → service-role member-insert.
3. **Klant & chatbot-beheer** op echte RLS-tabellen (Bouwplan fase 2).
4. **Kernel-graduatie + V1 RAG-pad** achter auth (fase 4, hergebruik).
5. **Widget publieke laag** op V1-tenancy (fase 6).
6. **Hardening** (fase 7) — rate-limit/budget/CORS/prompt-injection (zie launch-blocker-milestone + `v1_rate_limit_hardening`).

## 12. Kostennoot

Twee projecten passen op de Supabase-gratis-tier, maar gratis projecten pauzeren na een week inactiviteit en hebben geen backups. Productie-V1 wil realistisch op **Supabase Pro (~$25/mnd)**: geen auto-pause + PITR-backups (sluit aan op de V2-backup-wens). V0 mag gratis blijven.

## 13. Eerlijke risico's / caveats (om niet te vergeten)

1. "Eén app, twee DB's" is méér bedrading dan twee deploys. De veiligheid leunt erop dat de grep/test-gate (§10) écht geschreven wordt en groen blijft. Niet optioneel.
2. De retrieval-tabellen zijn shared-by-contract over twee projecten — mogen niet ongemerkt uit elkaar lopen.
3. De auth-laag is gebouwd maar nooit gedraaid — stap 1 moet hem bewíjzen, niet aannemen.
4. Productie-V1 op Pro inplannen (~$25/mnd).

## 14. Open / uitgesteld

- Exacte route-group-namen en middleware-vorm voor de `/v0`-gate — bij uitvoering.
- Of de V1-RAG-tabellen het `v0_`-prefix laten vallen of (eenvoudiger voor de gedeelde kernel) identieke namen houden — bij kernel-graduatie beslissen.
- V0-login: gedeeld wachtwoord houden of upgraden naar 2 Supabase-Auth-users (§8) — optioneel.
