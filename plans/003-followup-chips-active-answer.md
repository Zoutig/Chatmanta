# Plan 003: Genereer follow-up-chips uit het antwoord dat de gebruiker écht ziet (activeAnswerText)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- lib/rag/run-rag-query.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

De RAG-engine kan een gegenereerd antwoord ná de eerste generatie deterministisch **vervangen** (hard-fact-refusal bij een ongefundeerd bedrag/persoon, off-domein-code-refusal, history-entity-adoptie, claim-regenerate). Die vervangingen muteren de variabele `activeAnswerText`. De follow-up-chips worden echter gegenereerd uit `finalAnswerText` — de tekst van vóór de vervanging. Resultaat: bij een anti-hallucinatie-refusal ("dat kan ik niet bevestigen…") toont de UI chips die zijn afgeleid van de zojuist wéggecensureerde hallucinatie, en die chips worden ook nog eens mee-gecachet. Dit ondergraaft de anti-hallucinatie-gate — een V1 hard rule. De fix is één argument wijzigen.

## Current state

- `lib/rag/run-rag-query.ts` — de gegradueerde streaming-engine (V0 én V1 draaien hierop).
- Regel ~2595: `activeAnswerText` wordt geïnitialiseerd op `finalAnswerText`; daarna muteren alle deterministische vervangingen (history-entity ~2622, hard-fact-refusal ~2674, claim-regenerate ~2737, off-domein-code ~2832) uitsluitend `activeAnswerText` en herbouwen ze `activeResponse` daaruit. `finalAnswerText` wordt na de post-cascade-sanitize (~2350) nooit meer herschreven.
- Regel 2882-2885 (de bug):

```ts
      const fu = await Promise.race([
        generateFollowUps(original, finalAnswerText, bot),
        timeoutSignal,
      ]);
```

- Regel 2921-2932: de cache-write bouwt `cachedResponse` uit `activeResponse` (de gecorrigeerde tekst) en plakt daar de `followUps` op — dus elke cache-hit serveert refusal-tekst mét chips uit de oude tekst.
- Contextcomment op 2846-2847 bevestigt de intentie: "gebruiker ziet antwoord al, followups verschijnen kort daarna" — de bedoelde bron is wat de gebruiker ziet, en dat is `activeAnswerText`.
- Versie-scoping: op `adaptiveRag`-bots met `shouldGenerateFollowupsInline=false` wordt de inline-followups-branch geskipt (regel 2857-2869); de bug manifesteert op bots/paden waar `generateFollowUps` wél inline draait (de `else if` op 2870).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Unit-tests| `npm run test:unit` | alle groen          |

## Scope

**In scope**:
- `lib/rag/run-rag-query.ts` — uitsluitend het `generateFollowUps`-callsite-argument (regel ~2883)

**Out of scope** (NIET aanraken):
- De `generateFollowUps`-functie zelf (~regel 616) — de prompt-opbouw blijft ongewijzigd
- De cache-write-logica (2921-2943)
- Alles rond `finalAnswerText` elders in de pipeline — die variabele blijft bestaan voor telemetrie/vergelijk
- `lib/v0/server/bots.ts` — bot-versies blijven ongemoeid (append-only conventie)

## Git workflow

- Branch: `git checkout -b feat/seb/followups-active-answer`
- Commit: `fix(rag): follow-up-chips uit activeAnswerText i.p.v. het vervangen finalAnswerText`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Wijzig het argument

In `lib/rag/run-rag-query.ts` regel ~2883: vervang

```ts
        generateFollowUps(original, finalAnswerText, bot),
```

door

```ts
        generateFollowUps(original, activeAnswerText, bot),
```

`activeAnswerText` is op dat punt al in scope (gedeclareerd ~2595, `let`).

**Verify**: `grep -n "generateFollowUps(original" lib/rag/run-rag-query.ts` → precies één hit, met `activeAnswerText`.

### Step 2: Typecheck + unit-tests

**Verify**: `npm run typecheck` exit 0; `npm run test:unit` groen.

## Test plan

Er bestaat geen gedragstest op dit pad (bekende dekkingslacune, zie plans/README backlog "tests-04"). Een deterministische unit-test zou de hele engine moeten stubben — buiten proportie voor een één-argument-fix. Verificatie = typecheck + grep + code-review van de diff. Optioneel (alleen na akkoord operator, billable ~centen): `npm run v0:chat` met een vraag die een hard-fact-refusal triggert en visueel checken dat de chips bij de refusal-tekst passen.

## Done criteria

- [ ] Regel ~2883 gebruikt `activeAnswerText`
- [ ] `npm run typecheck` exit 0; `npm run test:unit` groen
- [ ] `git diff --stat` → alléén `lib/rag/run-rag-query.ts`, 1 regel gewijzigd
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- De code rond regel 2883 komt niet overeen met het excerpt hierboven (drift).
- `activeAnswerText` blijkt op het callsite-punt niet in scope (dan is de engine gerefactord — rapporteer).
- Typecheck of een bestaande test faalt na de wijziging.

## Maintenance notes

- Als de engine ooit gesplitst wordt (backlog "techdebt-05"), hoort de followups-fase de definitieve antwoordtekst als expliciete parameter te krijgen zodat dit type verwisseling structureel onmogelijk wordt.
- Reviewer-aandachtspunt: bevestig dat er geen tweede `generateFollowUps`-callsite bestaat (er is er maar één inline; de UI kan een aparte sync-call doen, maar die leeft buiten dit bestand).
