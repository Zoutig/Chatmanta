# SPEC — v0.9.2 "latency-pass" (TTFT-reductie, kwaliteit-neutraal)

**Datum:** 2026-05-29 · **Fase:** Latency-traject Fase 2, lever-bundel 1 · **Branch:** `feat/seb/latency-fase2`

## Wat

Een nieuwe append-only V0 bot-versie **v0.9.2** die de gevoelde snelheid (time-to-first-token)
verlaagt door twee gpt-4o-mini pre-answer-calls te schrappen wanneer ze aantoonbaar geen
waarde toevoegen — zónder de antwoordkwaliteit of de anti-hallucinatie-lagen te raken.
v0.9.1 blijft byte-identiek; v0.9.2 zet alleen twee nieuwe flags aan.

De baseline (v0.9 proxy, n=168–186, $0 uit `eval_runs`) laat zien dat TTFT p50 ≈3935ms /
p95 ≈7748ms vooral opgaat aan drie sequentiële LLM-calls vóór het eerste token:
`preprocess` (859ms), `decompose` (820ms), `rerank` (798ms p50 / **3747ms p95**) = ~63%
van TTFT. Twee daarvan draaien onnodig:

1. **`decompose` draait op élke query** (alleen gated door `queryDecomposition`-boolean),
   terwijl maar ~10% van het corpus multi_hop is. Single-hop vragen betalen ~820ms voor niets.
2. **`rerank` draait op 93% van de queries.** Het 'fast'-pad (skip rerank) vuurt **0%** —
   niet door de strong-drempel (74% ís al 'strong', top1Sim p50=0.630 > 0.56), maar door de
   **clear-winner-eis** (`top1−top2 gap ≥ 0.08`). Bij goede retrieval liggen topchunks dicht
   bij elkaar → kleine gap → rerank draait toch. De gap-heuristiek werkt averechts.

## Mechanisme

Twee nieuwe optionele `BotConfig`-flags (default `undefined` → bestaand gedrag → v0.9.1 onveranderd):

- **`decomposeHeuristicGate?: boolean`** — pure pre-LLM heuristiek `looksMultiHop(query)` in
  `rag-decision.ts`. Skip de decompose-call tenzij de vraag multi-hop-signalen toont
  (nevenschikkend "en"/"of" tussen twee deelvragen, meerdere `?`, vergelijking
  "verschil tussen"/"versus", opsomming). **Conservatief: bij twijfel wél decomposen**
  (false-negative op skip = huidig gedrag = veilig).
- **`rerankSkipOnStrong?: boolean`** — in `decideRagStrategy`'s **standard**-pad:
  `shouldRerank = retrievalStrength === 'strong' ? false : true`. Skip rerank zodra retrieval
  sterk is, ongeacht de gap. Het **careful**-pad (zwakke retrieval) blijft altijd reranken.
  `shouldVerifyClaims` / `shouldRegenerateClaims` / `shouldCascade` blijven onaangetast
  (= standard-pad-defaults) → anti-hallucinatie-lagen blijven áán.

v0.9.2 = `{ ...V0_9_1, version: 'v0.9.2', decomposeHeuristicGate: true, rerankSkipOnStrong: true }`.

## Acceptance criteria

- [ ] TTFT p50 daalt betekenisvol vs v0.9.1-baseline (target ~3935 → ~2300ms; ≥ −800ms),
      gemeten via `audit:latency` op een verse `eval:run`.
- [ ] `decompose_ms` = 0/afwezig op het merendeel van single-hop vragen; `rerank_ms` = 0 op
      het merendeel van strong-retrieval vragen — zichtbaar in `audit:latency`.
- [ ] **Geen kwaliteitsregressie** (harde gate):
      - `audit:retrieval` recall@k niet lager dan v0.9.1 op enig question_type.
      - `eval:hard:run` blijft 100% (geen safety/hard-fact-regressie).
      - grounding-score (`eval:run` judge) niet lager dan v0.9.1 buiten judge-noise (~0.12).
- [ ] v0.9.1 BotConfig + systemPrompt byte-identiek (append-only; alleen nieuwe versie toegevoegd).
- [ ] `looksMultiHop` is een pure, tsx-testbare functie (geen LLM, geen server-only import).

## Out of scope

- **`preprocess`/rewrite blijft** — die LLM-call doet óók de smalltalk-routing; niet schoon te
  knippen. Aparte, latere lever met hoger risico.
- Geen prompt-, embedding-, retrieval- of threshold-wijzigingen.
- Geen nieuwe migratie (`first_token_ms` bestaat al sinds #138/migr 0041).
- `multiQueryCount` blijft 1 (al uit op v0.9).
- Geen UI-wijziging.

## Edge cases

- **multi_hop** (16 eval-vragen): moeten blijven decomposen. Heuristiek conservatief; bij regressie
  op multi_hop-recall → heuristiek strenger (meer decomposen) of decompose-gate terugdraaien.
- **weak/medium retrieval**: blijft reranken (alleen 'strong' skipt). careful-pad onaangetast.
- **ambiguous / false_premise**: claim-verify + regenerate blijven áán → correctie-gedrag intact.
- **smalltalk / fallback / cache-hit**: decompose/rerank zitten ná de classificatie → onaangeraakt.
- **lege/korte query**: `looksMultiHop` returnt false → skip decompose (veilig, single-hop).

## Eval-strategie (kosten-bewust)

Iteratie-gate goedkoop: `audit:retrieval` ($0) + `eval:hard:run` (~€0,03). De volledige
grounding-judge (`eval:run --versions=v0.9.2,v0.9.1 --runs=5`, billable) draai ik **één keer**
vóór finalisatie → `audit:latency` bevestigt de TTFT-daling, `eval:report compareBaseline`
bevestigt geen grounding/recall-regressie. Billable run vraag ik expliciet aan vóór ik 'm start.
