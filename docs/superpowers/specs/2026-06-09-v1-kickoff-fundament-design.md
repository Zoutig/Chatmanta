# V1 Kickoff — Fundament (2 Supabase-projecten + auth end-to-end bewezen)

**Datum:** 2026-06-09
**Status:** Ontwerp goedgekeurd (brainstorm). Klaar voor implementatieplan (writing-plans).
**Beslisser:** Sebastiaan (solo).
**Scope-beslissing:** *Fundament-only* — dit plan werkt naar één bewijsbare mijlpaal en stopt daar bewust.
**Vervangt/consolideert:** `2026-05-25-v1-codebase-strategie-design.md`, `V1_PRODUCTIEWAARDIGE_CHATBOT_CRITERIA.md`, `V0_10_V1_READY_CRITERIA.md`, `WIDGET_V1_READINESS.md`, `PLAN_V0_NAAR_PRODUCTIEWAARDIG_HANDOFF.md` — als *startpunt* voor de V1-kickoff. Die blijven als achtergrond geldig; dit is de uitvoerbare snede.

---

## 0. Samenvatting in gewone taal

Zie de database als een **kluis** met gegevens. Voor V1 willen we **twee aparte kluizen**: een oefenkluis met nepdata (dat is V0 nu) en een echte kluis met klantdata (dat wordt V1). De ene harde regel: een oefen-medewerker mag **nooit** per ongeluk de echte kluis kunnen openen.

Het meeste staat al klaar. Ook het "inlog-slot" voor V1 is al gebouwd — maar nog **nooit met een echte sleutel getest**. Dat testen is de hoofdstap van deze ronde.

Bij het verifiëren van de code vond ik twee rommelige dingen die we eerst opruimen:
1. Een zoekfunctie kiest **stiekem zelf een klant** als je vergeet te zeggen welke — gevaarlijk met echte klanten.
2. Op ~20 plekken maakt de code **een eigen master-sleutel** naar de kluis aan, in plaats van via één centrale deur te gaan — daardoor kun je straks niet afdwingen welke kluis open mag.

**De ronde, in vier blokken:**
1. Klusje 1 — de stiekeme klant-keuze weghalen (klein).
2. Klusje 2 — alle losse sleutels naar één centrale deur brengen (groter; de sleutel tot V1).
3. De tweede kluis opzetten (nieuw, leeg Supabase-project, gratis) + de automatische veiligheids-controle aanzetten.
4. Het inlog-slot voor het eerst écht testen.

Daarna stoppen we en plannen we de volgende stap opnieuw.

---

## 1. Reikwijdte & vastgelegde beslissingen

| Beslissing | Keuze |
|---|---|
| **Reikwijdte** | Fundament-only: 2 Supabase-projecten + auth e2e bewezen. Stop daarna, herplan. |
| **Architectuur** | In-place V1-laag (géén greenfield) — bevestigt `2026-05-25-v1-codebase-strategie-design.md`. |
| **Supabase-topologie** | Huidig project = V0-sandbox (blijft, gratis). Nieuw project = V1-prod. |
| **Supabase-kosten** | V1-prod start op **gratis tier**; upgrade naar Pro (~$25/mnd, PITR) pas vlak vóór er echte klantdata in komt. |
| **Aanpak** | A — prep-first, dan fundament (de goedkope de-risking eerst, dan auth bewijzen). |

**Bewust buiten deze ronde (latere mijlpalen):** `callLLM()`-implementatie + modelkeuze + her-eval · DPA/juridisch · kernel-graduatie naar `lib/rag/` · geld-kraan in V1 · widget-hardening (per-chatbot key + origin-allowlist + domeinverificatie) · klant-onboarding/provisioning · Pro/PITR-upgrade.

---

## 2. Huidige staat (geverifieerd tegen `origin/main`, 2026-06-09)

### 2.1 Al af (geshipt sinds de 2026-06-02 plannen)
PII-redactie in `logQuery()` (`lib/v0/server/log.ts:285-286,448`) · retentie-cron (`vercel.json` → `/api/v0/cron/retention`) · per-org dag-budget-cap (`lib/v0/server/budget.ts`, USD, HTTP 402) · Upstash live + fail-safe terugval (#174) · CI-build (`.github/workflows/build.yml`) · `DEPLOY.md` · bezoeker-verwijderpad (`scripts/test-delete-visitor.ts`) · bot op v0.10 (`LATEST_BOT_VERSION = V0_10.version`, gate JA 97%).

→ De geld-kraan, AVG-codelaag en ops-net staan grotendeels. Dat is precies waarom fundament-only nu klein kan zijn.

### 2.2 Dormant fundament (gebouwd, nooit met echte sessie gedraaid)
- `lib/auth.ts` — `requireAuth()` (`supabase.auth.getUser()`), `requireOrgMember(orgId)` (check `organization_members`), `requireJorionAdmin()`. Compleet, geen stub.
- `0001_core_tenancy.sql` — `organizations` + `users` (mirror van `auth.users` + sync-trigger) + `organization_members` (role-CHECK, unique pair), RLS op alle drie, soft-delete.
- `lib/supabase/admin.ts` — service-role-wrappers: `getJorionAdminClient()`, `getOrgScopedAdminClient()`, `getSystemJobClient()`.

"Dormant" = ongetoetst. §4 moet dit **bewijzen**, niet aannemen.

### 2.3 Geverifieerde vondsten die de oude plannen niet hadden
1. **`runRagQuery` defaultt stil naar `DEV_ORG_ID`.** `lib/v0/server/rag.ts` regels 469/543/583/815 (`organizationId: string = DEV_ORG_ID`) + 1507 (`input.organizationId ?? DEV_ORG_ID`). Veilig in V0, een cross-tenant-leak zodra dat pad een V1-flow raakt.
2. **Er bestaat geen `lib/v0/supabase/`-split.** V0 haalt z'n client via `@/lib/supabase/admin`. De namespace-scheiding uit de strategie-doc is toekomst, geen huidige staat.
3. **~20 modules bouwen elk hun eigen service-role-client** rechtstreeks (`createClient(url, SUPABASE_SERVICE_ROLE_KEY, …)`) buiten `admin.ts`. Geverifieerd bij o.a. `lib/v0/klantendashboard/server/metrics.ts`, `lib/commandcenter/server/customers.ts`, `lib/controlroom/server/db.ts`, `lib/v0/server/budget.ts` — allemaal hetzelfde lazy-cached `_sb`-patroon. De SA-5-discipline ("alleen via `admin.ts`") is in V0 **niet** gehandhaafd.

**Consequentie:** de strategie-doc-aanname "schrijf de cross-import grep-gate nu, hij is groen want er is geen V1-code" klopt niet. Een gate "service-role alleen via `admin.ts`" zou vandaag op ~20 bestanden falen. De gate is pas zinvol/groen ná de client-consolidatie (klusje 2) en de namespace-split (§3-blok).

---

## 3. Aanpak A (gekozen): prep-first, dan fundament

Volgorde, elk blok een eigen PR (of kleine reeks):
1. **PR-1** — `runRagQuery` orgId niet-optioneel. *(klusje 1, nu-mergebaar in V0)*
2. **PR-2** — service-role-client-consolidatie naar één fabriek. *(klusje 2, gedragsbehoudend, nu-mergebaar in V0)*
3. **§3-blok** — V1-prod-project opzetten (gratis) + gecureerde baseline + namespaced client-fabrieken + grep-gate aanzetten.
4. **§4-blok** — auth e2e bewijzen (login-pagina + echte sessie).

PR-1 en PR-2 raken geen datamodel/migratie/security-grens van V1 en zijn in V0 te mergen vóór er één V1-regel bestaat. §3 en §4 zijn de eigenlijke fundament-bouw.

---

## 4. De werkblokken (detail)

### 4.1 PR-1 — `runRagQuery` orgId niet-optioneel *(klusje 1)*
- **Files:** `lib/v0/server/rag.ts` + alle callers.
- **Wijziging:** verwijder de `= DEV_ORG_ID`-defaults (regels 469/543/583/815) en de `?? DEV_ORG_ID`-fallback (1507); maak `organizationId` een **verplichte** parameter. Callers geven de org expliciet door: het productie-/chat-pad de geresolveerde org, het eval-pad expliciet `DEV_ORG_ID`.
- **Let op:** `getPersonaById(DEV_ORG_ID)` (regels 1234/1251) is een eval-persona-lookup, ander concern — buiten scope van deze fix tenzij het in dezelfde call-keten zit.
- **Test:** unit/tsx-test die afdwingt dat de functie zonder expliciete org **niet** stil naar dev defaultt (compile-time verplicht + runtime-guard).
- **DoD:** `tsc --noEmit` groen · `test-bot-defaults.ts` groen · geen impliciete org-default meer in `rag.ts` · gedrag van het eval-pad ongewijzigd.

### 4.2 PR-2 — Service-role-client-consolidatie *(klusje 2)*
- **Probleem:** ~20 modules hebben elk een lokale `createClient(url, SUPABASE_SERVICE_ROLE_KEY)`-constructor (eigen `_sb`-cache).
- **Doel:** één centrale fabriek. Route elke ad-hoc constructor door `lib/supabase/admin.ts` (hergebruik/uitbreiden van `getSystemJobClient()` of een expliciete `getServiceRoleClient()`), met **identieke client-opties** (geen sessie-persistentie etc.) zodat het gedrag exact gelijk blijft.
- **Inventaris (af te maken in het plan):** volledige lijst via `grep -l SUPABASE_SERVICE_ROLE_KEY` over `lib/**`, `app/**`, `scripts/**`, minus `lib/supabase/admin.ts`. Bekende clusters: `lib/v0/klantendashboard/server/*`, `lib/commandcenter/server/*`, `lib/controlroom/server/*`, `lib/v0/server/*`, `lib/v0/crawler/*`, enkele `app/**`-routes.
- **Waarom dit de scharnierpin-enabler is:** zolang 20 modules zelf hun client bouwen op één gedeelde env-var, is "V0 raakt alleen de V0-DB, V1 alleen de V1-DB" niet af te dwingen. Na consolidatie is er **één plek** die de env-var leest → §3 kan die plek in tweeën splitsen i.p.v. opnieuw 20 bestanden te bewerken.
- **Gedragsbehoudend:** dit is een refactor, geen functiewijziging. Smoke-test de getroffen oppervlakken (dashboard laadt, budget-check werkt, crawler-log schrijft).
- **DoD:** geen `createClient(…SERVICE_ROLE_KEY…)` meer buiten de fabriek (grep = 0 hits buiten `lib/supabase/admin.ts`) · `tsc --noEmit` groen · build groen · betrokken UI/oppervlakken gerookt.

### 4.3 §3-blok — V1-prod opzetten + namespace-split + grep-gate
- **Nieuw Supabase-project** (V1-prod), regio West-Europa, **gratis tier**. Env-vars onder een eigen namespace (`V1_SUPABASE_URL` / `V1_SUPABASE_ANON_KEY` / `V1_SUPABASE_SERVICE_ROLE_KEY`); huidige project blijft V0 onder z'n bestaande/`V0_*`-vars.
- **Gecureerde baseline-migraties** in een aparte stream voor het V1-project: `0001_core_tenancy` + retrieval-tabellen + productie-`query_log`. **Niet** de `v0_*`-experiment-migraties replayen. (Exacte migratiemap-/project-vlag-aanpak: execution-detail voor het plan.)
- **Namespaced client-fabrieken:** split de centrale fabriek uit PR-2 in een V0-fabriek (leest `V0_*`, voor `lib/v0/**`) en de bestaande `lib/supabase/admin.ts` (leest V1/prod, voor V1-code). V0-modules repointen naar de V0-fabriek.
- **Open execution-detail:** waar leven de interne admin-/`cc_*`/`admin_*`-tabellen (commandcenter/controlroom) onder de split? Default-voorstel: bij V0 (intern, nepdata-omgeving); V1-prod bevat alléén echte klantdata. Vast te leggen in het plan.
- **Grep/CI-gate aanzetten** (in `build.yml` + een `scripts/check-imports.*` + npm-script). Regels: faalt als `lib/v0/**` de V1/prod-fabriek importeert · als een niet-V0-pad de V0-fabriek of `active-org`/`v0_active_org` importeert · als ergens nog `createClient(…SERVICE_ROLE_KEY…)` buiten de fabrieken staat. Na PR-2 + de split is hij **groen** en bewaakt hij voortaan de scheiding.
- **DoD:** V1-prod-project bestaat + baseline-migraties toegepast · twee namespaced fabrieken actief · grep-gate groen in CI · V0 blijft volledig werken tegen z'n eigen project.

### 4.4 §4-blok — Auth e2e bewijzen
- **Route-group + login-pagina** voor V1 (bv. `app/(app)/login` + één beschermde pagina). Exacte route-group-namen: execution-detail.
- **Echte flow:** inloggen via Supabase Auth (V1-project) → `requireAuth()` geeft de gebruiker → `requireOrgMember(orgId)` bevestigt membership tegen `organization_members` → beschermde pagina rendert alleen bij geldige membership; weigert anders.
- **Seed:** minimaal één echte Auth-user + één org + één membership-rij in het V1-project (handmatig of via een seed-script).
- **Bewijs:** handmatige doorloop (browser) + een geautomatiseerde test die de happy path én de weiger-path dekt.
- **DoD:** "inloggen werkt aantoonbaar" — een echte sessie passeert `requireAuth`/`requireOrgMember` en opent een beschermde V1-pagina; een niet-lid wordt geweigerd.

---

## 5. Definition of Done — Fundament

De ronde is af wanneer **alle** waar zijn:
1. PR-1 + PR-2 gemerged in V0 (orgId niet-optioneel; geen losse service-role-clients meer).
2. V1-prod Supabase-project bestaat met de gecureerde baseline; V0 draait ongewijzigd tegen z'n eigen project.
3. Twee namespaced client-fabrieken + een **groene** grep/CI-gate die de V0/V1-scheiding bewaakt.
4. Auth e2e **bewezen**: echte login → sessie → `requireOrgMember()` → beschermde pagina; weiger-path werkt.
5. Kort vastgelegd in een `docs/`-statusnotitie.

Daarna: **stop en herplan** voor de volgende mijlpaal.

---

## 6. Open beslissingen (bewust uitgesteld — met waar ze thuishoren)

| Beslissing | Hoort bij |
|---|---|
| Modelkeuze voor `callLLM()` + her-eval na de model-swap | Mijlpaal "LLM-laag + her-eval" |
| DPA-template + sub-processor-lijst tekenen | Vóór eerste echte klant |
| Upgrade V1-prod naar Supabase Pro (~$25/mnd) + PITR | Vlak vóór echte klantdata |
| Kernel-graduatie (`lib/v0/` retrieval → `lib/rag/`, client-geïnjecteerd) | Volgende mijlpaal na fundament |
| Route-group-namen + middleware-vorm voor de V1-gate | Execution (§4) |
| `v0_`-prefix op V1-RAG-tabellen behouden of laten vallen | Execution (kernel-graduatie) |
| V0-login: gedeeld wachtwoord houden of 2 Supabase-Auth-users | Optioneel, execution |
| Plek van `cc_*`/`admin_*`-tabellen onder de split | Execution (§3) |

---

## 7. Risico's / caveats
1. **De grep-gate is de scharnierpin** van het 2-DB-model — moet écht geschreven worden en groen blijven (§3). Niet optioneel.
2. **Retrieval-tabellen zijn shared-by-contract** over twee projecten — mogen niet ongemerkt uit elkaar lopen (relevant zodra de kernel graduates; in deze ronde alleen de baseline neerzetten).
3. **De auth-laag is gebouwd maar nooit gedraaid** — §4 moet hem bewijzen, niet aannemen.
4. **PR-2 is een brede refactor** (~20 bestanden) — gedragsbehoudend, maar rook de getroffen oppervlakken; één gemiste client-optie kan gedrag verschuiven.
5. **Gratis V1-tier pauzeert na 7 dagen inactiviteit** en heeft geen PITR — acceptabel zolang er geen echte data in zit; de Pro-upgrade is een harde gate vóór de eerste klant.

---

## 8. Volgende mijlpaal (exit)
Na het fundament: opnieuw plannen, met als waarschijnlijke eerste kandidaat de **kernel-graduatie + een V1-RAG-pad achter auth** — zodat een ingelogde gebruiker een echte (nog: test-)bot kan bevragen tegen het V1-project. Dat is een eigen brainstorm → spec → plan.
