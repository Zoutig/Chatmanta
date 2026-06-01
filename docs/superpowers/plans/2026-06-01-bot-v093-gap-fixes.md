# Bot v0.9.3 — gap-fixes (taal + grounding) — condensed plan

> Voortkomend uit de Productie-gate-eval (Lagen 0-4). De eval MEET; deze PR
> REPAREERT de gevonden gaps als één nieuwe append-only versie **v0.9.3**.
> Besloten met Sebastiaan 2026-06-01: bundel taal + grounding in v0.9.3,
> nieuwe zichtbare worktree `chatmanta-bot-fixes`.

## Gevonden gaps (uit de eval) en hun status in de nieuwste bot (v0.9.2)

| Gap | Bron | Status v0.9.2 | Actie |
|-----|------|---------------|-------|
| EN-vraag → NL-antwoord | Laag 4 (language) | ❌ aanwezig | **fix: taal-blok** |
| €295-spoedtoeslag-fabricatie | Laag 0 (no-fabricated-specifics) | ⚠️ structureel mogelijk (zelfde gate+prompt als v0.9.1) | **meten → evt. grounding-scope** |
| v0.9 "bel 112" weggefilterd | Laag 1 / hard-eval | ✅ al gefixt in v0.9.1 (`hardFactRefusalSafetyAware`) | alleen regressie-bewaken |
| v0.9 over-refusal declaratie | Laag 1 (refusal-calibratie) | ✅ niet meer in v0.9.2 (confirm-run: `kind=answer`) | geen |

## Root causes (investigatie 2026-06-01)

**Taal.** De enige taal-regel staat midden in `V0_5.systemPrompt` (`bots.ts:729`,
"Antwoord in dezelfde taal als de vraag — default Nederlands") met daarná nog
volledig Nederlandse blokken (v0.9.1-scope, STIJL-suffix) + NL `CONTEXT:`/`VRAAG:`-
labels + NL-bronnen. Geen taaldetectie. `gpt-4o-mini` @temp 0.4 volgt het dominante
NL-signaal. → te zwakke, te vroeg geplaatste instructie.

**€295.** De LLM verzint een spoedtoeslag (corpus heeft alleen uurtarieven
€79/€115/€165 + "minimumprijs 2 uur", `acme-corp/14-spoedreparatie-lekkages.md`).
De hard-fact-gate (`hard-facts.ts:255 hardFactsSupportedBySources`) hoort dat te
strippen, maar bouwt één geünificeerde source-fact-set over **álle** chunks — en
"295" staat toevallig als echt geld-bedrag in een ongerelateerde chunk (Spaanse
leien €245–€295/m², `08-hellende-daken-leien.md:49`). Cross-**topic** collisie →
gate denkt "gegrond". Bovendien vuurt de weiger-gate alleen op weak/medium
retrieval (`shouldDeterministicallyRefuseHardFact`, `hard-facts.ts:483`).

## Fix 1 — taal-spiegeling (KLAAR + GEVALIDEERD)

**Tweetraps, want prompt-only werkt NIET.** Eerst geprobeerd: `V0_9_3_LANGUAGE_BLOCK`
aan het eind van `systemPrompt`. Een confirm-run bewees dat dit FAALT — gpt-4o-mini
antwoordde de Engelse garantie-vraag nog steeds volledig in het Nederlands. Oorzaak:
`buildSystemPrompt` plakt de Nederlandse `STIJL:`-suffix ERNA → recency wint, en de
hele prompt + chunks zijn NL. (Durable les opnieuw: valideer op echte data.)

**Werkende lever = user-turn directive.** Nieuwe flag `mirrorUserLanguage` (op
v0.9.3): de answer-pipeline (`rag.ts`) detecteert de vraagtaal via `detectLanguage`
(hergebruikt uit `hard-eval-checks.ts` zodat fix + eval-check exact dezelfde
taalnotie delen) en injecteert bij een Engelse vraag een expliciete "answer in
English"-directive AAN HET EIND van de user-turn (ná de vraag, hoogste salience).
Het systeem-prompt-blok blijft als zachte reinforcement. Inert voor NL/mixed-NL +
oudere versies → byte-identiek. `LATEST_BOT_VERSION = v0.9.3`.

Files: `lib/v0/server/bots.ts` (flag + blok + V0_9_3 + registry + ordered + LATEST),
`lib/v0/server/rag.ts` (import `detectLanguage` + user-turn directive),
`scripts/test-bot-defaults.ts` (append-only invarianten + `mirrorUserLanguage`).

## Fix 2 — grounding-scope (GEMETEN op v0.9.2 → DESCOPED uit v0.9.3, aanbeveling)

**Meting (confirm-run v0.9.2, 2026-06-01, run 20260601-121216):** op
`aoc-acme-spoedtoeslag-01` antwoordde v0.9.2:
> "Het spijt me, maar ik kan geen informatie vinden over een specifieke
> spoedtoeslag voor dakreparaties in de beschikbare bronnen. Voor meer
> informatie … neem direct contact op …"

→ **correcte weigering/doorverwijzing, GEEN verzonnen bedrag.** De €295-
fabricatie (gezien op v0.9.1 in de Laag-0-run) **reproduceert niet op v0.9.2**.
De prompt-anti-hallucinatie vangt deze vraag al af; de deterministische gate is
slechts een backstop die hier niet eens hoefde te vuren.

**Conclusie:** de cross-topic grounding-blinde-vlek (€295 ≈ leien-prijs) bestaat
structureel nog in `hardFactsSupportedBySources`, maar is **intermittent** (LLM-
fabricatie @temp 0.4) en treft de nieuwste bot in deze run niet. Een claim-scoped
grounding-refactor raakt het fijn gebalanceerde refusal-pad (over-refusal-risico,
zie de zorgvuldig opgebouwde `hardFactRefusalSafetyAware` + strong-retrieval-
sparing) en is dus een **risicovolle ingreep voor een niet-reproducerende bug**.

**Aanbeveling:** grounding-fix NIET bundelen in v0.9.3. v0.9.3 = **taal-only**.
Blinde vlek → follow-up: eerst een multi-run (self-consistency) op de spoedtoeslag-
case meten hoe vaak de fabricatie écht optreedt; alleen bij meetbare frequentie de
claim-scoped grounding (`bestChunkId`, `claims.ts:237`) bouwen + apart valideren
tegen spoedtoeslag ÉN 112 + declaratie (geen over-refusal). Beslissing aan Sebastiaan.

## Validatie (GEDAAN)

- `npx tsx scripts/test-bot-defaults.ts` — append-only invarianten + `mirrorUserLanguage` (groen).
- `npm ci` + `npm run typecheck` — clean (0 errors).
- **Confirm-run v0.9.2** (`--versions=v0.9.2`, $0,18): EN→NL bevestigd (2 lang-cases
  FAIL); €295 reproduceert NIET (bot weigert netjes); 112/declaratie OK (kind=answer).
- **Confirm-run v0.9.3-blok** ($0,18): prompt-blok alleen FAALT (EN nog steeds NL).
- **Gerichte probe v0.9.3 + user-turn directive** (~$0,012): 4/4 — beide EN-cases
  → Engels (gegrond vertaald: "10 years warranty … up to 20 years"), mixed-NL +
  pure-NL controls → Nederlands (onaangeraakt).
- **$0 detectLanguage-sweep** over alle 59 fixture-vragen: alleen de 2 EN-cases
  detecteren als 'en' → de directive vuurt op precies die twee; injection/gibberish
  = 'unknown' (vuurt niet), alle NL-vragen = 'nl'. Geen NL-misfire.
- De directive is per constructie inert voor de 57 niet-EN cases (lege directive)
  → geen regressie buiten taal; een volledige her-run is daarmee redundant.

## Totale eval-kosten

~$0,37 bot-gen (v0.9.2-run $0,18 + v0.9.3-blok-run $0,18 + probe $0,012); judge $0
(in-sessie). Binnen het ~$2 project-budget.

## Scope-grens

Geen migratie, geen datamodel/security/widget-API. Alleen append-only bot-versie.
De eval-fixtures/checks blijven ongewijzigd (al op main via Lagen 0-4).
