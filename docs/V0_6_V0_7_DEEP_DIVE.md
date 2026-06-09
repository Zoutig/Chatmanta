# ChatManta — V0.6 & V0.7 Deep Dive (brainstorm-bundel)

Eén compleet referentie-document over hoe bot-versies **v0.6** en **v0.7.x** werken in de ChatManta-codebase (mei 2026). Vervolg op `docs/V0_5_DEEP_DIVE.md` — leest die als basis: de hele v0.5-pipeline (pre-process → cache → retrieve → rerank → answer → claim-verify → regenerate → followups), het DB-schema, de stream-events en de `ChatResponse`-shape gelden onverkort door. Dit document beschrijft **wat v0.6 en v0.7 daar bovenop veranderen**, op code-niveau, met alle eval-data t/m v0.7.3.

> **Bron-files (lees voor volledige context):**
> - `lib/v0/server/bots.ts` — versie-registry, v0.6 + v0.7.1/.2/.3 config + prompts
> - `lib/v0/server/rag-decision.ts` — adaptive decision-layer (NIEUW in v0.6)
> - `lib/v0/server/hard-facts.ts` — hard-fact regex-verifier (NIEUW in v0.6)
> - `lib/v0/server/rag.ts` — pipeline-wiring (matched-span format, decision-gating, hard-fact stage)
> - `lib/v0/style.ts` — `LENGTH_INSTRUCTION_V1/V2/V3` (kern van v0.7)
> - `lib/widget/render-markdown-lite.tsx` — widget bullets/witregel-renderer (v0.7)
> - `docs/superpowers/specs/2026-05-23-v0.7-output-clarity-design.md` — v0.7 design
> - `docs/evals/2026-05-17-v0.6.1-summary.md`, `…-v0.6.2-summary.md`, `2026-05-18-v06-collapse.md`

---

## 1. De kern in één alinea

**v0.6** is een retrieval-/anti-hallucinatie-upgrade: het voegt een **adaptive decision-layer** toe (per query kiezen tussen fast/standard/careful om zware stages over te slaan), een **matched-span context-format** (de LLM ziet expliciet welk fragment matchte + de bredere passage), een **hard-fact verifier** (regex op geld/datums/aantallen die de embedding-claim-check niet vangt), gekalibreerde retrieval-thresholds, en een **geo/kalender-bridging**-regel. **v0.7.x** is daarentegen een **pure output-/prompt-laag** zonder pipeline-wijziging: scherpere lengte-instructies, BLUF (bottom-line-up-front), anti-preamble, een weiger-carve-out, en een widget-renderer die nu bullets en witregels toont. v0.7.3 is de huidige `LATEST_BOT_VERSION`.

---

## 2. Hoe v0.6 en v0.7 tot stand kwamen

### 2.1 v0.6 — een 3-staging experiment dat collapste tot één versie
v0.6 is niet in één keer gebouwd. Het liep als drie staging-versies, elk met een eigen eval:
- **v0.6.1** (PR-A) — matched-span context + hard-fact verifier.
- **v0.6.2** (PR-B) — adaptive RAG decision-layer + `retrievalTopK` 5→8 + selectieve multi-turn rewrite + `gap_kind` classificatie.
- **v0.6.3** (collapse-prep) — `hardFactNumericFallback: false` + `compositeQueryPath: 'standard'` + gekalibreerde thresholds.

Na een full 4-versie eval shoot-out (v0.5/v0.6.1/v0.6.2/v0.6.3) is **v0.6.3 als winnaar gekozen en hernoemd naar `v0.6`**. De staging-versies v0.6.1/v0.6.2 zijn uit `BOTS` verwijderd. Dit is een **bewuste doorbraak van de append-only-conventie** voor de v0.6-lijn; v0.1–v0.5 blijven byte-identiek. Later is er nog een **in-place bridging-patch** op v0.6 toegevoegd (ook bewust in-place, omdat v0.6 al live was).

### 2.2 v0.7 — let op: er zijn DRIE dingen die "v0.7" heetten
Dit is een bekende bron van verwarring. Voor de brainstorm is het belangrijk ze uit elkaar te houden:

| "v0.7" | Wat het was | Status |
|---|---|---|
| **v07-prio-1234** | Experiment: regenerate-trigger + multi-hop context + fast-path + cache 0.88 + latency/cost-optimalisatie | **Verworpen** (gelijk aan v0.6 in kwaliteit, -17% latency / -30% cost maar +1 must-not) |
| **v07 regenerate-AND** | Experiment: claim-regenerate alleen triggeren bij claim-confidence **én** ontbrekende hard-fact (AND i.p.v. OR) | **NO-GO** (factual 3.42→2.94, must-not 6→9) — weggegooid |
| **v0.7.1 / v0.7.2 / v0.7.3** | De geshipte **output-clarity**-lijn | **LIVE** — v0.7.3 = LATEST |

Als iemand vandaag "v0.7" zegt, bedoelt hij de **output-clarity-lijn**. De twee verworpen experimenten staan in dit document alleen als les (sectie 9.4 + 10).

De output-clarity-lijn zelf evolueerde ook in drie stappen:
- **v0.7.1** = de eerste geshipte v0.7 (hernoemd toen v0.7.2 landde) — `outputStyleVersion=v2` + BLUF-blok.
- **v0.7.2** = tune tegen "too curt": `outputStyleVersion=v3` + herschreven output-blok dat wedervragen/CTA's behoudt.
- **v0.7.3** = carve-out: de volledigheids-regels gelden alleen bij beantwoordbare vragen; bij weigering kort en schoon.

---

## 3. Stack-realiteit (ongewijzigd t.o.v. v0.5)

Geen model- of infra-wijziging in v0.6/v0.7. Chat/rerank/pre-process/HyDE/decompose/followups op **`gpt-4o-mini`**, cascade op **`gpt-4o`**, embeddings **`text-embedding-3-small`** (1536 dim), judge **`gpt-4o`**, DB Supabase+pgvector, hosting Vercel. Anthropic SDK aanwezig maar ongebruikt (V1 Phase 4 migreert naar Claude Haiku 4.5). Similarity-threshold empirisch **0.4**. Max top-1-similarity in dit NL-corpus ≈ **0.66** — relevant want alle v0.6-thresholds zijn daarop gekalibreerd.

---

## 4. BotConfig — volledige settings

### 4.1 v0.6 (`V0_6`, erft van `V0_5`)

```ts
const V0_6: BotConfig = {
  ...V0_5,
  version: 'v0.6',
  label: 'v0.6 — adaptive RAG + hard-facts + matched-span + bridging',

  // Hard-fact + matched-span (uit v0.6.1)
  matchedSpanContext: true,
  adaptiveHardFactVerification: true,
  hardFactNumericFallback: false,        // v0.6.3 — vangt €249-class hallucinatie

  // Adaptive RAG (uit v0.6.2)
  adaptiveRag: true,
  adaptiveWeakTopSim: 0.50,              // ≈ p20 van top1Sim-distributie
  adaptiveStrongTopSim: 0.56,            // ≈ p75 (oude 0.62 was onbereikbaar)
  adaptiveRerankMargin: 0.08,            // min top1-top2 gap voor fast-path
  adaptiveCascadeMinTopSim: 0.60,        // strenger dan v0.5's 0.50
  retrievalTopK: 8,                      // was 5
  rerankInputMax: 20,                    // was 10
  finalContextMaxChunks: 5,
  adaptiveHistoryResolution: true,       // multi-turn addon alleen bij referentie
  knowledgeGapLogging: true,             // gap_kind in telemetrie
  compositeQueryPath: 'standard',        // v0.6.3 — composite NIET careful

  evalBudgetMs: 5500,
  evalBudgetUsd: 0.0050,

  // In-place patch: geo/kalender-bridging achter de v0.5-systemPrompt
  systemPrompt: V0_5.systemPrompt + V0_6_BRIDGING_BLOCK,
};
```

**Nieuwe velden t.o.v. v0.5** (allemaal optioneel + backwards-compat default):
- `matchedSpanContext` — context-format (sectie 6).
- `adaptiveHardFactVerification` — hard-fact regex-check (sectie 7).
- `hardFactNumericFallback` — `false` = strikt money-vs-money matchen.
- `adaptiveRag` + thresholds — de decision-layer (sectie 5).
- `retrievalTopK` / `rerankInputMax` / `finalContextMaxChunks` — meer kandidaten ophalen, selectief doorgeven.
- `adaptiveHistoryResolution` — prepend de multi-turn-addon alleen als de vraag een referentie bevat.
- `knowledgeGapLogging` / `compositeQueryPath`.

### 4.2 v0.7.1 / v0.7.2 / v0.7.3

```ts
// v0.7.1 — output-clarity (was 'v0.7', hernoemd)
const V0_7_1 = {
  ...V0_6,
  version: 'v0.7.1',
  outputStyleVersion: 'v2',                              // NIEUW veld
  systemPrompt: V0_6.systemPrompt + V0_7_OUTPUT_RULES_BLOCK,   // BLUF-blok
};

// v0.7.2 — tune tegen too_curt
const V0_7_2 = {
  ...V0_7_1,
  version: 'v0.7.2',
  outputStyleVersion: 'v3',                             // context-behoudende medium
  systemPrompt: V0_6.systemPrompt + V0_7_2_OUTPUT_RULES_BLOCK,  // herschreven blok
  //  ↑ rebuild vanaf V0_6.systemPrompt — NIET v0.7.1's — zodat het oude,
  //    contradicerende output-blok niet stapelt.
};

// v0.7.3 — weiger-carve-out (= LATEST)
const V0_7_3 = {
  ...V0_7_2,
  version: 'v0.7.3',
  systemPrompt: V0_6.systemPrompt + V0_7_3_OUTPUT_RULES_BLOCK,  // v0.7.2-blok + carve-out
};
```

Het **enige nieuwe BotConfig-veld** dat v0.7 introduceert is `outputStyleVersion?: 'v1' | 'v2' | 'v3'`. **Geen pipeline-flags.** v0.7.x erft de hele v0.6-pipeline ongewijzigd; alleen de system-prompt-tekst en de length-suffix verschillen.

---

## 5. Adaptive decision-layer (v0.6, `rag-decision.ts`) — het hart van v0.6

Doel: niet elke query verdient de volle, dure pipeline. Een simpele FAQ met sterke retrieval mag rerank/verify/cascade/followups overslaan; een query met zwakke retrieval krijgt juist álle kwaliteitslagen. De beslissing is een **pure functie** (`decideRagStrategy`), tsx-testbaar, zonder I/O of cycle naar `rag.ts`.

### 5.1 De drie paden

| Path | Wanneer | Effect |
|---|---|---|
| **fast** | strong retrieval (`top1 ≥ 0.56`) **én** clear winner (top1-top2 gap ≥ 0.08) **én** geen composite (of `compositeQueryPath='standard'`) | skip HyDE, rerank, verify, cascade, followups |
| **careful** | weak/none retrieval (`top1 < 0.50`) **of** composite-query met `compositeQueryPath='careful'` | alle kwaliteitslagen aan; cascade alléén bij medium/strong + ≥2 chunks (geen priors-invullen op zwakke grond) |
| **standard** | al het andere (medium, of strong-zonder-clear-winner, of composite met `path='standard'`) | het v0.6.1-pad: bestaande condities blijven leidend |

### 5.2 Retrieval-strength classificatie

```ts
function classifyStrength(top1Sim, aboveThresholdCount, weakThreshold, strongThreshold) {
  if (aboveThresholdCount === 0) return 'none';
  if (top1Sim === null)          return 'weak';
  if (top1Sim < weakThreshold)   return 'weak';     // < 0.50
  if (top1Sim >= strongThreshold) return 'strong';  // ≥ 0.56
  return 'medium';                                   // 0.50–0.56
}
```

### 5.3 Clear-winner & fast-eligibility

```ts
const top1Top2Gap =
  top1Sim !== null && top2Sim !== null ? top1Sim - top2Sim
  : top1Sim !== null ? rerankMargin   // single chunk = clear winner (geen rivaal)
  : null;
const hasClearWinner = top1Top2Gap !== null && top1Top2Gap >= rerankMargin;  // ≥ 0.08

const canFastWithComposite = !hasComposite || compositePath === 'standard';
const isFast = retrievalStrength === 'strong' && hasClearWinner && canFastWithComposite;
```

> ⚠️ **In de praktijk triggert het fast-pad bijna nooit** (0/54 cases in de v0.6.2-eval, 0/69 in de collapse). Oorzaak: v0.6 erft `queryDecomposition: true`, dus de meeste queries worden gesplitst → `subQueryCount > 1`. Vóór v0.6.3 betekende dat automatisch careful; ná v0.6.3 (`compositeQueryPath='standard'`) gaat composite naar standard, maar `hasComposite=true` blokkeert nog steeds de fast-eligibility tenzij `compositePath==='standard'` — wat het toelaat, maar dan moet ook de strong+gap-eis gehaald worden, en dat lukt zelden. **Dit is een open verbeter-haakje (sectie 11).**

### 5.4 De flag-pass-through (belangrijk om te snappen)

Als `bot.adaptiveRag !== true` returnt de functie `path='standard'` met **alle `shouldX=true`** — dan blijven de bestaande pipeline-condities (v0.5-gedrag) leidend. De decision is dus additief: oudere versies merken er niets van.

In `rag.ts` wordt de decision **twee keer** berekend: een `decisionPreHyDE` (voor de HyDE-gate) en een definitieve `decision` na threshold-filter + HyDE-augment. Op die laatste hangen de gates voor rerank / cascade / claim-verify / followups.

### 5.5 `needsHistoryResolution` (selectieve multi-turn rewrite)

v0.6 prepend de multi-turn-addon (uit v0.5) niet meer bij élke history, maar alleen als de vraag waarschijnlijk een referentie bevat — keyword-heuristiek (~80% recall, bewust simpel):

```ts
const HISTORY_REFERENCE_RE = /\b(?:dat|die|dit|deze|daar|…|hij|zij|het|ze|hen|hem|haar|zijn|hun)\b/i;
const LEADING_CONJUNCTION_RE = /^(?:en|maar|of|ook|verder|nog|dan|toch)\b[\s,?!]/i;
const SHORT_FOLLOWUP_RE = /^\s*(?:hoeveel|wanneer|waarom|hoe|waar|wat)\s*\?\s*$/i;
```
False-positives (onnodig de addon) zijn goedkoop (iets langer prompt); false-negatives vallen terug op het v0.5-gedrag. Acceptabel.

---

## 6. Matched-span context-format (v0.6, `rag.ts`)

v0.5 gaf de LLM één blob per chunk (`parent_content ?? content`). v0.6 splitst dat expliciet in een **precisie-anker** (de kleine chunk die feitelijk matchte) en de **bredere context**:

```ts
if (bot.matchedSpanContext && hasParent) {
  block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n`
        + `MATCHED_SPAN:\n${c.content}\n\n`
        + `SURROUNDING_CONTEXT:\n${c.parent_content}\n\n`;
  usedMatchedSpan = true;
} else {
  const text = c.parent_content ?? c.content;       // v0.5 fallback
  block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n${text}\n\n`;
}
```

En een intro-regel die de LLM vertelt hoe het format te lezen (alleen als minstens één chunk in matched-span-format staat — anders byte-identiek aan v0.5):

```
Bronnen-format: elke source bevat een MATCHED_SPAN (het exacte fragment dat met de
vraag matchte) en SURROUNDING_CONTEXT (bredere passage). Baseer feitelijke claims
primair op de MATCHED_SPAN — gebruik SURROUNDING_CONTEXT alleen voor nuance en begrip.
```

Idee: de bot weet preciezer waar het kern-bewijs staat en gebruikt de parent alleen voor nuance — minder kans dat hij op een zijdelings detail uit de grote parent een claim baseert.

---

## 7. Hard-fact verifier (v0.6, `hard-facts.ts` + `claims.ts` + `rag.ts`)

### 7.1 Waarom
Embedding-claim-verification (v0.4, `claims.ts`) matcht **vector-shape**, niet exacte waarde. *"€50 per maand"* en *"€500 per maand"* hebben bijna identieke cosine-similarity — een verkeerd **bedrag** wordt dus niet gevangen. Voor een MKB-klantcontactbot is juist de prijzen/datums/aantallen-categorie waar hallucinatie het meest schadelijk is.

### 7.2 Hoe — regex-extractie + genormaliseerde set-membership
`extractHardFacts(text)` haalt per categorie harde feiten uit een tekst en normaliseert ze naar canonical form:

| Categorie | Voorbeeld-match | Canonical |
|---|---|---|
| `money` | `€50` / `EUR 50` / `50 euro` / `€50,00` | `"50"` |
| `percentages` | `5,5%` / `100 %` | `"5.5"` / `"100"` |
| `datesOrYears` | `15-3-2024` / `2024` | `"15-3-2024"` / `"2024"` |
| `numbers` | losse getallen ≥2 cijfers (ná money/date/% strip) | `"249"` |
| `emails` / `urls` / `phones` | lowercased / cijfer-only | — |

Money/date/percentage/phone worden **eerst** gematcht en hun ranges "geconsumeerd", zodat de generieke `numbers`-regex niet `€50` dubbel als `50` pakt.

`hardFactsSupportedBySources(facts, sourceTexts, { numericFallback })` checkt of élk feit in het antwoord (per categorie, genormaliseerd) voorkomt in minstens één source. De cruciale flag:

```ts
const moneyWithFallback = numericFallback
  ? new Set([...sourceFacts.money, ...sourceFacts.numbers])  // v0.6.1/.2 (te ruim)
  : new Set(sourceFacts.money);                              // v0.6.3 (strikt)
```

**De €249-bug.** Met `numericFallback: true` telt elke kale `"249"` ergens in een chunk als bewijs voor `"€249"` in het antwoord. De Concept Blueprint heeft pricing-tabellen met losse getallen tussen pipes (`300 gesprekken | €0,07 / extra`), dus de bot recombineerde plausibele Business-tier-waarden (€249/maand, 6000 gesprekken, €0,04 overage) die allemaal als substring bestonden maar niet als coherent feit. **v0.6 (`hardFactNumericFallback: false`) vangt dit** — money matcht alleen tegen money-met-valutateken.

### 7.3 Hoe het in de pipeline hangt (`rag.ts`)
De hard-fact-check draait **binnen** de bestaande claim-verify-stage (Stage 13), en heeft twee speciale gates:

```ts
// Hard-fact verify mag NIET door latency-budget geskipt worden — anders draait
// de check nooit op de trage queries waar hallucinatie-risico het hoogst is.
const verifyBudgetGate = bot.adaptiveHardFactVerification === true
  ? true
  : (withinBudget() || markSkipped('claimVerification'));
const verifyDecisionGate = !bot.adaptiveRag || decision.shouldVerifyClaims;

// verifyClaims krijgt de hard-fact opties mee:
const result = await verifyClaims({
  answerText, chunks: chunkInputs, threshold: bot.claimVerificationThreshold,
  hardFactCheck: bot.adaptiveHardFactVerification === true,
  hardFactNumericFallback: bot.hardFactNumericFallback,
});
hardFactSupported = result.hardFactSupported;     // bool
missingHardFacts  = result.missingHardFacts ?? []; // ["money:249", …]
```

### 7.4 Koppeling aan claim-regenerate (Stage 15)
v0.5 triggerde regenerate alleen bij lage claim-confidence. v0.6 voegt een tweede trigger toe:

```ts
const lowClaimConfidence  = claimConfidence < bot.claimRegenerateThreshold;   // < 0.30
const unsupportedHardFact = bot.adaptiveHardFactVerification === true
                            && hardFactSupported === false;
if (bot.claimRegenerateEnabled
    && (lowClaimConfidence || unsupportedHardFact)   // ← OR: óf zwakke claims, óf missend hard fact
    && claimsList?.length > 0) {
  // → één extra LLM-call met strictere prompt; mag het ongegronde getal weglaten.
}
```

> 📌 **Les (sectie 10): deze trigger is een OR.** Het verworpen v0.7-experiment veranderde hem naar AND (alleen regenereren als beide waar zijn). Dat liet planted_fact/false_premise-hallucinaties terugkomen, want die triggerden alleen via de hard-fact-tak. NO-GO.

---

## 8. v0.6 geo/kalender-bridging (`bots.ts`, `V0_6_BRIDGING_BLOCK`)

Een in-place patch op de v0.6-systemprompt. Probleem: de bot zei "weet ik niet" op vragen die met **onomstotelijke publieke kennis + één context-feit** prima te beantwoorden zijn ("Valt Lelystad in werkgebied Flevoland?"). De regel (samengevat):

- **Geografie:** noemt de context een administratieve regio als werkgebied (provincie/gemeente/land), dan vallen plaatsen binnen die regio er ook onder. Een detail-lijst van plaatsen is **illustratief, niet uitputtend** (tenzij "uitsluitend X").
- **Eenheden** (cm↔m↔km, €-symbool, uren↔minuten) en **kalender** (dagen, weekend/werkdag, maanden) zijn publiek — mag gebruikt worden.
- **NIET bridgen:** fuzzy regio's ("Randstad", "Achterhoek", "het Noorden"), en **alle** bedrijfsspecifieke feiten (openingstijden, tarieven, diensten) blijven strikt uit-context-only.

Iteratie 2 (na een eval die liet zien dat iteratie 1 te vaag was) maakte expliciet dat een algemeen regio-statement *autoritatief* is en een detail-lijst *illustratief*, met worked examples — omdat de LLM graag ankerde op de plaatsnamenlijst alsof die uitputtend was.

---

## 9. v0.7 output-clarity — mechaniek op code-niveau

### 9.1 Versie-bewuste lengte-strings (`style.ts`)
`buildSystemPrompt(base, {tone, length}, outputStyleVersion)` kiest welke length-map de suffix bepaalt. Drie versies naast elkaar zodat oudere evals reproduceerbaar blijven:

| | `short` | `medium` (= eval-default) | `detailed` |
|---|---|---|---|
| **v1** (≤v0.6) | "max 2 zinnen" | "één korte alinea (3-5 zinnen)" | "uitgebreid, meerdere alinea's" |
| **v2** (v0.7.1) | "ULTRA-kort: 1 zin als 't kan, max 2. Geen aanloop of slot." | "het minimum dat compleet is — zo kort als de vraag toelaat" | gestructureerd: witregels, bullets bij 3+ items, **vette koppen** |
| **v3** (v0.7.2/.3) | "1-3 zinnen … maar laat geen cruciale nuance, correctie of vervolgstap weg" | "minimum dat compleet **én bruikbaar** is … bij vage vraag eerst één wedervraag … beknoptheid nooit ten koste van nodige nuance/correctie/vervolgstap" | (= v2) |

```ts
function pickLengthMap(version) {
  if (version === 'v3') return LENGTH_INSTRUCTION_V3;
  if (version === 'v2') return LENGTH_INSTRUCTION_V2;
  return LENGTH_INSTRUCTION_V1;
}
// rag.ts geeft bot.outputStyleVersion door; default undefined ≡ 'v1'.
```

> De eval draait altijd op `medium` — dáár zat de v0.7.1 "too curt"-regressie: de v2-medium ("het minimum dat compleet is") + het BLUF-blok ("stop zodra de vraag beantwoord is") sneden nodige context, wedervragen en CTA's weg. v3-medium herstelt dat door die assen expliciet terug te geven.

### 9.2 De drie output-discipline-blokken (`bots.ts`)
- **v0.7.1 (`V0_7_OUTPUT_RULES_BLOCK`):** BLUF (eerste zin = antwoord; ja/nee → "Ja"/"Nee") + geen preamble ("Bedankt voor je vraag" verboden) + "VERBODEN als slot: een conclusie-zin die alles herhaalt. Stop zodra de vraag is beantwoord." + geen opgeblazen zinnen.
- **v0.7.2 (`V0_7_2_OUTPUT_RULES_BLOCK`):** zelfde BLUF/anti-preamble, maar **"VERBODEN als slot"** afgezwakt naar alleen samenvattende herhaling, plus een nieuw blok **"WAT BONDIGHEID NIET MAG WEGLATEN"**: bij vage vraag → wedervraag; bij onjuiste aanname → kort waaróm; een concrete vervolgstap/CTA hoort erbij. Rebuild vanaf `V0_6.systemPrompt` zodat het oude contradicerende blok niet stapelt.
- **v0.7.3 (`V0_7_3_OUTPUT_RULES_BLOCK`):** = v0.7.2-blok **+** carve-out **"ALS HET ANTWOORD NIET IN DE BRONNEN STAAT — WEIGER KORT EN SCHOON"**: bij geen-grond/buiten-kennisgebied is een korte eerlijke weigering het volledige antwoord; verzin niets bij, som geen diensten/prijzen op, plak geen CTA/wedervraag aan de weigering. Bij misleiding (injection/geplant nepfeit) kort afwijzen. De volledigheids-regels uit v0.7.2 gelden **alleen** bij een beantwoordbare vraag.

De ontwerpreden voor v0.7.3: v0.7.2's volledigheids-regels generaliseerden te breed naar weiger-types — op "doen jullie loodgieterswerk?" verzon de bot de dienst "dakisolatie" (niet in bronnen) → grounding 5→1. Dat botst met de hard rule "anti-hallucinatie boven volledigheid".

### 9.3 Widget-renderer (`render-markdown-lite.tsx`)
Zonder deze upgrade landde de gestructureerde prompt-uitvoer als platte tekst in de widget-bubble. `renderMarkdownLite()` ondersteunt nu — bewust beperkt — drie dingen:
- **`**bold**`** → `<strong>` (inline split op `(\*\*[^*]+\*\*)`).
- **Lege regel** → paragraph-break (`<div style={{height: 8}}>`).
- **`- ` / `* ` aan regelbegin** → opeenvolgende bullets samengevouwen tot één `<ul>`.

Niet ondersteund (graceful degradation naar plain text): genummerde lijsten, nested bullets, `#`-headings, tabellen, links. Plus een **streaming-veilige cleaner** (`cleanWidgetAnswer`) die `<thinking>`/`<answer>`/`<confidence>`-tags en `[n]`-citaties wegknipt — ook half-open tags tijdens het streamen, zodat interne reasoning nooit even in de bubble flikkert.

---

## 10. Telemetrie-uitbreidingen (migraties 0022/0023)

v0.6 voegt kolommen toe (beide migraties zijn **productie, niet rollback'en**):
- **0022:** `hard_fact_supported` (bool), `missing_hard_facts` (jsonb) op `query_log`.
- **0023:** `gap_kind` (knowledge-gap-classificatie), `adaptive_decision` (jsonb: path + retrievalStrength + per-stage booleans + reasonCodes).

De `adaptiveDecision` wordt in `ChatResponse.extras` gezet en door `log.ts` naar `query_log.adaptive_decision` gemapt. Het eval-report **slicet hierop** voor per-path means.

> 📌 **Diagnostiek-valkuil (blijft gelden):** eval-runs schrijven naar **`eval_runs`**, niet naar `query_log`. v0.6 mergt adaptiveDecision + gapKind in `eval_runs.stage_timings_ms`. Wie eval-gedrag debugt, queryt `eval_runs`.

---

## 11. Eval-pipeline + ALLE meetdata voor v0.6/v0.7

De judge (`gpt-4o`, temp 0, JSON-mode) scoort `correctness`/`completeness`/`grounding` (0-5) + `route_correct`/`meta_talk_present` (bool) + must-not-violation-telling. Standaard worden alleen de 2 nieuwste versies gejudged (cost-discipline). **Judge-noise = 0.3–0.85 punt** tussen runs op identieke data — deltas <0.30 op overall zijn ruis.

### 11.1 v0.6.1 PR-A (54 cases × 2 runs, 2026-05-17)
| versie | C | P | G | overall | bot $/q | p50 |
|---|---|---|---|---|---|---|
| v0.4 | 3.06 | 3.43 | **3.67** | **3.39** | $0.0023 | 6452ms |
| v0.5 | 3.10 | 3.29 | 3.25 | 3.22 | $0.0025 | 6977ms |
| **v0.6.1** | 3.20 | 3.37 | 3.35 | **3.31** | $0.0026 | 7230ms |

Conclusie: v0.6.1 ≈ v0.5 statistisch (+0.09 binnen noise). Feature draait correct (`verify_ms` 158-234ms zichtbaar), cost/latency neutraal. **Win nog niet zichtbaar** in aggregate omdat maar 1 van 5 hard-fact-cases écht een directionele verbetering toonde (jaarafname-korting 1/2/3 → 5/5/5). De €249-case faalde nog (numeric-fallback bug).

### 11.2 v0.6.2 PR-B (54 cases × 2 runs, 2026-05-17)
| versie | C | P | G | Avg | bot $/q | p50 |
|---|---|---|---|---|---|---|
| v0.5 | 3.08 | 3.33 | 3.43 | 3.28 | $0.0023 | 6581ms |
| v0.6.1 | 3.27 | 3.63 | 3.31 | **3.40** | $0.0020 | 6658ms |
| **v0.6.2** | 3.20 | 3.45 | **3.44** | 3.37 | **$0.0009** | **6087ms** |

**Kernsignaal: gelijke kwaliteit aan -60% cost** ($0.0009 vs $0.0023). Saving komt van followups-uit (standaard `shouldGenerateFollowupsInline=false`), vaker geskipte HyDE (budget-gate), en rerank-skips. Per-path:

| path | n | overall | bot ms |
|---|---|---|---|
| **fast** | **0** | — | — |
| standard | 38 | 3.23 | 7255 |
| careful | 6 | **2.50** | 7970 |

→ **0 fast-cases** (decompose splitst → composite → niet fast). **careful scoort lager dan standard** (2.50) — de hard-cases, maar ook een teken dat careful op composite schadelijk was → leidde tot v0.6.3's `compositeQueryPath='standard'`.

### 11.3 v0.6 collapse shoot-out (69 cases × 2 runs, 2026-05-18) — de beslissende run
| Metric | v0.5 | v0.6.1 | v0.6.2 | **v0.6.3 (=v0.6)** |
|---|---|---|---|---|
| Overall | 2.99 | **3.34** | 3.16 | 3.15 |
| Correctness | 2.77 | 3.22 | 3.01 | 2.97 |
| Completeness | 3.13 | 3.49 | 3.17 | 3.30 |
| Grounding | 3.07 | 3.32 | 3.29 | 3.17 |
| **Must-not (unieke slugs)** | — | 8 | 10 | **7 (best)** |
| Cost/q | $0.0036 | $0.0031 | $0.0009 | **$0.0009** |
| Latency p50 | 6178ms | 5283ms | 5259ms | 5321ms |

**Per question_type:**
| Type | n | v0.6.1 | v0.6.2 | v0.6.3 |
|---|---|---|---|---|
| out_of_corpus (kritiek) | 25 | 2.92 / 5 viol | 3.44 / 4 viol | 3.40 / **3 viol** |
| planted_fact | 3 | 3.89 / 0 | 2.22 / **2 ⚠️** | 3.67 / **0** |
| false_premise | 3 | 4.56 | 3.22 | 3.44 |
| factual | 22 | **3.57** | 3.00 | 2.85 ⚠️ |
| multi_hop | 4 | 2.75 | 2.58 | 2.33 |
| smalltalk | 4 | 5.00 | 5.00 | 5.00 |

**Waarom v0.6.3 won** ondanks de laagste overall (binnen noise): (1) minste hallucinaties (7 vs 8 vs 10), (2) vangt de €249-class, (3) fixt v0.6.2's planted-fact-regressie (2→0), (4) goedkoopst. **Bewuste trade-off:** factual -0.72 vs v0.6.1 — de bot speelt vaker safe (regenerate triggert vaker op feiten) en onderspeelt soms een correct antwoord. Voor een klantcontact-bot weegt "weet ik niet" zwaarder dan "verzint feiten".

### 11.4 De verworpen v0.7-experimenten
**(a) regenerate-AND** (69 cases × 2 runs):
| Metric | v0.6 | v0.7 | target | status |
|---|---|---|---|---|
| factual | 3.42 | 2.94 | ≥3.30 | ❌ |
| out_of_corpus | 3.35 | 3.17 | ≥3.30 | ❌ |
| must-not (unieke) | 6 | 9 | ≤8 | ❌ |
| overall | 3.30 | 3.14 | ≥3.25 | ❌ |

**(b) prio-1234** (77 cases × 2 versies): v0.6=3.48 vs v0.7=3.40 (gelijk binnen noise), latency **-17%**, cost **-30%**, maar must-not +1. Niet gepromoveerd.

> 🔎 **Let op de judge-noise tussen runs:** v0.6 wordt hier op **3.30 / 3.48** gemeten, terwijl de collapse-run (11.3) v0.6 op **3.15** mat — **zelfde config, andere run**. factual zwaaide 2.85 → 3.42 → 3.53 over runs. Dit is exact waarom deltas <0.30 als ruis worden behandeld.

### 11.5 Output-clarity clean eval — v0.7.1 vs v0.7.3 (n=140 pairwise, 2026-05-24)
| Metric | v0.7.1 | **v0.7.3 (LATEST)** |
|---|---|---|
| Overall | 3.295 | 3.314 (+0.02, noise) |
| too_curt % | 11.5% | 10.0% |
| production_ready % | 37.9% | 40.0% |
| meta_talk count | 26 | **14** |
| must_not | 10 | **9** (fixte injection-prompt, 0 nieuwe) |
| factual (n=60) | 3.53 | 3.53 (vlak) |

Engage-buckets omhoog: false_premise +0.58, ambiguous +0.33, prompt_injection +0.27. Weiger-buckets: out_of_corpus (n=32) **−0.10**, planted_fact **−0.28** (binnen noise — de carve-out herstelde z'n hoofddoel out_of_corpus dus **niet** volledig). Promotie-grond: gate-schoon + strikt beter op de anti-hallucinatie-as (meta_talk en must-not omlaag). Run-to-run judge-noise hier gemeten op **≈0.12** op overall bij n=140.

---

## 12. Anti-hallucinatie-linies in v0.6/v0.7 (wat veranderde)

Bovenop de v0.5-stack (threshold, trust-boundary, citations, confidence, cascade-gate, claim-verify, claim-regenerate) voegen v0.6/v0.7 toe:
- **Cascade-gate strenger** — `adaptiveCascadeMinTopSim: 0.60` (was 0.50); op `careful`-pad alleen cascade bij medium/strong + ≥2 chunks.
- **Hard-fact verifier** — regex-check op geld/datums/aantallen, met `numericFallback: false` tegen de €249-class.
- **Hard-fact → regenerate (OR)** — een ongegrond getal triggert een strictere 2e poging, ook bij hoge embedding-confidence.
- **v0.7.3 weiger-carve-out** — voorkomt dat de bot een weigering opvult met verzonnen diensten/prijzen.

---

## 13. Failure-modes / open issues (v0.6/v0.7)

- **Fast-path triggert nooit** (0 cases over alle runs). De combinatie `queryDecomposition:true` (→composite) + de strenge `top1-top2 gap ≥ 0.08`-eis verhindert het. Latency-winst blijft liggen.
- **Factual-regressie v0.6 vs v0.6.1** (-0.72 in de collapse-run, maar 3.42-3.53 in latere runs). Deels bewuste anti-halluc-trade-off (`numericFallback:false` → vaker regenerate → 2e antwoord soms minder accuraat), deels judge-noise. Niet definitief geïsoleerd.
- **Pure-refusal-buckets resistent tegen prompt-tuning** — out_of_corpus/planted_fact (bot vult weigering op met ongegronde detail) bewogen niet betrouwbaar met v0.7.3's carve-out (out_of_corpus −0.10). Waarschijnlijk is een retrieval/threshold/verifier-ingreep nodig, geen prompt-regel.
- **careful-pad scoort laag** (2.50, n=6) — deels omdat het de hard-cases bevat, maar v0.6.2's careful-op-composite was actief schadelijk (gefixt in v0.6.3).
- **Cache-hit ≈ 0%** op het corpus — de cache-laag (incl. v0.7-experiment's 0.88-threshold) levert weinig op.
- **multi_hop zwak** (2.33-2.75, n=4) — statistisch dun, consistent laag.
- **Judge-noise 0.3-0.85 punt** — de grootste meet-blokker; sub-buckets (n<10) zijn nauwelijks interpreteerbaar.

---

## 14. Brainstorm-haakjes specifiek voor v0.6/v0.7

**Adaptive layer / latency**
- Fast-path activeren: gap-eis (0.08) versoepelen, of een single-chunk-fast-rule, of `queryDecomposition` selectief uit op simpele queries. Verwachte -20-40% latency op een subset.
- Per-path kwaliteit meten met meer power — careful écht beter dan standard op z'n eigen hard-cases?

**Hard-facts**
- Context-aware (bedrag, valuta)-tuples i.p.v. losse getallen; zelfde strengheid voor percentages/aantallen.
- Natural-language numbers ("vijftig euro") en bredere date-formats — nu bewust niet gedekt.

**Anti-hallucinatie waar prompt niet helpt**
- Een hardere retrieval-gate voor de pure-refusal-buckets: "geen chunk boven X sim → categorisch weigeren zonder enige detail-generatie".
- De regenerate-prompt verbeteren zónder de OR-trigger te raken (de AND-variant was NO-GO).

**Matched-span**
- Meten of matched-span écht helpt vs de v0.5-blob (v0.6.1 toonde geen aantoonbare grounding-win) — of het format aanscherpen.

**Output-clarity / widget**
- Een expliciete weiger-UI-component i.p.v. prozaweigering (de weiger-buckets blijven het zwakst).
- Genummerde lijsten / links in de widget-renderer?

**Eval-meetbaarheid (grootste blokker)**
- Judge-runs middelen / batch-judge / groter corpus (n→100+) voor power onder 0.3 punt. Zonder dit blijven alle v0.x-deltas interpretatief.

**Model / V1**
- Claude Haiku 4.5 als primair (V1 Phase 4): de v0.6 regex-verifier en de matched-span-prompt zijn model-onafhankelijk, maar de prompt-discipline (BLUF, output-blokken) moet opnieuw gevalideerd worden op een ander model.

---

## 15. Bestandsmap (v0.6/v0.7-relevant)

```
lib/v0/server/
  bots.ts          V0_6 + V0_7_1/2/3 + V0_6_BRIDGING_BLOCK + V0_7_*_OUTPUT_RULES_BLOCK
  rag-decision.ts  ⭐ decideRagStrategy + needsHistoryResolution (NIEUW v0.6)
  hard-facts.ts    ⭐ extractHardFacts + hardFactsSupportedBySources (NIEUW v0.6)
  claims.ts        verifyClaims — krijgt hardFactCheck + hardFactNumericFallback params
  rag.ts           matched-span format + decision-gating + hard-fact stage + regenerate-trigger
lib/v0/style.ts    LENGTH_INSTRUCTION_V1/V2/V3 + buildSystemPrompt(…, outputStyleVersion)
lib/widget/render-markdown-lite.tsx   ⭐ bullets/witregel-renderer + cleanWidgetAnswer (v0.7)
supabase/migrations/0022_*, 0023_*    hard_fact_supported / missing_hard_facts / gap_kind / adaptive_decision
docs/evals/2026-05-17-v0.6.1-summary.md, -v0.6.2-summary.md, 2026-05-18-v06-collapse.md
docs/superpowers/specs/2026-05-23-v0.7-output-clarity-design.md
docs/V0_5_DEEP_DIVE.md   ← de basis-pipeline waar dit document op voortbouwt
```

---

## 16. TL;DR (om mee te beginnen in een brainstorm)

> **v0.6** maakt de RAG-pipeline *adaptief en feit-bewust*: een pure-functie decision-layer kiest per query fast/standard/careful (skip dure stages bij sterke retrieval, alles-aan bij zwakke), de context gaat als MATCHED_SPAN (precisie-anker) + SURROUNDING_CONTEXT (nuance) naar de LLM, en een regex hard-fact verifier checkt of geld/datums/aantallen in het antwoord echt in de chunks staan — met `numericFallback:false` om de "€249 = los 249"-hallucinatie te vangen — en triggert anders een strictere regenerate. v0.6 won z'n shoot-out op de **anti-hallucinatie-as** (minste must-not-violations, goedkoopst) tegen een bewuste factual-trade-off. **v0.7.x** raakt de pipeline niet en is puur *output-discipline*: scherpere lengtes (v1/v2/v3 strings), BLUF + anti-preamble, een widget-renderer voor bullets/witregels, en — cruciaal — een v0.7.3 carve-out die voorkomt dat de bot z'n weigering opvult met verzonnen detail. De drie hardnekkige open problemen: **(1)** het fast-pad triggert nooit (latency-winst onbenut), **(2)** de pure-refusal-buckets (out_of_corpus/planted_fact) laten zich met prompt-tuning niet dichttimmeren — retrieval/verifier-ingreep nodig, en **(3)** judge-noise van 0.3+ punt maakt kleine kwaliteitsverschillen onmeetbaar. **Brainstorm-vraag: halen we de volgende sprong uit de adaptive layer (fast-path + latency), uit hardere anti-halluc-verifiers voor de weiger-buckets, of uit het meetbaar maken van de eval zelf?**
