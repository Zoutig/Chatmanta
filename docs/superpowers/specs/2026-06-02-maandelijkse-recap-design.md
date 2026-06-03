# Maandelijkse Recap — Grounded Design Spec

> **Bron:** intake van `ChatManta_Maandelijkse_Recap.md` (Niels) via `/intake` op 2026-06-02.
> **Status:** gegronde spec — 3 beslissingen vastgelegd (2026-06-03); wacht op go/no-go + worktree-keuze vóór build.
> **Route:** `big-ship` aanbevolen (multi-subsystem: migratie + 2 pagina's + AI-generatie + PDF + nieuwe dependency). `ship-feature` is het lichtere alternatief.

---

## Intake-preamble

### Wat Niels voorstelt → wat we bouwen (Niels-diff)

| Niels stelt voor | We bouwen | Waarom |
|---|---|---|
| Tabellen met kolom **`client_id`** | **`organization_id uuid not null`** | `client_id` bestaat nergens in het schema, heeft geen FK-target (er is geen `clients`-tabel). De hele `lib/controlroom/server/*`-laag bindt op `organization_id`. `client_id` zou stilletjes onquery­baar zijn. |
| Tabellen `monthly_recaps` / `recap_signals` | **`admin_monthly_recaps` / `admin_recap_signals`** | De RLS-off carve-out is in élke migratie-comment expliciet gescoped op `admin_*`-tabellen. Zonder die prefix mist het RLS-off-besluit zijn gedocumenteerde rechtvaardiging (en faalt audit). |
| "AI bepaalt het model" | **`gpt-4o-mini` hardcoded** via `chatComplete()` | Modelkeuze is Sebastiaans beslissing, geen feature-logica. `gpt-4o-mini` ≈ $0,0002/recap; `gpt-4o` is 16× duurder zonder kwaliteitswinst voor een korte NL-prozasamenvatting. |
| **AI genereert de signaleringen** | **Signaleringen deterministisch in code**; LLM schrijft alléén de prozasamenvatting | De 6 regels zijn harde drempels (>20% onbeantwoord, piekuur buiten kantooruren, <30s, <2 berichten, geen gebruik). Een LLM op getal-drempels = hallucinatie-risico. Deterministisch = testbaar + 0 hallucinatie. |
| Maandselectie default = "meest recente volledige maand" | ✅ overgenomen — **default = laatst afgesloten kalendermaand** | Goede aanname van Niels. We voegen toe: een "Lopende maand (onvolledig)"-optie met waarschuwingstoon. |
| Stats "altijd opnieuw opgehaald bij genereren" (gesnapshot in DB-kolommen) | Stats **live berekend** uit bestaande helpers; alléén de AI-samenvatting + notities + signaal-triage worden opgeslagen (afhankelijk van Q1) | Afgesloten maanden veranderen niet → live berekenen = identiek aan snapshotten, maar zonder stat-kolom-duplicatie. Hergebruikt de bestaande aggregatie i.p.v. een derde kopie. |
| Top-vragen met "geclusterde variant" | Hergebruik bestaande top-vragen: `getTopQuestions()` (goedkoop, geen embeddings) **óf** de al-bestaande `faq_snapshot`-tabel per maand-window | "Clustering" is een niet-triviale embeddings-stap die al twee keer bestaat. Geen derde clustering-pad bouwen. |

### Overlap-verdict (radar)

**CLEAR-but-REUSE-HEAVY.** Er bestaat **geen** "Maandelijkse Recap" — geen pagina, route, doc, spec, plan, memory-entry of (open/merged) PR. Het dupliceert dus niets. **Maar** vrijwel élk getal dat een recap nodig heeft, ship al:

| Hergebruik-bron | Wat het levert | Locatie |
|---|---|---|
| `usage.ts` | `getThreadCount`, `getQueryLogStats` (totaal + fallback), `getMonthlyCostUsd`, datum-helpers — **alle per-org helpers accepteren een willekeurige `sinceIso`** → historische maanden werken gratis | `lib/controlroom/server/usage.ts` (#150) |
| `overview.ts` | `getControlRoomKlanten()` + `buildOverviewSummary()` → cross-org rollup (conversaties/week+maand, kosten, attentie-lijsten) in één keer | `lib/controlroom/server/overview.ts` |
| `signals.ts` | `getOrgSignals(slug, orgId)` → per-org `conversationsThisMonth`, `unansweredCount`, `fallbackPct`, `monthCostUsd`, `widgetStatus`, `lastActivityAt` | `lib/controlroom/server/signals.ts` |
| top-vragen | `getTopQuestions(orgSlug, config)` (goedkoop) **of** `faq_snapshot`-tabel (clustering, append-only, query per `generated_at`-maand) | `lib/v0/klantendashboard/server/top-questions.ts` · `lib/v0/server/faq-snapshot.ts` |
| per-klant kwaliteit | `getOverviewMetrics`, `getConversationSuccessRate`, `getUnansweredQuestions` | `lib/v0/klantendashboard/server/metrics.ts` · `conversations.ts` |
| UI-template | `DailyCostChart` (CSS-only, 0 deps) + de Usage-pagina als pagina-/UI-sjabloon | `app/admindashboard/usage/page.tsx` · `components/daily-cost-chart.tsx` |

**Niet verwarren (related-but-distinct):** de twee feedback-systemen (bezoeker-duim-omlaag `v0_feedback` vs operator-inbox `admin_feedback`, #151/#160) en het nooit-gebouwde Commandcenter "Wekelijkse check-ins"-concept. Een recap is een *gebruiks­digest*, geen inbox en geen CRM-cadans.

### Scope-verdict

**V0-now.** Dit is een admin-intern (Niels-only) rapportage-feature over bestaande sandbox-data — past binnen V1 Minimal Build Scope en vereist géén V1-auth. De enige plek die per-user-identiteit aanneemt is **"Gegenereerd door: Niels Jochems"** → hardcoden als statische string (V1 vervangt dit door echte auth). Geen V2/V3-werk vooruit getrokken.

### Kosten & effort

- **LLM-kosten:** ~700 tokens in + ~150 uit op `gpt-4o-mini` = **~$0,0002/recap** (verwaarloosbaar). Zelfs elke org dagelijks her-genereren blijft onder één cent. **Geen** cost-cap/rate-limit op de LLM-call nodig — wel een client-side debounce (`useTransition` disabled-state, zoals `ReloadButton`) op "Opnieuw genereren" tegen dubbel-submits. Enige echte kosten-as = DB-leesvolume op grote `query_log`-scans → hergebruik de bestaande 20k-rij-cap.
- **Effort:** **volledig pad gekozen ≈ 6 milestones** — (1) migratie 0046 + datalaag `recap.ts` + 2 `usage.ts`-helpers + `redactPii`; (2) deterministische signaleringen (pure fn + tests); (3) LLM-proza via `chatComplete`; (4) cross-org overzichtspagina + sidebar-NavItem; (5) per-klant detailpagina + notities + signaal-triage + archief; (6) PDF-export (`@react-pdf/renderer` + GET route handler + auth/org-isolatie).

### Pitch-scorecard (volledigheid van Niels' MD)

| As | Beoordeling |
|---|---|
| **Datamodel** | **Onjuist** — `client_id` bestaat niet; tabelnamen missen `admin_*`-prefix. Geen besef van de `query_log`↔`v0_threads`-ontkoppeling (de dominante structurele realiteit) of wélke van de twee "onbeantwoord"-definities. |
| **Randgevallen** | **Grotendeels afwezig** — wél benoemd: geen-data, AI-faal, opnieuw-genereren, geen-gebruik, PDF-faal. Niét: visitor_id-NULL-onderbtelling, 30d-cookie-herhaalbezoeker, lopende-maand-deels-leeg, regeneratie-overschrijf-semantiek, fan-out-faal-isolatie. |
| **Auth/AVG** | **Dun** — admindashboard heeft geen layout-niveau auth-gate (leunt op proxy + per-action `requireV0Auth`). Geen `KNOWN_ORGS`-validatie, geen PII-redactie van getoonde vraagteksten genoemd. |
| **Kosten** | **Misleidend indien gespecificeerd** — "AI bepaalt model" delegeert ten onrechte een Sebastiaan-beslissing; echte kost <$0,0002. |
| **Algemeen** | Structureel onafgemaakt maar **elke gap is mechanisch fixbaar** en de feature is bouwbaar in V0 door bestaande aggregatie te hergebruiken. |

> **Eigen MD-bevinding (lens-agents zagen de MD-tekst niet door een workflow-bug; hieronder uit directe lezing):**
> 1. **Interne tegenspraak in de signaal-regels:** het MD-voorbeeld (Sectie 5) laat piekuur **21:00** "gebruik buiten kantooruren" triggeren, maar de regel definieert het venster als **22:00–07:00** — 21:00 valt daar niet in. → Eén bron van waarheid kiezen voor "buiten kantooruren" (voorstel: 20:00–07:00 of expliciet ≥21:00).
> 2. **`<30s gespreksduur` is mis-gekalibreerd** tegen de werkelijke meting: duur = `updated_at − created_at` (proxy). Eén-beurt-gesprekken hebben een mini-duur → de regel vuurt bijna altijd. Drempel heroverwegen of regel schrappen.
> 3. **`<2 berichten/gesprek` is dubbelzinnig:** één Q&A = 1 user + 1 assistant = **2 berichten** (= 1 beurt). Als "berichten" = rijen, is `<2` onmogelijk (minimum 2). Als "berichten" = beurten, betekent `<2` "alle één-beurt-gesprekken" — dat is de norm, niet een afwijking. → Definiëren als beurten en de drempel her-ijken.
> 4. **`draft`/`final`-status:** een recap wordt op-trigger gegenereerd (heeft dus altijd inhoud). Wanneer is hij ooit "draft"? Lifecycle verduidelijken (voorstel: `draft` = gegenereerd maar nog niet door Niels "opgeslagen"/afgerond).

---

## De gegronde spec

### Architectuur in één plaatje

```
app/admindashboard/maandelijkse-recap/
  page.tsx                      ← Pagina 1: cross-org overzichtstabel + maandselectie   (Q2)
  [orgSlug]/page.tsx            ← Pagina 2: detail per klant per maand                   (Q2)
  components/                   ← client-bits (maand-selector, genereer-knop, notities, signaal-acties)

lib/controlroom/server/recap.ts ('server-only')
  - getRecapForOrgMonth(slug, orgId, year, month)   → stats (live) + opgeslagen artefacten
  - listRecapMonths(orgId)                           → archief
  - computeSignals(stats)                            → deterministisch, pure functie (testbaar)
  - generateRecapSummary(stats, signals)             → LLM-proza via chatComplete() (gpt-4o-mini)
  + hergebruik usage.ts / signals.ts / overview.ts / top-questions.ts

lib/controlroom/server/usage.ts  (uitbreiden)
  + getMonthlyCostUsdForRange(orgId, sinceIso, untilIso)
  + getDailyCostForMonth(orgId, year, month)         ← variant van getDailyCostThisMonth

app/actions/controlroom.ts  (of nieuw recap-action-bestand, 'use server')
  - generateRecapAction(slug, year, month)           → requireV0Auth, org server-side uit KNOWN_ORGS
  - saveRecapNotesAction(...)                          (Q1)
  - setSignalStatusAction(...)                         (Q1)

supabase/migrations/0046_admin_monthly_recap.sql     ← alléén bij Q1=persistentie; /check-migration eerst
```

### Datalaag — stats strikt per bron gepartitioneerd

**Dominante structurele realiteit:** `query_log` heeft **geen `thread_id` FK** (geverifieerd in migratie 0003). Elke `query_log`-rij is één beurt zonder pointer naar zijn thread. **Geen join bouwen.**

| Stat | Bron | Query / helper | Caveat in UI |
|---|---|---|---|
| Totaal gesprekken | `v0_threads` | `getThreadCount(orgId, sinceIso)` + maand-bovengrens | — |
| Gem. gespreksduur | `v0_threads` | `updated_at − created_at`, gemiddeld | label: "proxy — tijd tot laatste activiteit, geen sluittijd" |
| Unieke bezoekers | `v0_threads` | `COUNT(DISTINCT visitor_id) WHERE visitor_id IS NOT NULL` | sublabel: **"alleen widget-bezoekers"** (testtool/admin-threads hebben geen cookie); 30d-cookie → terugkerend na 30d telt opnieuw |
| Gem. berichten/gesprek | `v0_thread_messages` | `COUNT(*) / threads`; user+assistant-paar = 2 rijen → `/2` = beurten | label kiezen: berichten vs beurten (zie MD-bevinding 3) |
| Piekuur | `v0_threads.created_at` (gesprek-starts) — **of** `query_log.created_at` (beurt-volume) → Q-detail | `EXTRACT(HOUR FROM … AT TIME ZONE 'Europe/Amsterdam')` | label naar gekozen definitie |
| Onbeantwoorde vragen | `query_log` | `getQueryLogStats(orgId, sinceIso).fallback` voor de doelmaand (zie D4) | één definitie, consistent met admin Overview/Usage |
| Kosten (deze maand) | `query_log` | `getMonthlyCostUsd` (huidige maand) / `getMonthlyCostUsdForRange` (historisch) | 20k-rij-cap |

**Maandgrenzen:** per-org helpers nemen al `sinceIso`. Voor een *historische* maand is óók een bovengrens nodig → `getMonthlyCostUsdForRange(orgId, sinceIso, untilIso)` (±3 regels) en `getDailyCostForMonth(orgId, year, month)`. `getDailyCostThisMonth()` is hardcoded op de huidige maand — **nooit aanroepen voor een andere maand**.

### Signaleringen — deterministisch, geen LLM

`computeSignals(stats)` = pure functie, levert `RecapSignal[]`. **Signaal-set besluit (2026-06-03, op aanbeveling — Niels kan drempels achteraf bijsturen):**

| Conditie | type | ernst |
|---|---|---|
| `fallbackPct > 20` | `kennisbank_incompleet` | waarschuwing |
| een vraag ≥ 15× onbeantwoord | `ontbrekende_info` | waarschuwing |
| piekuur buiten **08:00–18:00** | `gebruik_buiten_kantooruren` | inzicht |
| 0 gesprekken | `geen_gebruik` | actie_vereist |

**Geschrapt t.o.v. Niels' MD:** `korte_gesprekken` (<30s) en `lage_engagement` (<2 berichten). Beide berusten op de aanname "kort/weinig = slecht", wat voor een Q&A-kennisbot meestal omgekeerd is (snel + één-beurt antwoord = succes); bovendien is duur slechts een `updated_at−created_at`-proxy en is <2 berichten onmogelijk (minimum = 1 user + 1 assistant = 2). Optionele toekomstige vervanger: gemiddeld **>4–5 beurten** = `bot_worstelt` (bot antwoordt niet in één keer) — niet nu bouwen tenzij Niels erom vraagt.

Triage-status per signaal (`nieuw`/`genegeerd`/`behandeld`) = persistent (Q1). Behandelde signaleringen grijs maar zichtbaar in archief. **Cross-org overzicht (Pagina 1)** berekent de signalering-bol (🟢🟡🔴) **live** per org/maand — vereist géén voorafgaande "genereren"-actie.

### AI-samenvatting — alléén proza

`generateRecapSummary(stats, signals)` → `chatComplete()` (`lib/v0/server/rag.ts`), `gpt-4o-mini`, kost via `costForModelUsd()` uit `lib/ai/llm.ts` (niet inline dupliceren). **Input = alléén geaggregeerde cijfers/flags, geen rauwe vraagteksten** (anti-PII). Bij 0 gesprekken: **LLM-call overslaan** (lege payload → hallucinatie); toon `EmptyInline`. Bij LLM-faal: leeg tekstveld + "vul handmatig in". Optioneel een tweede `redactPii`-pass op de output vóór opslag/weergave (alleen relevant als vraagtekst tóch in de input belandt).

### PII / AVG (must-fix)

`redactPii()` (`lib/observability/redact.ts`, precedent in `error-capture.ts`) op de **datalaag-grens** van `getTopQuestions` en `getUnansweredQuestions` (en vóór insert in `faq_snapshot.items` indien dat pad gebruikt wordt). Bezoekers typen routinematig namen/e-mail/telefoon/BSN in chats. Redactie in de datalaag → élke consument (pagina, PDF, klantendashboard) is automatisch beschermd. **PDF (indien in scope):** óf rauwe vraaglijsten weglaten, óf geredacteerd + interne-gebruik-disclaimer + AVG-grondslag documenteren.

### Migratie (alléén bij Q1 = persistentie)

`0046_admin_monthly_recap.sql` — **`/check-migration` eerst** (origin/main-max = 0045; historische collisions op 0039/0040/0044). Volledig `admin_*`-precedent:
- `admin_monthly_recaps`: `id uuid pk`, **`organization_id uuid not null`** (geen FK), `period_month text` (`CHECK ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`), `ai_summary text`, `niels_notes text null`, `recap_status text CHECK in ('draft','gepubliceerd')`, `generated_at timestamptz`, `created_at/updated_at`. **`unique (organization_id, period_month)`** + index `(organization_id, period_month desc)`.
- `admin_recap_signals`: `id uuid pk`, `recap_id uuid not null references admin_monthly_recaps(id) on delete cascade`, `signal_type text CHECK (…)`, `status text CHECK in ('nieuw','genegeerd','behandeld')`, `updated_at`.
- RLS **uit** + verplicht comment: *"volgt bewust het admin_*-precedent, NIET de RLS overal V1 hard rule — interne founder-observability, geen klantdata. V1 kan FK + RLS additief toevoegen."*
- Hergebruik `public.admin_touch_updated_at()`-trigger (**niet** herdefiniëren), nieuwe `create trigger …`.
- CHECK-enums spiegelen de TS-unions in `lib/controlroom/types.ts`.

### UI-conventies (admindashboard)

`force-dynamic`; async server component; **`ReloadButton` verplicht** in elke `klant-page-header`; `Card`/`Pill`/`MetricCard`; tabellen in `<Card padded={false}><div style={{overflowX:'auto'}}><table className='klant-table'>`; **geen Tailwind** — inline styles + `klant.css`-tokens. Sidebar-NavItem (`CalendarRange`) toevoegen in `components/sidebar.tsx` (alléén bij standalone pagina, Q2) — check sidebar-overflow bij 9 items op ≤900px. Org-resolutie **uitsluitend** via `[orgSlug]`-route-param: `if (!(orgSlug in KNOWN_ORGS)) notFound()`. Fan-out over orgs = `Promise.all` met `.catch(() => fallback)` per call (de `getControlRoomKlanten`-pattern); gefaalde org = "Data niet beschikbaar"-rij, geen 500.

### Randgevallen

| Situatie | Gedrag |
|---|---|
| 0 gesprekken in maand | `EmptyInline` "Geen gesprekken in [maand]"; LLM-call overslaan; signalering `geen_gebruik` (🔴) op overzicht; "Genereren" uitgeschakeld |
| AI-samenvatting faalt | leeg tekstveld + "Samenvatting kon niet worden gegenereerd — vul handmatig in" |
| Opnieuw genereren | stats + samenvatting + signaleringen ververst; **notities + signaal-triage behouden** (Q1) |
| visitor_id NULL | uitgesloten uit unieke-bezoekers-telling + sublabel |
| lopende (onvolledige) maand | aparte optie met `--klant-warn`-toon "(onvolledig)" |
| dubbel-submit "Genereren" | client-side debounce (`useTransition` disabled) |

### Beslissingen (vastgelegd — geen vraag)

D1 `organization_id` niet `client_id` · D2 `admin_*`-prefix + RLS-off-carve-out + geen FK + shared trigger + CHECK-enums · D3 stats per bron gepartitioneerd, geen join · D4 "onbeantwoord" = `query_log` fallback-rij-telling voor de doelmaand (consistent met admin Overview/Usage) · D5 signaleringen deterministisch in code, LLM alléén proza, `gpt-4o-mini` hardcoded via `chatComplete()` · D6 `redactPii()` op datalaag-grens van alle getoonde vraagteksten · D7 nieuwe data-fns in `lib/controlroom/server/recap.ts`, hergebruik usage/signals/overview/top-questions · D8 default = laatst afgesloten maand, LLM-skip bij 0-data · D9 visitor_id-NOT-NULL-filter + duur-proxy-label · D10 `KNOWN_ORGS`-validatie, org alléén uit route-param.

---

## Beslissingen vastgelegd (2026-06-03)

1. **Persistentie-model → minimale tabel + live stats.** `admin_monthly_recaps` slaat alléén `ai_summary`, `niels_notes`, `recap_status`, `generated_at` op (+ `admin_recap_signals` voor triage-status). Stats worden **live** berekend uit `usage.ts`/`signals.ts`/`v0_threads` (afgesloten maanden veranderen niet); signaleringen deterministisch live berekend.
2. **Surface area → cross-org overzichtspagina + per-klant detailpagina** (Niels' volledige 2-pagina-flow). Nieuwe sidebar-NavItem (`CalendarRange`).
3. **PDF-export → meteen mee in de eerste build.** `@react-pdf/renderer` via GET Route Handler (`/api/v0/pdf/recap/[orgSlug]/[month]`), `runtime='nodejs'`, toegevoegd aan `serverExternalPackages`, cookie-auth + org-isolatie. **Nooit** chromium (Vercel-tier onbekend; Hobby 50MB breekt de deploy).

**Vastgelegd op aanbeveling (2026-06-03):** piekuur = gesprek-starts (`v0_threads.created_at`); kantooruren = 08:00–18:00; signalen `korte_gesprekken` + `lage_engagement` geschrapt (zie § Signaleringen); unieke bezoekers = alleen widget-bezoekers met label.

**Bevestigd (2026-06-03):** (5) PDF-voettekst-adres = `niels@chatmanta.com` (echte, gelezen inbox); (6) weergavenaam "Gegenereerd door" = **"Niels Jochems — ChatManta"** — hardcoded als statische string met code-comment "V1: vervang door ingelogde gebruiker" (bevestigd: V1 krijgt persoonlijke logins via Supabase Auth).
