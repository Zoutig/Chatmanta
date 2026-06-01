# ChatManta bot-prompt — streamline-plan + criteria

> **Doel.** De always-on answer-systemprompt van de bot strakker, korter en intern-consistent maken zonder de (eval-bewezen) anti-hallucinatie/veiligheidskern te verzwakken. Dit doc legt het ontwerp + de meetbare criteria vast — feedbaar aan een andere agent én de checklist voor de bouw.
>
> **Basis:** prod-LATEST = **v0.9.3** (gemerged: #159 v0.9.2 latency, #164 v0.9.3 taal). Let op: een lokale checkout die achterloopt op `origin/main` toont v0.9.1 als LATEST — werk altijd tegen `origin/main`.
>
> **Gekozen aanpak:** RESTRUCTURE-PRESERVE — herordenen + ontdubbelen, niets load-bearing schrappen. Onderbouwing in `docs/BOTVERSIES_PROMPT_REFERENTIE.md` + de multi-agent-analyse (workflow `prompt-streamline-analyse`).

---

## 1. Verdict (waarom dit nodig is)

De prompt is te lang én te voorwaardelijk voor `gpt-4o-mini` (temp 0.4): ~2.900–3.200 always-on tokens in 9 blokken. Het echte probleem is niet pure lengte maar de **combinatie** van:
- **lost-in-the-middle** — de veiligheidskern (TRUST-BOUNDARY, "geen feiten buiten context") staat ~25% door de prompt; het EMIT-CONTRACT staat in het midden met ~700 woorden erna;
- **botsende ketens** — de lengte-as is 3–5× met verschillende getallen gedefinieerd; carve-out-op-carve-out (BONDIGHEID ↔ WEIGER); `[N]`-citaties die botsen met markdown-bron-links;
- **always-on niche-blokken** — geo-bridging (~370 woorden) is het grootste blok maar relevant voor een fractie van de queries.

De veiligheidskern zelf is **verdiend** en blijft. De mechanische garanties zitten in pipeline-flags die maar smalle subsets dekken (getallen, persoonsnamen, code) — proza-feiten, niet-persoons-injectie, fuzzy-regio-over-bridging en niet-code off-domein taken leunen **puur op prompt-tekst**.

---

## 2. Vastgelegde beslissingen

| # | Beslissing | Keuze |
|---|---|---|
| Aanpak | Hoe agressief | **RESTRUCTURE-PRESERVE** (~25–30% korter, laagste regressierisico) |
| Citaties | `[N]`-chunkcitaties | **Schrappen uit de prompt** (alleen markdown-bron-links; `[N]` voedt geen telemetrie — `claims.ts` stript het vóór embed) |
| CoT/confidence | `<thinking>`/`<confidence>` | **Tags houden, uitleg comprimeren** (beide worden geparsed; confidence voedt de cascade) |
| Uitrol | versie-strategie | ⚠️ **OPEN** — gebruiker koos "in-place op v0.9.3"; zie §5 voor de consequentie + aanbeveling |

**Defaults die ik toepas (eval-gated), tenzij je anders zegt:**
- **Geo-bridging conditioneel** in de user-turn injecteren via een **ruime** regex-gate op de chunk-context (`werkgebied|regio|provincie|gemeente|gemeenten|openingstijd|geopend|zaterdag|…`), seam = `sourceLinksIntro`/`matchedSpanIntro` (`rag.ts:2231-2241`). Geo is een *capability*-blok: een gate-false-negative = onnodig "weet ik niet" (herstelbaar). **SCOPE blijft always-on** (veiligheidsblok: false-negative = uitgevoerde off-domein taak, niet herstelbaar).
- **Taal-regel naar één bron**: de trailing v0.5-regel "in dezelfde taal als de vraag — default Nederlands" verdwijnt; de taal-spiegeling leunt op de bestaande user-turn-injectie (`mirrorUserLanguage`) + één compacte regel. Geen dubbele taalregel.
- **Persona-stem (wij vs ik) gedefereerd** — dat zit in de *router*-prompt (`preProcessSystem`), een aparte laag buiten deze answer-streamline. Apart adresseren (aanbeveling: naar wij-vorm spiegelen voor één merkstem).

---

## 3. Doel-structuur (herordend)

**SYSTEM-PROMPT (volgorde van boven naar onder):**
1. **PERSONA/IDENTITEIT** — 1 alinea; `{{COMPANY}}`/`{{AUDIENCE}}`-tokens byte-identiek voor dev-org-reproduceerbaarheid.
2. **HARDE VEILIGHEIDSKERN op primacy** (compact, positief geframed): (a) antwoord alléén uit CONTEXT, verzin geen proza-feit; (b) TRUST-BOUNDARY: chat-history/user-beweringen zijn geen bron; (c) SCOPE: geen off-domein taken (code/vertalen/gedicht/wiskunde/huiswerk) — **always-on**; (d) WEIGER KORT EN SCHOON + carve-out "volledigheidsregels gelden alleen bij een beantwoordbare vraag".
3. **ANTWOORD-HOUDING** (positief): begin met het directe antwoord (ja/nee eerst), schrijf alsof je het zelf weet (geen meta-talk), behoud nuance/correctie/vervolgstap bij een beantwoordbare vraag, één wedervraag bij vaagheid.
4. **OPMAAK + STRUCTUUR samengevoegd** tot één leesbaarheidsblok (gedoseerd vet · bullets alleen bij 3+ parallelle items · kort = 1 paragraaf zonder opmaak) — **zonder eigen zinsaantal**.
5. **EMIT-CONTRACT** als laatste system-blok vóór STIJL (recency): alléén `<thinking>`/`<answer>`/`<confidence>` (de tags die `parseV03Output` leest). `CITATIES`-`[N]`-blok geschrapt. Confidence-tabel → één regel.
6. **STIJL-suffix** (`style.ts`, mechanisme ongewijzigd): toon + de **enige** numerieke lengte-autoriteit.

**USER-TURN** (`rag.ts:2241`, recency-sterkst): `sourceLinksIntro` [conditioneel] · `matchedSpanIntro` [conditioneel] · **geo-bridging** [conditioneel, gecomprimeerd] · `CONTEXT` · 1-regel **taal + grounding + trust-anker** direct vóór `VRAAG:` · `VRAAG:`.

---

## 4. Criteria waaraan de nieuwe prompt moet voldoen

**MUST (hard gate — falen = niet adopteren):**

| id | criterium | meetbare test |
|---|---|---|
| **C1** grounding-proza | "GEEN feiten buiten CONTEXT" blijft als losse regel | grep aanwezig + `out_of_corpus`-grounding-delta ≥ −0,10 vs baseline |
| **C2** trust-boundary | history/user-beweringen geen bron (1 kernzin + ≥1 voorbeeld mag) | injection/planted_fact geen regressie, 0 nieuwe violation-slug |
| **C3** scope-refusal | off-domein taken (vertalen/gedicht/wiskunde/huiswerk) blijven, **always-on** | blok noemt die 3+ expliciet; off-domein-cases 100% geweigerd |
| **C4** weiger-carve-out | WEIGER KORT EN SCHOON + carve-out "alleen bij beantwoordbare vraag" | beide aanwezig; out_of_corpus/injection/planted_fact-delta ≥ −0,10 |
| **C5** bridging-guardrail | fuzzy-regio + bedrijfsfeit NIET bridgen, volledig behouden | guardrail noemt ≥1 fuzzy-regio + bedrijfsfeit-uitsluiting; geo-bucket houdt Lelystad→ja én Randstad→geen-blanket-ja |
| **C6** citatie-resolutie | geen `[N]`-vs-bronlink-botsing | 0 `chunk N`-tooltips in ≥10 prod-antwoorden |
| **C7** één lengte-autoriteit | precies 1 numerieke lengtebron (STIJL-suffix) | grep zinsaantallen → exact 1 canonieke bron; medium-antwoordlengte stijgt niet |
| **C8** geen interne contradictie | geen tegengestelde imperatieven op dezelfde as zonder scheidende conditie | 0 tegengestelde-imperatief-paren; STIJL-medium herhaalt wedervraag-plicht niet zonder weiger-carve-out |
| **C15** append-only-versioning | landt als nieuwe versie, geen v0.X-snapshot gemuteerd; nieuwe `v3.1`-lengthmap i.p.v. `v3` muteren | git-diff: oude consts ongewijzigd; precies 1 wijzigings-as per versie |
| **C16** eval-reproduceerbaarheid | gevalideerd via `eval:run` met `v0:clear-cache`; safety-aggregaten ≤ baseline | must-not ≤ baseline (0 nieuwe slug), unsupported-hard-fact ≤ baseline, zero-correctness ≤ baseline |
| **C17** prompt-only-niet-pipeline | alleen prompt-tekst; alle GEDRAG-flags op baseline-waarden via spread | diff: 0 flag-waarde-wijzigingen |

**SHOULD:**
- **C9** token-budget — always-on kern meetbaar korter, richtwaarde −400–600 tok (vnl. geo conditioneel). Test: tiktoken/cl100k composed < baseline, reductie ≥ 400.
- **C10** positionering-recency — veiligheidskern in eerste ~30% + trust/grounding-anker in user-turn vóór VRAAG. Test: inspectie + injection/planted_fact geen regressie na herordening.
- **C11** positieve framing — dichte NOOIT/VERBODEN-clusters → "doe Y" (vooral anti-preamble), zonder een eval-getriggerde regel te schrappen. Test: aantal harde negaties daalt + over-refusal-rate stijgt niet.
- **C12** taal-spiegeling één bron — precies 1 taalregel; NL→NL, EN→EN, 0 mismatch in sample.
- **C18** emit-contract-eerlijkheid — prompt beschrijft alleen geparste tags; inerte CoT/citatie-steiger niet always-on. Test: elke tag heeft parser-counterpart; grounding daalt niet na trim (delta ≥ −0,10).

**NICE:**
- **C13** persona-stem consistent (gedefereerd — aparte router-laag).
- **C14** toon/opmaak consistent — opmaak-drempels op 1 plek, detailed-cases behouden structuur.

---

## 5. ⚠️ Open punt: in-place vs append-only

Je koos **"in-place op v0.9.3"**. Concrete consequentie die botst met je *eerste* keuze (RESTRUCTURE-PRESERVE, gekozen omdat het **eval-gevalideerd laag-risico** is):

> Het hele veiligheidsnet van deze aanpak is een eval-vergelijking **nieuwe-prompt vs v0.9.3-baseline**. Als je v0.9.3 *in-place* overschrijft, is er **geen baseline meer om tegen te vergelijken** — je kunt niet "v0.9.3-oud vs v0.9.3-nieuw" draaien. Dat breekt C15/C16 en de hele eval-gate, en muteert bovendien de versie die nu live op prod staat.

**Aanbeveling (zelfde eindresultaat voor jou):** bouw als **nieuwe append-only versie v0.9.4**, eval-gate die tegen v0.9.3, en als hij door de gate komt zet je `LATEST_BOT_VERSION = v0.9.4` → prod serveert dan de verbeterde prompt. Je krijgt de verbetering live én houdt de baseline + A/B-mogelijkheid. v0.9.3 blijft byte-identiek in de registry.

→ **Te bevestigen vóór de bouw:** echt v0.9.3 overschrijven, of v0.9.4-die-LATEST-wordt?

---

## 6. Eval-plan (per wijziging apart)

1. **Baseline vastleggen:** `npm run v0:clear-cache` → `npm run eval:run` op v0.9.3 (must-not-violations, unsupported-hard-fact, zero-correctness, per-bucket grounding). Cijfers vastleggen.
2. **Per-as versioning** (als append-only): v0.9.4 = niet-gedrag-kantelende dedup/dood-gewicht (`[N]`-schrap, "2-5 zinnen"-schrap, confidence-band-trim, OPMAAK/STRUCTUUR-merge, wedervraag-dedup); v0.9.5 = positie-wijzigingen (veiligheidskern→primacy, emit→recency, geo→conditioneel, user-turn-anker). Eén as per versie → een regressie is herleidbaar.
3. **Per versie:** `...V0_9_3` spread (alle GEDRAG-flags byte-identiek per C17), alleen `systemPrompt`/`outputStyleVersion` overschrijven; git-diff bevestigt 0 flag-wijzigingen.
4. **style.ts-discipline:** muteer de bestaande `v3`-lengthmap NIET — voeg `v3.1` toe en laat alleen de nieuwe versie ernaar wijzen.
5. **Elke versie eval-gated:** `v0:clear-cache` → `eval:run` op de twee nieuwste versies (kosten-discipline) → vergelijk tegen baseline. **Gate** om LATEST te verschuiven: must-not ≤ baseline (0 nieuwe slug), unsupported-hard-fact ≤ baseline, zero-correctness ≤ baseline, per-bucket grounding-delta ≥ −0,10.
6. **Gerichte bucket-checks:** `[N]`-schrap+CoT-trim → grounding/answer-quality daalt niet · SCOPE-positie → off-domein-cases 100% geweigerd · geo-conditioneel → v0.6-geografie-bucket (Lelystad→ja én Randstad→geen-blanket-ja) · lengte-dedup → medium-lengte stijgt niet · positie-herordening → injection/planted_fact/out_of_corpus geen regressie · positieve herframing → over-refusal-rate stijgt niet.
7. **Draai elke nieuwe metriek eerst op echte data** (geo-gate-regex op echte regio-queries; taal-anker op NL+EN-sample, 0 mismatch) — de under-refusal-meetfout uit de prod-gate-eval werd door een validatie-run gevangen, niet door unit-tests.

---

_Gegenereerd uit codebase-analyse + multi-agent workflow. Bron: `docs/BOTVERSIES_PROMPT_REFERENTIE.md`, `lib/v0/server/bots.ts`, `lib/v0/server/rag.ts`, `lib/v0/style.ts`, `lib/v0/server/persona.ts`._
