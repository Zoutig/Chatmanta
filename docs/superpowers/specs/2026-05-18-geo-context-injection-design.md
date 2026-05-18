# V0.6 — Geografische context-injectie (NL-plaats → provincie)

**Status:** spec, in afwachting van plan-uitwerking
**Datum:** 2026-05-18
**Hangs from:** PR #56 (v0.6 bridging-patch) — bouwt op dezelfde branch `feat/seb/v06-bridging`, breidt scope uit
**Volgt op:** v0.6 bridging-prompt patch + diagnose-eval die liet zien dat (a) bot inconsistent brugt op Lelystad-class queries en (b) eval-judge "Lelystad" als ongegrond markeert wanneer het niet expliciet in chunks staat

---

## Context

De v0.6 bridging-prompt geeft de LLM toestemming om onomstotelijke publieke admin-geografie te gebruiken als brug tussen retrieved context-feiten en de gebruikersvraag. Eval-resultaten (n=3 per case op acme-corp werkgebied-cases, 2026-05-18) toonden:

- **Emmeloord/Urk** (Flevoland, niet in detail-lijst): 3/3 perfect bridging (C5/G5)
- **Dronten** (Flevoland, niet in detail-lijst): 2/3 perfect, 1/3 anchored op detail-lijst (C3)
- **Lelystad** (Flevoland, niet in detail-lijst): 3/3 C3 — bot brugt vaak wel correct, maar judge geeft G1/G3 omdat "Lelystad" niet letterlijk in chunks voorkomt
- **Brussel** (België): 2/3 perfect, 1/3 wisselend

Twee samenlopende problemen:
1. **Bot-stochasticity** — soms brugt-ie correct, soms ankerd-ie op de detail-lijst van plaatsen die wél in het werkgebied-document staan
2. **Judge-grounding-strafmaat** — zelfs als de bot correct brugt, telt de judge "Lelystad" als ongegrond claim omdat hij niet weet dat "Lelystad ∈ Flevoland" publieke basiskennis is

**Doelstelling:** maak "plaats X ligt in provincie Y" een **expliciet context-feit** dat de bot in zijn antwoord ziet en de judge in zijn grounding-check kan herkennen. Combineer de huidige bridging-prompt (vangnet voor alles buiten de tabel) met deterministische geo-injection voor de meest voorkomende NL-plaatsen.

## Aanpak

**Versie-aanpak (gekozen door Sebastiaan):** in-place patch op v0.6, zelfde branch als PR #56. Geen v0.6.1 of v0.7-bump. Trade-off: PR-scope wordt groter, A/B-meting voor "alleen geo-effect" niet geïsoleerd. Voordeel: één PR in productie, sneller fix-loop.

## Architectuur

Drie nieuwe units, elk met één duidelijke verantwoordelijkheid:

### 1. `lib/v0/data/nl-places.json` — statische dataset

Vast bestand in repo, ~2000-3000 entries afgeleid uit CBS gemeente-indeling + BAG woonkernen (PDOK). Schema:

```json
{
  "_meta": {
    "source": "CBS open data + BAG woonkernen, gebouwd op 2026-05-18",
    "count": 2347,
    "version": "1.0.0"
  },
  "places": [
    {
      "name": "Lelystad",
      "municipality": "Lelystad",
      "province": "Flevoland",
      "country": "Nederland",
      "aliases": []
    },
    {
      "name": "'s-Hertogenbosch",
      "municipality": "'s-Hertogenbosch",
      "province": "Noord-Brabant",
      "country": "Nederland",
      "aliases": ["Den Bosch", "Hertogenbosch", "s-Hertogenbosch"]
    }
  ]
}
```

**Scope V0:** alleen NL-plaatsen. Internationale locaties (Brussel, Antwerpen, Berlijn) blijven buiten de tabel; de huidige bridging-prompt blijft daarvoor het vangnet. V1 kan internationaal toevoegen.

**Data-acquisitie via `scripts/build-nl-places.mjs`:**
- Eenmalig (en bij CBS-jaarlijkse-update) handmatig draaien
- Downloadt CBS open-data (gemeente-indeling) + PDOK BAG woonkernen-tabel
- Dedupliceert + voegt aliases toe waar nodig (gemeente-naam = woonkern-naam → één entry)
- Output: `lib/v0/data/nl-places.json`
- Niet automatisch in CI — handmatige re-run is voldoende (NL gemeente-indeling verandert ~1×/jaar)

### 2. `lib/v0/server/geo-context.ts` — pure detector + builder

```ts
export interface DetectedPlace {
  name: string;          // canonical name uit JSON
  matched: string;       // exacte substring uit query (kan alias zijn)
  municipality: string;
  province: string;
  country: string;
}

export function loadGeoIndex(): GeoIndex;
// One-time init, in-memory lookup-tabel (set van case-folded names + aliases)
// Side-effect: leest nl-places.json bij module-import

export function detectPlacesInQuery(query: string, index: GeoIndex): DetectedPlace[];
// Case-insensitive longest-match scan op token-niveau
// Robuust voor: meerwoordige namen ("Den Haag"), apostrofen ("'s-Hertogenbosch"),
// hyphens ("Bergen op Zoom"), case-variation
// Geen substring-match in samengestelde woorden ("Lelystadse" matcht NIET op "Lelystad")
// Dedup: één hit per place (geen Lelystad+Lelystad als query "Lelystad Lelystad" zou bevatten)

export function buildGeoContextChunk(
  places: DetectedPlace[],
  maxPlaces: number,
): string | null;
// Output: synthetische chunk-tekst, of null als places leeg is
// Voorbeeld: zie sectie "Chunk format" hieronder
// Truncatie: top-N op match-priority (langste match eerst, dan alfabetisch)
```

**Detectie-algoritme:** Aho-Corasick of trie-based scan voor O(|query|) performance. Voor V0 mag het zelfs een simpele "voor elk woord in plaats-set: indexOf(woord)" zijn — corpus is klein genoeg dat dit <1ms blijft. Geen LLM-call, deterministisch.

**Edge cases:**
- Plaats met hoofdletter in query maar lowercase in tabel: case-fold beide kanten
- "Soest" en "Soesterberg" zijn beide in tabel: longest-match wint (Soesterberg)
- "Lelystad-Haven" in query: matcht "Lelystad" als prefix als de wijk niet in tabel staat (acceptabel — bridging op moederplaats werkt)
- Geen matches: function returnt `null`, geen injectie

### 3. Integratie in `lib/v0/server/rag.ts`

Aanroepingspunt: direct na de threshold-filter (rond Stage 9 in de huidige pipeline), vóór de prompt-builder. Pseudocode:

```ts
// In runRagQueryStreaming():
const retrievedChunks = await retrieveChunks(...).filter(c => c.similarity >= threshold);

let priorityChunks: PriorityChunk[] = [];
if (bot.geoContextEnabled) {
  const geoIndex = loadGeoIndex();
  const places = detectPlacesInQuery(question, geoIndex);
  if (places.length > 0) {
    const geoChunkText = buildGeoContextChunk(places, bot.geoContextMaxPlaces ?? 5);
    if (geoChunkText) {
      priorityChunks.push({
        content: geoChunkText,
        kind: 'geo-context',
        // Hoge prio: telt niet mee in finalContextMaxChunks-trimming
      });
    }
  }
}

const finalChunks = [...priorityChunks, ...retrievedChunks].slice(0, totalLimit);
```

**Priority-chunk-status:** de geo-chunk overleeft `finalContextMaxChunks`-trimming (anders kan hij wegvallen op orgs met veel relevante chunks). Maakt onderdeel uit van het promptcontext als chunk `[GEO]` (chunk-index buiten de doc-chunks).

### Chunk format (LLM-zichtbaar)

```
[GEOGRAFISCHE CONTEXT — publieke basiskennis, niet uit klant-documenten]
- Lelystad ligt in gemeente Lelystad, provincie Flevoland, Nederland.
- Almere ligt in gemeente Almere, provincie Flevoland, Nederland.
```

De LLM krijgt dit als gewone chunk (kan ernaar citeren met `[GEO]` of een chunk-nummer). De rij "publieke basiskennis, niet uit klant-documenten" geeft transparantie dat dit geen klant-input is. Bij citatie in het antwoord kan de bot bv. zeggen *"Lelystad ligt in Flevoland, en Flevoland valt binnen ons werkgebied [GEO][1]"* — judge ziet `[GEO]` als grounding-bron.

## Config-uitbreiding op `BotConfig`

```ts
interface BotConfig {
  // ... bestaande velden ...
  geoContextEnabled?: boolean;     // default false; V0_6 = true
  geoContextMaxPlaces?: number;    // default 5 (voorkomt prompt-bloat)
}
```

`V0_6.geoContextEnabled = true`. `V0_6_PREBRIDGE.geoContextEnabled = false` (blijft baseline zonder bridging EN zonder geo).

## Files & wijzigingen

| Pad | Type | Wat |
|---|---|---|
| `lib/v0/data/nl-places.json` | nieuw | ~2000+ entries CBS+BAG |
| `lib/v0/server/geo-context.ts` | nieuw | detector + builder module |
| `lib/v0/server/rag.ts` | edit | priority-chunk integratie in `runRagQueryStreaming` |
| `lib/v0/server/bots.ts` | edit | `geoContextEnabled` config + V0_6 + V0_6_PREBRIDGE |
| `scripts/build-nl-places.mjs` | nieuw | one-shot data-import script (CBS+PDOK download) |

## Error handling

- **JSON-bestand corrupt of ontbreekt** bij module-import: log error, returnt lege index, `detectPlacesInQuery` returnt altijd `[]`. Bot gedraagt zich als vóór de patch (alleen bridging-prompt actief).
- **0 hits in query**: geen chunk, `priorityChunks = []`. Geen invloed op de pipeline.
- **>`geoContextMaxPlaces` hits**: top-N op match-priority (langste match → alfabetisch).
- **Plaats die in NL-tabel staat maar ook in een ander land bestaat** (bv. "Den Bosch" als Belgische plaats): voor V0 nemen we de NL-versie. Edge case, niet relevant voor onze sandbox-orgs.

## Test-strategie

**Eval-A/B-meting** (op zelfde corpus als de diagnose-eval):
- `npm run eval:run -- --orgs=acme-corp --runs=3 --slugs=<10 bridging-cases> --versions=v0.6,v0.6-prebridge`
- 60 runs (10 vragen × 3 runs × 2 versies)
- v0.6-prebridge = baseline (alles uit). v0.6 = bridging + geo.

**Verwachte uitkomsten:**
- **Lelystad**: van 3× C3/G1-G3 → 3× C5/G5 (judge ziet `[GEO] Lelystad ∈ Flevoland` als grounding)
- **Dronten stochasticity**: van 2/3 → 3/3 (geo-chunk maakt bridging-keuze deterministisch)
- **Brussel**: blijft 2/3 (geen NL-plaats, valt op huidige bridging-prompt terug — out of scope V0)
- **Heerlen/Apeldoorn/Maastricht/Emmeloord/Urk**: blijven goed
- **Randstad fuzzy**: blijft correct clarify (geen plaats-match → geen injectie)
- **Baarn-control**: pre-existing pre-processor issue, valt buiten scope

**DEV_ORG regressie-check** (ChatManta-questions, n=69): geen plaatsnamen in queries verwacht → injectie inactief → no-op. Zo niet, kijk welke false-positive matches.

**Manuele check via chat-CLI:**
- Lelystad-vraag tegen patched bot (live retrieval, niet eval) — bevestig dat de bot consistent "ja, Lelystad ∈ Flevoland → in werkgebied" zegt.
- Eén non-NL-vraag (bv. "Berlijn") om te verifiëren dat geo-injection daar niets doet.

## Open vragen / non-goals

**Non-goals voor V0:**
- Internationale plaatsen (Brussel/Antwerpen/Berlijn) — vangnet blijft bridging-prompt
- Buurt- of postcodegebied-niveau (alleen plaats → gemeente → provincie)
- LLM-based plaats-extractie (statische set-lookup is voor V0 voldoende)
- Per-org configureerbare geo-tabel (V1+ feature)
- Auto-update van CBS-data via CI (handmatige re-run bij CBS-update is voldoende)

**Open vragen voor implementatie (geen blockers, beslis ik tijdens uitwerking):**
- Exacte aliassen-set voor "moeilijke" plaatsen ('s-Hertogenbosch / Den Bosch / Hertogenbosch) — kies pragmatisch tijdens build-script
- Bestaande npm-package gebruiken voor CBS-fetch of zelf parsen — kijk eerst wat er is

## V1+ vooruitzicht

- Per-org configureerbare geo-tabel (klant uploadt eigen "werkgebied = {regio's, plaatsen}" en bot bouwt op die structuur)
- Internationale uitbreiding (DE/BE/FR-plaatsen)
- Auto-refresh CBS-data via cron-job
- Optionele LLM-extraction als fallback voor plaatsen die niet in tabel staan

## Rollback

Eén config-flag `geoContextEnabled` van `true` naar `false` op `V0_6` → geo-injection uit, bridging-prompt blijft actief. JSON-bestand en module blijven aanwezig maar inert.
