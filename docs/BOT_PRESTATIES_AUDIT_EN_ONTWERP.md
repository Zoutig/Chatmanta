# Admindashboard — Audit + ontwerp: tab "Bot prestaties"

**Fase 1 deliverable. Geen bouwcode — wacht op sign-off.**
Datum: 2026-06-03 · Branch (build): `feat/seb/bot-prestaties` vanaf up-to-date `origin/main`.

Doel: het admindashboard een kwaliteit/prestatie-tab geven die de **live `/api/v0/chat`-telemetrie**
als doorlopende "real-life eval" zichtbaar maakt. Géén accuraatheid — live verkeer heeft **geen
ground-truth labels**. Alles hieronder is observationele kwaliteit via **proxies + duim-feedback**.

---

## 1. Audit — wat legt de telemetrie al vast?

Bron-van-waarheid van wat gelogd wordt = `QueryLogRow` in `lib/v0/server/log.ts` (`logQuery` /
`logBlockedQuery`, uitsluitend op `/api/v0/chat`). Schema opgebouwd over migraties 0003–0043; de
recente 0044/0046/0047 voegen **geen** nieuwe telemetriekolom toe (0044 = CHECK-verbreding,
0046 = RPC, 0047 = recap). Feedback = `public.v0_feedback` (migr 0031), 1-op-1 met `query_log`
via `query_log_id` (FK, CASCADE), kolom `rating in ('up','down')` + optionele `comment`.

### Kolom-inventaris per metriek-groep

| Groep | Kolom (`query_log` tenzij anders) | Type | Aanwezig? |
|---|---|---|---|
| **A. Antwoordkwaliteit / grounding** | `kind` (`smalltalk`/`answer`/`fallback`/`blocked`) | enum | ✅ |
| | `hard_fact_supported` (true/false/**null** als verifier niet draaide) | bool? | ✅ |
| | `missing_hard_facts` (jsonb welke feiten misten) | jsonb? | ✅ (ongebruikt in v1) |
| | `claim_confidence` (0–1, gemiddelde claim-grounding) | num? | ✅ |
| | `top1_sim` / `top_similarity` (retrieval-sterkte) | num? | ✅ |
| | `injection_detected` / `injection_pattern` | bool/text | ✅ |
| | `rerank_scores` | jsonb? | ⚠️ kolom bestaat maar **wordt nooit gevuld** (altijd null) |
| **B. Gebruikersfeedback** | `v0_feedback.rating` (`up`/`down`) | text | ✅ |
| | `v0_feedback.comment` (vrije tekst bij 👎) | text? | ✅ |
| | `v0_feedback.query_log_id` / `organization_id` / `created_at` | — | ✅ |
| **C. Snelheid (latency)** | `first_token_ms` (TTFT, migr 0041) | int? | ✅ |
| | `total_ms`, `generation_ms`, `embedding_ms`, `retrieval_ms`, `rerank_ms`, `hyde_ms` | int? | ✅ |
| | `phase_timings_ms` (volledige jsonb-breakdown) | jsonb? | ✅ |
| | `from_cache` (cache-hit → sneller + goedkoper) | bool | ✅ |
| **D. Dekking & kennisgaten** | `category` (`search`/`general`/`off_topic`/`smalltalk`/null) | enum? | ✅ |
| | `gap_kind` (`zero_hits`/`low_confidence`/`low_grounding`/`off_topic`/null) | text? | ✅ |
| | `source_count` (# chunks in antwoord; 0 = geen dekking) | int | ✅ |
| | `adaptive_decision` (volledige RagDecision-blob) | jsonb? | ✅ (te diep voor v1) |
| **Context / scoping** | `organization_id`, `bot_version`, `created_at`, `tone`, `length`, `cost_usd`, tokens | — | ✅ |

**Conclusie van de inventaris:** alle vier de metriek-groepen worden al gelogd. Er is **geen nieuwe
instrumentatie nodig** voor een nuttige tab. `query_log` is rijk geïndexeerd op
`(organization_id, created_at)` en `(organization_id, bot_version)` → de windowed + per-versie counts
hieronder zijn goedkoop.

### Gat-lijst (wat een "echte eval" mist maar de tab niet kan vullen)

1. **Geen correctheidslabel.** Er is geen judge-score / juist-onjuist-kolom in live telemetrie. Dit is
   fundamenteel — de tab toont **nooit** een "accuracy"/"correctheid"-%. Offline judging zit in
   `eval_runs` en blijft **buiten** deze tab (taak-eis).
2. **Feedback is niet versie-gestempeld.** `v0_feedback` heeft geen `bot_version`; een 👎 hangt aan
   een `query_log`-rij maar niet rechtstreeks aan de live versie. → Of org-scoped/versie-agnostisch
   tonen (simpel, met noot), of joinen via `query_log_id`. Geen instrumentatie-wijziging in deze ronde.
3. **`rerank_scores` is dood:** kolom bestaat, pipeline vult 'm nooit → onbruikbaar als signaal.
4. **Percentielen op schaal:** exacte server-side p50/p95 zou een `percentile_cont`-RPC vragen
   (migratie). Op V0-volume niet nodig — zie §4 (besluit: enkele-kolom-pull, géén migratie nu).
5. **Geen "kennisgat → opgelost"-loop:** `gap_kind` markeert een gat, maar resolutie wordt niet
   bijgehouden. (Quiz- + feedbacksysteem dekken dat deels, buiten scope hier.)

---

## 2. Bestaande bouwstenen die ik hergebruik (nul nieuwe libs)

| Bouwsteen | Pad | Gebruik |
|---|---|---|
| `MetricCard` | `app/admindashboard/components/metric-card.tsx` | alle stat-kaarten |
| `DailyCostChart` (SVG-lijn, geen lib) | `app/admindashboard/components/daily-cost-chart.tsx` | → generaliseren naar `DailyLineChart` voor de trendgrafiek (zie §3) |
| Goedkope fan-out | `getQueryLogStats()` in `lib/controlroom/server/usage.ts` (`count:'exact', head:true`) | template voor alle nieuwe counts |
| Org-enumeratie | `listKnownOrgs()` / `getControlRoomKlanten()` (`lib/controlroom/server/overview.ts`) | org-agnostisch; geen hard-coded slugs |
| Service-role client | `sb()` uit `lib/controlroom/server/db.ts` | DB-toegang (V0-patroon, geen admin-wrappers) |
| Live versie-constante | `LATEST_BOT_VERSION` uit `lib/v0/server/bots.ts` | default-filter (niet hard-coden) |
| Page-shell + tokens | `klant-page-header`, `klant-metrics-grid`, `Card`, `Pill`, `ReloadButton`, `TabsNav` | layout, identiek aan Usage/Recap |
| `formatCostUsd`, `formatRelativeNL` | `lib/controlroom/format.ts` | formatters |

Nieuwe server-laag: **`lib/controlroom/server/bot-performance.ts`** (server-only). Eén
`getBotPerformance(opts)` die per org de head-counts fan-out doet (zoals `getOrgSignals`) + de
aggregate optelt, plus gerichte enkele-kolom-pulls voor percentielen/feedback.

---

## 3. Tab-ontwerp

**Nav:** één regel in `sidebar.tsx` — `<NavItem href="/admindashboard/bot-prestaties" label="Bot
prestaties">` (icoon: `Gauge` of `Activity`, lucide). **Route:** `app/admindashboard/bot-prestaties/page.tsx`
(`force-dynamic`).

**Cross-org vs per-klant via één component, gefilterd op `?org=<slug>`:**
- `/admindashboard/bot-prestaties` → cross-org aggregaat + per-klant tabel.
- `/admindashboard/bot-prestaties?org=fysioplus-utrecht` → exact dezelfde secties, gescoped op die org
  + "← Alle klanten"-terug. **Geen tweede per-klant-pagina** (taak-eis).

**Versie-context:** alles default gefilterd op `bot_version = LATEST_BOT_VERSION`, met de versielabel
prominent in de header ("Cijfers voor **{versie}** — de nu-live versie"). Reden: een regressie mag niet
verdund worden door oude versie-historie. (Zie §4 voor de filter-beslissing.)

### Layout (van boven naar onder)

**Header** — titel + versielabel + window-label + `ReloadButton`. Disclaimer-regel:
> *Observationele kwaliteit uit live verkeer (proxies + duim-feedback). **Geen accuraatheidsmeting** —
> live verkeer heeft geen ground-truth. Voor offline judging zie de eval-pipeline; voor kosten/volume zie
> [Usage & Kosten] en [Maandelijkse Recap].*

**Rij 1 — headline `MetricCard`s (aggregaat over alle orgs / de gekozen org):**
1. **Vragen** (window, live versie) — noemer/context (géén kostenkolom; dat is Usage)
2. **Weiger-/fallback-ratio %** = `kind='fallback'` / totaal  *(proxy, geen fout-%)*
3. **Grounding-support %** = `hard_fact_supported=true` / (true+false)  *(alleen rijen waar verifier draaide)*
4. **👎-ratio** = down / (up+down) uit `v0_feedback`
5. **TTFT p95** (`first_token_ms`, ms)
6. **Kennisgaten %** = rijen met `gap_kind` not null / totaal (of `zero_hits`-aandeel)

**Sectie — Dekking & kennisgaten (groep D):** compacte breakdown `gap_kind`
(zero_hits / low_confidence / low_grounding / off_topic) als tellingen + zero-source % (`source_count=0`)
+ category-mix (search/general/off_topic/smalltalk) als kleine verdeling. *(Geen volume-kop — dat is Usage.)*

**Sectie — Snelheid (groep C):** TTFT p50/p95 + totale tijd p50/p95 (`total_ms`) + cache-hit %
(`from_cache`). Enkele-kolom-pull, "steekproef"-noot als de rij-cap geraakt wordt.

**Sectie — Feedback (groep B):** 👍/👎-tellingen + 👎-ratio. In drill-down (`?org=`): korte lijst
**recente 👎 met toelichting** (klikt door naar het gesprek). *Optioneel — zie §4.*

**Eén trendgrafiek** (`DailyLineChart`, gegeneraliseerd uit `DailyCostChart`): **fallback-/weiger-ratio
per dag** over het window — zodat een regressie ná een deploy zichtbaar wordt als een knik. Cross-org
aggregaat; in drill-down gescoped op de org. *(Max 1 grafiek in v1.)*

**Cross-org tabel** (alleen op de overview, niet in drill-down): per klant een rij —
naam · vragen · fallback % · grounding % · 👎 · TTFT p95 · **lage-volume-badge**. Rij linkt naar
`?org=<slug>`. Sortering: hoogste fallback %/👎 bovenaan (aandacht eerst).

### Lege / lage-volume-staat
- Org (of aggregaat) met **< 30** live vragen op de live versie in het window → **lage-volume-badge**
  ("nog te weinig verkeer voor betrouwbare cijfers"); ratio's worden grijs/gedempt getoond, niet
  verborgen. Reden voor 30: onder ~30 is elke ratio ruis (sluit aan op de bekende n=30-ruisvloer).
- **0 vragen** → "Nog geen live verkeer" met uitleg dat de in-dashboard test-tool géén `query_log`
  schrijft, dus alleen echte bezoekers tellen. Op de huidige V0 fake-demo-data rendert de tab correct
  maar trekken we **geen conclusies** (badge maakt dat expliciet).

---

## 4. Beslissingen die ik voorleg (sign-off)

| # | Beslissing | Mijn aanbeveling | Waarom |
|---|---|---|---|
| **D1** | **Tijdsvenster** | ✅ **BESLIST: toggle 30 dagen ↔ deze maand** (default = 30 dagen) | Regressie-watch kijkt naar recent gedrag; toggle geeft ook de Usage/Recap-consistente maand-blik. |
| **D2** | **Versie-filter** | ✅ **BESLIST: hard default = `LATEST_BOT_VERSION`**, géén versie-keuze-UI in v1 | Minimaal-eerst; voorkomt verdunde regressie. Caveat: als de main-constante vóór de deploy uitloopt op de live build, kan "deze versie" even leeg zijn → de lage-volume-staat dekt dat. (Een "alle versies"-toggle staat op de uitbreidingen-lijst.) |
| **D3** | **Lage-volume-drempel** | ✅ **BESLIST: < 30 vragen** | Ruisvloer; sluit aan op bestaande eval-empirie. |
| **D4** | **Percentielen-route** | **Enkele-kolom-pull** (`first_token_ms`/`total_ms`) + JS-percentiel, met cap + "steekproef"-noot. **Géén `percentile_cont`-RPC/migratie nu.** | Taak staat enkele-kolom-pull expliciet toe; V0-volume is klein. RPC = uitbreidings-/migratiebeslissing voor later. |
| **D5** | **Trendgrafiek** | ✅ **BESLIST: 1 grafiek** (fallback-ratio/dag), via gegeneraliseerde `DailyLineChart` | Maakt regressie-na-deploy zichtbaar; 1 grafiek past binnen "max 1–2". |
| **D6** | **`DailyCostChart` aanpak** | **Extract `DailyLineChart`** (generiek: `{label,value}[]` + formatter) en laat `DailyCostChart` 'm consumeren | "Hergebruik de grafiek, geen nieuwe lib". Raakt Usage 1× visueel-identiek (1 verify). Alternatief = niet-rakende kloon (lichte duplicatie). |
| **D7** | **Feedback-versie-scope** | Org-scoped 👍/👎 (versie-agnostisch) + expliciete noot | `v0_feedback` mist `bot_version`; joinen kan maar is zwaarder en feedback-volume is klein. |
| **D8** | **Recente-👎-lijst** | Meenemen in drill-down (klein), maar **cuttable** als je strak minimaal wil | Hoog-signaal voor real-life eval; comments zijn niet PII-geredacteerd (consistent met bestaande Negatieve-feedback-view, achter de proxy-gate). |

### Mogelijke uitbreidingen (NIET in deze ronde bouwen)
- `claim_confidence`-gemiddelde als extra grounding-as (enkele-kolom-pull).
- `missing_hard_facts`-drill (wélke feiten misten) — jsonb-detail.
- `injection_pattern`-breakdown (security-lens) + `hyde`-effectiviteit.
- **Per-versie regressie-diff** (twee live versies naast elkaar) → vereist de versie-filter-UI.
- `percentile_cont`-RPC voor exacte server-side percentielen op V1-volume (migratie).
- Kruising kwaliteit × feedback ("beantwoord mét bronnen maar tóch 👎").
- `bot_version` op `v0_feedback` (instrumentatie-gat — bewust niet in deze visualisatie-ronde).

---

## 5. Verificatie-plan (Fase 2, na akkoord)
- Worktree `feat/seb/bot-prestaties` vanaf up-to-date `origin/main` (ship-feature bootstrap: env-kopie,
  `npm ci`, vrije poort). Migratienummer niet nodig (nul migraties) — tenzij D4 omgaat naar RPC.
- `Remove-Item -Recurse -Force .next` → `npm run build` + typecheck schoon.
- `/admindashboard/bot-prestaties` lokaal: aggregaat laadt cross-org, `?org=` drill-down werkt, lage-volume-
  badge klopt op de demo-data.
- Bevestigen: **geen** query raakt `eval_runs`; **geen** nieuwe migratie/`query_log`-kolom; geen `log.ts`/
  chat-route-wijziging.
</content>
</invoke>
