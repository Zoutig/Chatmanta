# Latency-inzicht UI — design spec

**Status:** Draft, awaiting review
**Datum:** 2026-05-10
**Bot-versie context:** V0.4 (latency-profiling data-laag al gemerged in `0010_v0_latency_profiling.sql`)

## Doel

Sebastiaan wil tijdens de V0-leerfase snel kunnen beantwoorden: "wat is traag, waar zit de tijd, en is een nieuwe bot-versie sneller of trager dan de vorige?". De data is er al — alleen geen UI om er bij te komen zonder `psql`.

## Scope

Deze ronde bouwt **twee complementaire views** op bestaande data:

- **A — Inline waterfall per assistant-message** in de chat. Per-query debug-zicht.
- **B — Latency-tab in de right-panel** met aggregaten per bot-versie + slowest queries. Vergelijken-tussen-versies-zicht.

Niet in scope (bewust uitgesteld):
- Correlatie-charts (HyDE on/off, source_count vs latency)
- Trendlijn over tijd (tijdreeks-plot)
- Klik-door van slowest-query naar specifieke thread (vereist schema-wijziging — zie "Future enhancements")
- Export / CSV / alerts / thresholds

## Uitgangspunten (al aanwezig)

- `query_log` heeft per rij: `embedding_ms`, `retrieval_ms`, `rerank_ms`, `generation_ms`, `total_ms` + `phase_timings_ms` (jsonb met de volledige `PhaseTimings` map).
- `v_latency_summary` view geeft p50/p95/p99 per `bot_version` voor de 5 hoofd-fases. Heeft `security_invoker = on, security_barrier = on`.
- `ChatResponse.extras.phaseTimingsMs` (type `PhaseTimings` in `lib/v0/server/rag.ts`) wordt door `chatV0()` gevuld voor `kind === 'answer'` antwoorden.
- `v0_thread_messages.response` (jsonb) bevat de hele `ChatResponse`, dus herladen threads bevatten de timings al — geen mapper-wijziging nodig.

## Architectuur

### Component A — `<LatencyBar phaseTimings={…} />`

Pure client-side presentatie-component. Krijgt `PhaseTimings` als prop, rendert niets als de prop ontbreekt of `total_ms === 0`.

- **Default state:** ingeklapt — toont alleen één badge `⏱ 3.4s ▾`
- **Expanded state:** horizontale stacked bar (volle breedte van het bericht-paneel) met segment per fase, gevolgd door een legenda met kleur + naam + ms per fase.
- **Welke fases worden getoond:** alle keys uit `PhaseTimings` waarvan de waarde > 0 ms is, exclusief `total_ms` (die wordt samen gebruikt om percentages te berekenen). Zo komen optionele fases (`hyde_ms`, `cascade_ms`, `verify_ms`, etc.) automatisch in beeld zodra ze niet-nul zijn.
- **Kleurenschema** (consistent A en B):
  - `embedding_ms` — blauw (`#7aa2f7`)
  - `retrieval_ms` — groen (`#9ece6a`)
  - `rerank_ms` — oranje (`#e0af68`)
  - `generation_ms` — rood (`#f7768e`)
  - Optionele fases — neutraal grijs/paars uit bestaande theme tokens
- **Gebruik in `messages.tsx`:** rendert direct onder de bestaande "X bronnen · top sim X.XX" regel voor assistant-messages met `response.kind === 'answer'`. Voor `smalltalk`, `fallback`, `blocked` rendert het niets (die hebben geen `phaseTimingsMs`).

### Component B — `<LatencyView />` (tab content)

Client component, lazy-load via server action — exact patroon van `EvalsView`.

- **Tab-positie:** in de bestaande right-panel tab-rij, naast Bronnen / Evals. Label: "Latency".
- **Tijdvenster-toggle bovenaan:** drie knoppen: `24u` / `7d` (default) / `all`. Wijzigen triggert nieuwe server-call.
- **Sectie 1 — Aggregaten per bot-versie:** een card per `bot_version` met n + p50 + p95 voor totaal en per hoofd-fase (4-5 rijen). Bot-versies gesorteerd nieuwste-eerst (zelfde volgorde als `BOT_VERSIONS_ORDERED`).
- **Sectie 2 — Slowest queries (top 10):** lijst met vraag (truncated), `total_ms`, bot-versie, relatieve tijdsstempel. **Niet klikbaar in deze ronde** — alleen lezen.
- **Empty-state:** "Nog geen latency-data in dit venster" + Vernieuwen-knop.
- **Error-state:** zelfde patroon als `EvalsView` (rood foutbericht + retry-knop).

### Server data-laag

#### `lib/v0/server/latency-snapshot.ts` (nieuw)

Mirror van `lib/v0/server/evals-snapshot.ts`:

```typescript
export type LatencyWindow = '24h' | '7d' | 'all';

export type LatencyAggregate = {
  botVersion: string;
  n: number;
  p50TotalMs: number; p95TotalMs: number; p99TotalMs: number;
  p50EmbeddingMs: number | null; p95EmbeddingMs: number | null;
  p50RetrievalMs: number | null; p95RetrievalMs: number | null;
  p50RerankMs: number | null; p95RerankMs: number | null;
  p50GenerationMs: number | null; p95GenerationMs: number | null;
};

export type SlowQueryRow = {
  id: string;
  question: string;
  totalMs: number;
  botVersion: string;
  createdAt: string;
};

export type LatencySnapshot = {
  window: LatencyWindow;
  aggregates: LatencyAggregate[];
  slowest: SlowQueryRow[];
  generatedAt: string;
};

export async function getLatencySnapshot(
  organizationId: string,
  window: LatencyWindow,
): Promise<LatencySnapshot>;
```

**Implementatie-noten:**
- Twee parallelle queries via `Promise.all`:
  1. `from('v_latency_summary').select('*')` — view doet de aggregatie. **Caveat:** de bestaande view aggregeert over álle history (geen window-filter). Voor `24h` / `7d` is dat niet wat we willen. **Beslissing:** voor de eerste implementatie aggregeren we client-side voor windows: in `latency-snapshot.ts` doen we voor `24h` en `7d` zélf een `SELECT bot_version, embedding_ms, retrieval_ms, ..., total_ms FROM query_log WHERE total_ms IS NOT NULL AND created_at > now() - interval '...' AND organization_id = ...`, dan percentile-bereken in JS (via een kleine sort + index). Voor `all` kunnen we de bestaande view gebruiken (snel, geen scan).
  2. `from('query_log').select('id, question, total_ms, bot_version, created_at').not('total_ms', 'is', null).order('total_ms', { ascending: false }).limit(10)` — gefilterd op `organization_id` en `created_at` window. Bestaande index `(organization_id, created_at desc)` op `query_log` dekt het filter; sort-on-`total_ms` van max 10 rijen na filter is verwaarloosbaar.
- Service-role client via dezelfde `sb()` helper als `log.ts` (acceptabel voor V0; bij V1 verhuist dit achter org-scoped wrapper).
- `kind = 'answer'` filter? Nee — de view filtert al op `total_ms IS NOT NULL`, en `total_ms` wordt alleen gezet voor answer-queries. Smalltalk/fallback/blocked vallen automatisch weg.

#### `app/actions/latency.ts` (nieuw)

```typescript
'use server';

export async function getLatencySnapshotAction(
  window: LatencyWindow,
): Promise<{ ok: true; snapshot: LatencySnapshot } | { ok: false; error: string }>;
```

Mirror van `getEvalSnapshotAction`. Catched errors → `{ ok: false, error: msg }`.

### Bestanden — overzicht

**Nieuw:**
- `app/components/latency-bar.tsx`
- `app/components/latency-view.tsx`
- `app/actions/latency.ts`
- `lib/v0/server/latency-snapshot.ts`

**Gewijzigd:**
- `app/components/messages.tsx` — `<LatencyBar phaseTimings={response.extras?.phaseTimingsMs} />` toevoegen onder de bestaande source-info regel voor `kind === 'answer'`
- `app/components/right-panel.tsx` — Latency-tab + tab-content `<LatencyView />` toevoegen, zelfde patroon als de bestaande Evals-tab

**Niet gewijzigd:**
- `lib/v0/server/threads.ts` — niet nodig; `response` jsonb bevat al `extras.phaseTimingsMs`
- `lib/v0/server/rag.ts` — `phaseTimingsMs` wordt al gevuld in V0.4
- `lib/v0/server/log.ts` — kolommen worden al geschreven
- Geen migrations

## Data flow

**A — live antwoord:**
`chatV0()` zet `extras.phaseTimingsMs` → SSE-stream → `messages.tsx` ontvangt `ChatResponse` → `<LatencyBar>` rendert direct.

**A — herladen thread:**
`getThread()` haalt `v0_thread_messages.response` (jsonb) op → `extras.phaseTimingsMs` zit er al in → identieke rendering.

**B — tab open:**
`useEffect` in `<LatencyView>` → `getLatencySnapshotAction(window)` → server action → `latency-snapshot.ts` → twee parallelle Supabase-queries → `LatencySnapshot` JSON terug → state set → render.

**B — window switch:**
Klik op `24u` / `7d` / `all` knop → state update → effect retriggert → opnieuw fetchen.

## Defaults

| Beslissing | Waarde | Reden |
|---|---|---|
| Tab-default tijdvenster | `7d` | Lang genoeg voor patronen, kort genoeg om recente bot-versie-wijzigingen te isoleren |
| Inline waterfall default | Ingeklapt (badge zichtbaar) | Niet de chat opblazen; opent op klik |
| Slowest queries — top N | 10 | Past in tab zonder scroll-overload |
| Min `total_ms` om in slowest te tonen | Geen filter | Top-10 kan in een rustig venster ook 800ms-queries bevatten — dat is op zich nuttige info |
| Kleurmapping | embed=blauw, retrieval=groen, rerank=oranje, gen=rood | Visueel direct herkenbaar, generation = vaakst de bottleneck |

## Error / edge cases

| Situatie | Gedrag |
|---|---|
| `phaseTimingsMs` ontbreekt op message | `<LatencyBar>` rendert `null` |
| `total_ms === 0` of NaN | `<LatencyBar>` rendert `null` (anti-divide-by-zero) |
| Aggregate-query faalt | Tab toont rode error-state met retry-knop (zelfde patroon als `EvalsView`) |
| Slowest-query faalt maar aggregaten lukken | Toon aggregaten + "kon slowest queries niet laden" inline waarschuwing |
| Window heeft 0 rijen | Empty-state ("Nog geen latency-data in dit venster") |
| Bot-versie heeft minder dan 5 queries in window | Toon ze toch — n=2 is informatief; geen kunstmatige drempel |
| Optionele fase (bv. `hyde_ms`) is `undefined` voor hele venster | Gewoon weglaten uit aggregate-render — geen kolom met allemaal "—" |

## Testing

- Visuele check via `npm run dev`: open een thread met v0.4 antwoord → verifieer badge → klik → verifieer waterfall + percentages tellen op tot 100%
- Open Latency-tab → switch tussen 24u/7d/all → verifieer dat aggregaten herladen
- Forceer error: tijdelijk service-role-key onbruikbaar maken → verifieer error-state
- Geen unit tests in scope — `<LatencyBar>` is pure rendering; `<LatencyView>` is een fetch-en-display-shell zoals `EvalsView` waarvoor ook geen unit-tests bestaan
- Playwright-smoke (optioneel, mag ook in apart commit): tab opent → wacht op aggregate → snapshot

## Future enhancements (expliciet later)

- `query_log.thread_id` kolom + populatie zodat slowest-query klikbaar wordt → springt naar de message in chat
- Trend-grafiek (p95-over-tijd-per-fase) — dat heeft een time-series-component nodig (Recharts of lichtere alternatief)
- Correlatie-paneel (HyDE on/off, source_count buckets, claim_confidence buckets) — leuk maar duurder
- p95-trend-alert: "v0.4 is 30% trager geworden in laatste 24u"
- Per-vraag drill-down: klik op een fase-bar → toon de top-3 langste queries voor die specifieke fase

## Open vragen

Geen op dit moment. Implementation plan kan starten zodra deze spec is goedgekeurd.
