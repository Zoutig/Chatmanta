# V1 Fundament — §3 + §4 (2e Supabase-project + namespace-split + grep-gate + auth e2e)

**Datum:** 2026-06-24
**Status:** Ontwerp — wacht op gebruiker-review vóór `writing-plans`.
**Beslisser:** Sebastiaan (solo).
**Branch / worktree:** `feat/seb/v1-fundament-s3` · `C:\Users\solys\Documents\Code\chatmanta-v1-fundament`
**Vervolg op:** `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md` (de kickoff). Dit doc is de uitvoerbare snede voor de twee resterende blokken §3 + §4. PR-1 (#208, orgId verplicht) en PR-2 (#209, service-role-consolidatie) zijn **gemerged**.

---

## 0. Samenvatting in gewone taal

We hebben één "kluis" (database): de V0-oefenkluis met nepdata. Voor V1 zetten we een **tweede, lege kluis** neer (V1-prod) en zorgen dat oefen-code nooit per ongeluk de echte kluis kan openen. Daarna bewijzen we voor het eerst dat het **inlog-slot** (auth) écht werkt met een echte sleutel.

Twee blokken, twee PR's:

- **PR-3 (§3):** tweede Supabase-project aanmaken (gratis), de code-"sleutelbossen" (Supabase-clients) per kluis splitsen, en een automatische controle (grep-gate in CI) aanzetten die afdwingt dat V0-code alleen de V0-kluis raakt en V1-code alleen de V1-kluis.
- **PR-4 (§4):** een echte login bouwen tegen de V1-kluis en aantonen dat inloggen → lidmaatschap-check → beschermde pagina werkt, en dat een niet-lid geweigerd wordt.

Daartussen een **checkpoint**: V0 draait ongewijzigd, de gate is groen, de V1-kluis staat — pas dan §4.

---

## 1. Vastgelegde beslissingen (deze ronde)

| # | Beslissing | Keuze |
|---|---|---|
| 1 | **Scope** | Eén gecombineerde §3+§4-spec & plan; **bouwen als 2 opeenvolgende PR's** met checkpoint ertussen. |
| 2 | **Env-var-naming** | Beide hernoemen: `V0_*` en `V1_*`. `NEXT_PUBLIC_`-prefix alléén waar de browser het leest (V1-anon). |
| 3 | **V1-migraties** | Git-tracked `supabase/migrations-v1/` als source of truth; toepassen via Supabase **MCP `apply_migration`** (pooler-block vanaf dev-machine). Runner generaliseren naar `migrate:v1`. |
| 4 | **V1-baseline (deze ronde)** | **Minimaal**: alléén `0001_core_tenancy`. Retrieval-tabellen + `query_log` pas bij de kernel-graduatie. |
| 5 | **Factory-topologie** | Asymmetrisch: V0 service-role blijft op huidig pad (0 churn); V1-clients nieuw/verplaatst onder `lib/supabase/v1/`. |
| 6 | **`cc_*`/`admin_*`-tabellen** | Blijven op V0 (geen `organization_id`, interne tooling). Geen migratie. |
| 7 | **V0 demo-login** | Ongewijzigd (gedeeld wachtwoord). Buiten scope. |

---

## 2. Architectuur — factory-topologie

**Geverifieerde uitgangssituatie (Explore-recon, 2026-06-24):** alle Supabase-env-reads lopen door 4 bestanden; live V0-verkeer raakt **alleen** de service-role-factory. De anon/sessie-client (`lib/supabase/server.ts`) wordt enkel door de dormante auth-laag gebruikt; de browser-client (`lib/supabase/client.ts`) door niemand. `lib/auth.ts` (`requireAuth`/`requireOrgMember`/`requireJorionAdmin`) is volledig dormant (geen live callers). De grep-gate bestáát al als unit-test (`lib/supabase/__tests__/no-adhoc-service-client.test.ts`) maar draait **niet** in CI.

### Doel-layout

| Client | Locatie | Database | Env | Consumenten |
|---|---|---|---|---|
| `getServiceRoleClient()` | `lib/supabase/service-role.ts` *(pad ongewijzigd)* | **V0** | `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY` | ~20 bestaande V0-importers + `getSystemJobClient` — **0 import-churn** |
| `getSystemJobClient()` | `lib/supabase/admin.ts` | **V0** | (via `getServiceRoleClient`) | V0 cron/system jobs — gedrag ongewijzigd |
| anon/sessie `createClient()` | `lib/supabase/v1/server.ts` *(verplaatst van `lib/supabase/server.ts`)* | **V1** | `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY` | `lib/auth.ts` (§4) |
| browser `createClient()` | `lib/supabase/v1/client.ts` *(verplaatst van `lib/supabase/client.ts`)* | **V1** | idem `NEXT_PUBLIC_V1_*` | V1-login-form (§4) |
| `getV1ServiceRoleClient()` | `lib/supabase/v1/service-role.ts` *(nieuw)* | **V1** | `NEXT_PUBLIC_V1_SUPABASE_URL` (gedeelde project-URL), `V1_SUPABASE_SERVICE_ROLE_KEY` | dormante `getJorionAdminClient`/`getOrgScopedAdminClient` — geen runtime-effect deze ronde |

**Belangrijke nuance — `admin.ts` is gemengd:** `getSystemJobClient()` blijft V0 (huidige V0-cron/jobs), terwijl `getJorionAdminClient()`/`getOrgScopedAdminClient()` (V1-auth-gated, dormant) naar de V1 service-role-factory wijzen. Dit is correct én minimaal — beide laatste hebben nu nul callers, dus repointen heeft geen runtime-effect. (Te herzien bij kernel-graduatie wanneer V1 ook system jobs krijgt.)

### Waarom asymmetrisch (aanbevolen) — en wat verworpen is

- **Gekozen (A):** V0 service-role op z'n huidige pad laten = nul wijzigingen aan de 20+ V0-importers (geen herhaling van de PR-2-churn). Alleen de V1-bestemde clients verhuizen naar `lib/supabase/v1/`, wat de grep-gate **per pad** afdwingbaar maakt.
- **Verworpen (B) — symmetrische `v0/` + `v1/` subdirs:** 20+ import-rewrites voor nul winst; V0 gebruikt toch alleen service-role.
- **Verworpen (C) — één factory met `project`-parameter:** ondergraaft de grep-gate (kan niet statisch afdwingen welke DB een module raakt). De gate is juist de scharnierpin van het 2-DB-model.

---

## 3. §3 — werkblok (PR-3)

1. **V1-prod Supabase-project** aanmaken: regio West-Europa (`eu-west-1`), **gratis tier**. Via MCP `create_project` — **ná expliciete go van Sebastiaan** (externe resource). Project-ref + keys noteren.
2. **Env-vars** (`.env.local` lokaal + worktree, Vercel, GitHub-secrets, `build.yml`):
   - V0 → `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY` (server-only; V0 heeft geen browser-client meer → `NEXT_PUBLIC_` vervalt — mits §5-verificatie klopt).
   - V1 → `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY`, `V1_SUPABASE_SERVICE_ROLE_KEY`, `V1_DATABASE_URL` (voor `migrate:v1`).
   - **Veilige cutover** (detail in het plan): nieuwe vars eerst zetten + deployen, dan pas oude verwijderen — voorkomt de "env werkt pas na redeploy / foute URL = 500 op rate-limited routes"-valkuil.
3. **Factory-split** zoals §2: `service-role.ts` env→`V0_*`; nieuwe `lib/supabase/v1/{service-role,server,client}.ts`; `lib/auth.ts` en `admin.ts`-wrappers repointen naar de V1-clients; `lib/supabase/server.ts`/`client.ts` opheffen (enige importers mee-verhuizen: `lib/auth.ts` en eventueel de login-form).
4. **V1-baseline-migratie**: `supabase/migrations-v1/0001_core_tenancy.sql` (kopie van de bestaande core-tenancy). Runner generaliseren: lees `MIGRATE_DIR` (default `supabase/migrations`) en `MIGRATE_DB_URL` (default `DATABASE_URL`); `migrate:v1` = die twee gericht op `supabase/migrations-v1` + `V1_DATABASE_URL`. **Toepassen via MCP `apply_migration`** + ledger-rij in V1's `public._migrations`.
5. **Grep-gate uitbreiden** (`lib/supabase/__tests__/no-adhoc-service-client.test.ts`):
   - alléén `lib/supabase/service-role.ts` mag `V0_SUPABASE_SERVICE_ROLE_KEY` + `createClient` bevatten;
   - alléén `lib/supabase/v1/service-role.ts` mag `V1_SUPABASE_SERVICE_ROLE_KEY` + `createClient` bevatten;
   - `lib/v0/**` (+ `lib/commandcenter/**`, `lib/controlroom/**`) mag **niet** uit `lib/supabase/v1/**` importeren;
   - V1-paden (`lib/auth.ts`, de V1-route-group) mogen **niet** de V0 `service-role.ts` importeren;
   - geen ad-hoc `createClient(…SERVICE_ROLE_KEY…)` buiten de twee factories (bestaande regel).
6. **CI**: `npm run test:unit`-stap toevoegen aan `.github/workflows/build.yml` vóór `build` (gate draait nu niet in CI).
7. **Gedragsbehoud V0**: smoke dashboard / budget-check / crawler-log; grep-gate groen; `tsc --noEmit` + `next build` groen.

**DoD §3:** V1-project bestaat + `0001_core_tenancy` toegepast · twee namespaced factories actief · grep-gate **groen in CI** · V0 draait volledig tegen z'n eigen project (env hernoemd, gedrag identiek).

---

## 4. §4 — werkblok (PR-4)

- **V1-login-route los van de V0-gate**: bv. `/v1/login` + één beschermde pagina (bv. `/v1/app`). Provisionele naam — definitief bij kernel-graduatie. **V0-demo-gate-exemptie uitbreiden** zodat de V1-routes niet achter het V0-demo-wachtwoord vallen (zelfde patroon als `/embed`).
- **`middleware.ts`** voor Supabase sessie-refresh (`@supabase/ssr`), **matcher strikt gescoped** op de V1-routes — raakt expliciet **niet** `/embed`, `/api/v0/*`, `/widget.js` of andere V0/widget-paden.
- **Flow**: login (V1 browser-client, `NEXT_PUBLIC_V1_*`) → `requireAuth()` → `requireOrgMember(orgId)` tegen V1 `organization_members` → beschermde pagina rendert; niet-lid → weigeren. **Geen service-role** — alles via de anon/sessie-client onder RLS.
- **Seed** in V1 (via MCP): 1 echte Auth-user + 1 org + 1 membership-rij.
- **Test**: Playwright e2e — happy path (lid ziet pagina) + weiger-path (niet-lid geweigerd) + onge-authenticeerd → redirect `/v1/login`.

**DoD §4:** echte login → sessie → `requireOrgMember()` → beschermde V1-pagina; weiger-path werkt; e2e groen. Auth is **bewezen**, niet aangenomen.

---

## 5. Te verifiëren tijdens de bouw (geen aanname)

1. **Widget-SSG-build**: of `/embed/[slug]` `generateStaticParams` inderdaad alleen V0 url+service-role nodig heeft (verwacht ja → `NEXT_PUBLIC_` kan van V0 af). Zo niet: V0 url als `NEXT_PUBLIC_V0_SUPABASE_URL` houden.
2. **V0-gate-exemptie + middleware-matcher**: exact bepalen waar de V0-demo-gate wordt afgedwongen (`lib/v0/...`/proxy/`requireV0Auth`) zodat de V1-routes erbuiten vallen én de middleware geen V0/widget-pad raakt.
3. **Pooler-bereikbaarheid V1**: of het nieuwe project (andere host/ref) tóch bereikbaar is vanaf de dev-machine; zo niet, MCP blijft het apply-kanaal.

---

## 6. Volgorde & checkpoint

PR-3 (§3) eerst volledig bouwen + mergen → **checkpoint**: V0 draait ongewijzigd tegen V0-project · grep-gate groen in CI · V1-project staat met baseline. **Dán** PR-4 (§4). Elke PR z'n eigen worktree-fase indien gewenst; deze worktree draagt spec + plan.

---

## 7. Definition of Done — ronde

1. PR-3 + PR-4 gemerged.
2. V1-prod-project bestaat met `0001_core_tenancy`; V0 draait ongewijzigd tegen z'n eigen project.
3. Twee namespaced factories + **groene** grep/CI-gate die de V0/V1-scheiding bewaakt.
4. Auth e2e **bewezen** (happy + weiger).
5. Korte statusnotitie in `docs/` + memory-update.

Daarna: **stop en herplan** (waarschijnlijke volgende mijlpaal: kernel-graduatie + V1-RAG-pad achter auth).

---

## 8. Risico's / caveats

1. **Env-rename = brede cutover** (Vercel + GitHub-secrets + `build.yml` + reads). Foute/ontbrekende var → 500's of build-fail. Mitigatie: nieuwe vars eerst + deploy, dan oude weg; startup-assert uitbreiden.
2. **De grep-gate is de scharnierpin** — moet groen blijven in CI, niet alleen lokaal.
3. **Gratis V1-tier pauzeert na 7 dagen inactiviteit**, geen PITR — acceptabel zolang er geen echte data in zit; Pro-upgrade is een harde gate vóór de eerste klant.
4. **De auth-laag is gebouwd maar nooit gedraaid** — §4 moet hem bewijzen.
5. **Middleware-scope**: een te brede matcher kan V0/widget-verkeer raken (perf + cookie-gedrag). Strikt scopen + verifiëren.
6. **`admin.ts` gemengd V0/V1** (zie §2-nuance) — bewust; de V1-wrappers zijn dormant, dus geen runtime-risico deze ronde.

---

## 9. Bewust buiten scope (latere mijlpalen)

`callLLM()`-implementatie + modelkeuze + her-eval · DPA/juridisch · kernel-graduatie (`lib/v0/` retrieval → `lib/rag/`, client-geïnjecteerd) · retrieval-tabellen + `query_log` in V1 · geld-kraan in V1 · widget-hardening (per-chatbot key + origin-allowlist + domeinverificatie) · klant-onboarding/provisioning · Supabase Pro/PITR-upgrade · V0-login naar Supabase-Auth.
