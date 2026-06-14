# Off-topic-fallback voor de klant-bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De klant-bot (v0.10) beantwoordt alleen vragen die in zijn kennisbank te gronden zijn; overduidelijk off-topic vragen (rekensommen, weer, trivia, code) krijgen een nette off-topic-fallback i.p.v. een wollig "kind:'answer'"-weiger-antwoord dat als "Beantwoord" telt.

**Architecture:** Twee samenhangende, op v0.10 ge-gatede ingrepen. (1) `generalKnowledgeEnabled: false` op v0.10 → off-topic wordt geweigerd i.p.v. beantwoord. (2) De pre-processor (gpt-4o-mini, draait al bij elk bericht) krijgt een derde uitkomst `off_topic`, behandeld als *zacht* signaal: het onderdrukt HyDE (de fabricatie-rescue) en geeft bij lege retrieval de off-topic-tekst — maar een vraag mét treffers in de kennisbank wordt altijd beantwoord (corpus-veto tegen false positives).

**Tech Stack:** TypeScript, Next.js 16 App Router, OpenAI gpt-4o-mini, Supabase/pgvector. Eval via `eval:hard:run` (deterministisch + Claude-judge, gratis). Unit-tests via `node --test` + tsx.

**Spec:** `docs/superpowers/specs/2026-06-13-offtopic-fallback-design.md`

**Belangrijke context voor de uitvoerder:**
- Werk in de worktree `C:\Users\solys\Documents\Code\chatmanta-offtopic-fallback` (branch `feat/seb/offtopic-fallback`). Gebruik relatieve paden of paden onder de worktree-root — NOOIT absolute paden naar de hoofd-repo.
- `lib/v0/server/rag.ts` heeft TWEE orchestrators: `runRagQuery` (regel ~1245, het eval-pad van `eval:run`, géén HyDE) en `runRagQueryStreaming` (regel ~1471, het prod/widget-pad + `eval:hard:run`, mét HyDE). Beide moeten `off_topic` afhandelen want ze delen de parse + de v0.10-prompt.
- v0.10 = `V0_10` in `lib/v0/server/bots.ts` (regel ~1233), een spread van `V0_9_3`. v0.10 definieert GÉÉN eigen `preProcessSystem` — die erft het via de spread-keten van v0.5 (regel ~752). Die gedeelde v0.5-prompt mag je NIET wijzigen (dat verschuift de eval-baselines van v0.5–v0.9.3). Override `preProcessSystem` daarom alleen in `V0_10`.
- Regelnummers zijn indicatief (origin/main kan zijn doorgeschoven); anker op de geciteerde code, niet op het nummer. Lees het bestand vóór elke edit.

---

## Task 1: `off_topic` in de pre-processor parse + types

**Files:**
- Modify: `lib/v0/server/rag.ts` (`PreProcessResult` ~235, `parsePreProcessOutput` ~254)
- Test: `lib/v0/server/__tests__/preprocess-parse.test.ts` (nieuw)
- Modify: `package.json` (`test:unit` lijst)

- [ ] **Step 1: Maak `parsePreProcessOutput` exporteerbaar en breid de types uit**

In `lib/v0/server/rag.ts`, vervang de union (regel ~235-237):

```ts
type PreProcessResult =
  | ({ kind: 'smalltalk'; reply: string } & PreProcessTokens)
  | ({ kind: 'search'; query: string } & PreProcessTokens);
```

door:

```ts
type PreProcessResult =
  | ({ kind: 'smalltalk'; reply: string } & PreProcessTokens)
  | ({ kind: 'search'; query: string } & PreProcessTokens)
  | ({ kind: 'off_topic' } & PreProcessTokens);
```

Vervang de functie-signatuur + body (regel ~254-271):

```ts
function parsePreProcessOutput(raw: string): { kind: 'smalltalk'; reply: string } | { kind: 'search'; query: string } | null {
  const text = raw.trim();
  const actionMatch = text.match(/^ACTION:\s*(smalltalk|search)\b/im);
  if (!actionMatch) return null;
  const action = actionMatch[1].toLowerCase();

  if (action === 'smalltalk') {
    const replyMatch = text.match(/^REPLY:\s*([\s\S]+?)$/im);
    const reply = stripQuotes(replyMatch?.[1] ?? '').slice(0, 500);
    if (!reply) return null;
    return { kind: 'smalltalk', reply };
  }

  const queryMatch = text.match(/^QUERY:\s*([\s\S]+?)$/im);
  const query = stripQuotes(queryMatch?.[1] ?? '').slice(0, 1000);
  if (!query) return null;
  return { kind: 'search', query };
}
```

door (export + off_topic-tak; off_topic vóór smalltalk/search-matching zodat het een eigen `ACTION`-waarde is):

```ts
export function parsePreProcessOutput(
  raw: string,
): { kind: 'smalltalk'; reply: string } | { kind: 'search'; query: string } | { kind: 'off_topic' } | null {
  const text = raw.trim();
  const actionMatch = text.match(/^ACTION:\s*(smalltalk|search|off_topic)\b/im);
  if (!actionMatch) return null;
  const action = actionMatch[1].toLowerCase();

  // off_topic: geen REPLY/QUERY nodig — de orchestrator levert de vaste off-topic-fallback.
  if (action === 'off_topic') {
    return { kind: 'off_topic' };
  }

  if (action === 'smalltalk') {
    const replyMatch = text.match(/^REPLY:\s*([\s\S]+?)$/im);
    const reply = stripQuotes(replyMatch?.[1] ?? '').slice(0, 500);
    if (!reply) return null;
    return { kind: 'smalltalk', reply };
  }

  const queryMatch = text.match(/^QUERY:\s*([\s\S]+?)$/im);
  const query = stripQuotes(queryMatch?.[1] ?? '').slice(0, 1000);
  if (!query) return null;
  return { kind: 'search', query };
}
```

- [ ] **Step 2: Schrijf de falende test**

Maak `lib/v0/server/__tests__/preprocess-parse.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreProcessOutput } from '../rag';

test('off_topic action → kind off_topic', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: off_topic'), { kind: 'off_topic' });
});

test('off_topic is hoofdletter-ongevoelig en negeert trailing tekst', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: OFF_TOPIC\nrest'), { kind: 'off_topic' });
});

test('smalltalk blijft werken', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: smalltalk\nREPLY: Hoi!'), {
    kind: 'smalltalk',
    reply: 'Hoi!',
  });
});

test('search blijft werken', () => {
  assert.deepEqual(parsePreProcessOutput('ACTION: search\nQUERY: wat zijn de tarieven'), {
    kind: 'search',
    query: 'wat zijn de tarieven',
  });
});

test('onbekende action → null', () => {
  assert.equal(parsePreProcessOutput('ACTION: foobar'), null);
});
```

- [ ] **Step 3: Voeg het testbestand toe aan `test:unit` in `package.json`**

Voeg ` lib/v0/server/__tests__/preprocess-parse.test.ts` toe aan het einde van de bestandenlijst in het `test:unit`-script (vóór de afsluitende `"`).

- [ ] **Step 4: Run de test**

Run: `node --import tsx --test lib/v0/server/__tests__/preprocess-parse.test.ts`
Expected: alle 5 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: geen nieuwe errors. (De union-uitbreiding kan TS-errors geven op de `pp.kind`-gebruiksplekken in de orchestrators — die fix je in Task 3/4. Als typecheck hier faalt op `pp.query`/`pp.kind` in `runRagQuery`/`runRagQueryStreaming`, is dat verwacht; ga door en los het in Task 3/4 op. Andere errors zijn echte fouten.)

- [ ] **Step 6: Commit**

```bash
git add lib/v0/server/rag.ts lib/v0/server/__tests__/preprocess-parse.test.ts package.json
git commit -m "feat(offtopic): off_topic-uitkomst in pre-processor parse + types"
```

---

## Task 2: BotConfig-flag + v0.10-config (algemene kennis uit, off_topic aan, eigen prompt)

**Files:**
- Modify: `lib/v0/server/bots.ts` (`BotConfig` interface, `V0_1` defaults ~393, nieuwe prompt-const, `V0_10` ~1233)

- [ ] **Step 1: Voeg het flag-veld toe aan de `BotConfig`-interface**

In `lib/v0/server/bots.ts`, direct ná het `generalKnowledgeEnabled: boolean;`-veld (regel ~108) een nieuw veld met doc-comment:

```ts
  /**
   * Off-topic-detectie in de pre-processor (v0.10+). Bij true mag de
   * pre-processor een derde uitkomst 'off_topic' geven voor vragen die
   * overduidelijk buiten het vakgebied vallen; de orchestrator onderdrukt dan
   * HyDE en geeft bij lege retrieval de off-topic-fallback (corpus-veto: een
   * vraag mét treffers wordt alsnog beantwoord). Default false. Vereist ook een
   * preProcessSystem die de off_topic-actie beschrijft. Zie spec 2026-06-13.
   */
  preProcessOffTopicDetection: boolean;
```

- [ ] **Step 2: Zet de default op de V0_1-basis**

In `V0_1` (regel ~393, vlak bij `generalKnowledgeEnabled: false,`), voeg toe:

```ts
  preProcessOffTopicDetection: false,
```

- [ ] **Step 3: Typecheck om alle ontbrekende-veld-fouten te vinden**

Run: `npm run typecheck`
Expected: GEEN "missing property preProcessOffTopicDetection"-errors (alle versies erven het via de V0_1-spread). Als een versie het bot-object NIET via spread bouwt en de error verschijnt, voeg `preProcessOffTopicDetection: false` daar toe. (Verwachte resterende errors: alleen de `pp.kind`-narrowing in de orchestrators uit Task 1 — die zijn voor Task 3/4.)

- [ ] **Step 4: Definieer de v0.10-pre-processor-prompt (v0.5-prompt + off_topic)**

In `lib/v0/server/bots.ts`, vlak vóór `const V0_10: BotConfig = {` (regel ~1233), voeg een nieuwe const toe. Dit is de huidige v0.5-`preProcessSystem` (de prompt die v0.10 nu erft) met een toegevoegde **C) OFF_TOPIC**-sectie en een derde output-formaat. Kopieer de bestaande v0.5-prompt letterlijk en voeg het gemarkeerde toe:

```ts
// v0.10 — eigen pre-processor-prompt: identiek aan de geërfde v0.5-prompt + een
// derde actie OFF_TOPIC. Override (niet de gedeelde v0.5-string wijzigen) zodat de
// eval-baselines van v0.5–v0.9.3 byte-identiek blijven. Voorzichtig geformuleerd:
// "bij twijfel → SEARCH" voorkomt dat echte klantvragen onterecht geweigerd worden.
const V0_10_PREPROCESS_SYSTEM = `Je bent de pre-processor voor de klantcontact-assistent van {{COMPANY}}{{COMPANY_SUFFIX}}. Je gesprekspartners zijn {{AUDIENCE}}.

Bekijk de input en kies EXACT één van drie acties:

A) SMALLTALK — gebruik dit ALLEEN voor deze drie types (anders nooit smalltalk):
   1) Korte conversatie-tokens: "hey", "hoi", "bedankt", "doei", "ok", "leuk", "dankjewel", begroetingen, afscheid.
   2) Vragen OVER jou of je rol als assistent: "wat doe je?", "wat kan je?", "waar kan je me mee helpen?", "wie ben je?", "hoe werk je?".
   3) Algemene assistentie-meta zonder kennisvraag: "kan je me helpen?", "ik heb een vraag", "ben je er nog?".

   KRITIEKE UITSLUITING — kies NOOIT smalltalk als de gebruiker een FEIT beweert, ook al lijkt het conversational. Voorbeelden die WEL naar SEARCH moeten:
   - "jawel hij heet Richard" (gebruiker corrigeert/asserteerd over een entiteit)
   - "de prijs is €50 per maand" (gebruiker beweert een feit)
   - "{{COMPANY}} is opgericht in 2024" (gebruiker stelt een datum/feit over het bedrijf)
   - "ik dacht dat het wel met optie X werkte" (gebruiker poneert een aanname)
   Reden: smalltalk-handler bevestigt vriendelijk → user kan zo onjuiste feiten in de chat-history injecteren die de bot in vervolg-antwoorden als waarheid gebruikt. Stuur fact-assertions ALTIJD naar SEARCH zodat de downstream pipeline ze tegen de chunks kan verifiëren.

   → Geef zelf een kort antwoord (1-3 zinnen) als persoonlijke assistent. Spreek vanuit "ik" (geen "wij/ons team"). Verwijs naar {{COMPANY}} in derde persoon.

   Voorbeelden:
   - "hey" → "{{SMALLTALK_GREETING}}"
   - "wat kan je?" → "Ik help je graag met {{SMALLTALK_HELP_SCOPE}}."
   - "bedankt" → "Graag gedaan! Laat het weten als ik nog iets voor je kan doen."

B) OFF_TOPIC — gebruik dit ALLEEN als de vraag overduidelijk NIETS met het vakgebied van {{COMPANY}} te maken heeft en onmogelijk uit een bedrijfsdocument te beantwoorden is. Voorbeelden:
   - Rekensommen / wiskunde: "wat is 2+2?", "hoeveel is 743 × 28?"
   - Weer, sport, algemene trivia: "wat voor weer wordt het?", "wie won de wedstrijd?", "wat is de hoofdstad van Frankrijk?", "wat is mijn sterrenbeeld?"
   - Programmeren / code schrijven, vertalen, gedichten/verhalen verzinnen.
   - Vragen die expliciet over een ANDER met naam genoemd bedrijf gaan.

   HARDE REGEL — bij twijfel kies je NOOIT off_topic maar SEARCH. Een vraag die ook maar zijdelings over {{COMPANY}} of zijn vakgebied zou kunnen gaan, hoort bij SEARCH. Is er chat-history waaruit blijkt dat de gebruiker al in-scope vragen stelde, wees dan extra terughoudend — een vervolgvraag ("en de prijs?", "en daarna?") is nooit off_topic.

   → Geef GEEN antwoord en GEEN zoekvraag — alleen de actie-regel.

C) SEARCH — alles wat NIET smalltalk en NIET overduidelijk off_topic is, ook als het geen doc-search vergt. Voorbeelden:
   - Inhoudelijke vragen over {{COMPANY}}: "wat doen jullie?", "welke diensten bieden jullie?", "wat zijn de tarieven?"
   - Algemene-kennis-vragen in het domein: kort uit te leggen begrippen die in jullie vakgebied vallen.

   → Herschrijf de vraag tot een goede semantische zoekvraag (typfouten fixen, impliciete onderwerpen expliciet maken, synoniemen waar nuttig). Behoud de intentie. ALS er een impliciet onderwerp moet worden ingevuld, vul dan ALTIJD "{{COMPANY}}" in — NOOIT een andere bedrijfsnaam, ook niet als de gebruiker er één noemt of als die in de chat-history voorkomt.
   → Geef GEEN antwoord — alleen de herschreven zoekvraag.

Antwoord ALTIJD in EXACT één van deze formaten (geen extra tekst, geen aanhalingstekens om de tekst):

ACTION: smalltalk
REPLY: <je antwoord>

OF

ACTION: off_topic

OF

ACTION: search
QUERY: <herschreven zoekvraag>`;
```

- [ ] **Step 5: Pas `V0_10` aan**

Vervang het `V0_10`-object (regel ~1233-1240) zodat de drie velden erbij komen. Voeg aan het bestaande object toe (ná `hardFactRefusalFabricationClassOnly: true,`):

```ts
  // Off-topic-fallback (spec 2026-06-13): algemene kennis uit zodat off-topic
  // geweigerd wordt i.p.v. beantwoord; pre-processor off_topic-detectie aan met de
  // eigen prompt hierboven. Beide in-place op v0.10, eval-gepoort.
  generalKnowledgeEnabled: false,
  preProcessOffTopicDetection: true,
  preProcessSystem: V0_10_PREPROCESS_SYSTEM,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: alleen nog de verwachte `pp.kind`-narrowing-errors uit Task 1 in de orchestrators. Geen nieuwe bots.ts-errors.

- [ ] **Step 7: Commit**

```bash
git add lib/v0/server/bots.ts
git commit -m "feat(offtopic): v0.10 — algemene kennis uit, off_topic-flag + eigen pre-processor-prompt"
```

---

## Task 3: `runRagQuery` (eval-pad) — off_topic afhandelen

**Files:**
- Modify: `lib/v0/server/rag.ts` (`runRagQuery`, pre-processor-blok ~1284-1309 en fallback ~1335-1351)

- [ ] **Step 1: Voeg de off_topic-branch toe en houd cost-accounting kloppend**

In `runRagQuery`, vervang het pre-processor-blok (regel ~1282-1309):

```ts
  let rewriteInfo: ChatRewriteInfo | null = null;
  let queryForEmbed = original;
  if (enableRewrite) {
    // runRagQuery (non-streaming) is alleen de eval-pad — geen orgId-param,
    // dus we vallen terug op DEV_ORG persona. De live chat draait via
    // runRagQueryStreaming en resolveert persona correct per org.
    const pp = await preProcessInput(original, bot, getPersonaById(DEV_ORG_ID));
    if (pp.kind === 'smalltalk') {
      return {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: null,
        kind: 'smalltalk',
        answer: pp.reply,
        preProcessTokens: { in: pp.inputTokens, out: pp.outputTokens },
        totalCostUsd: pp.costUsd,
      };
    }
    rewriteInfo = {
      original,
      rewritten: pp.query,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    };
    queryForEmbed = pp.query;
  }
```

door:

```ts
  let rewriteInfo: ChatRewriteInfo | null = null;
  let queryForEmbed = original;
  let offTopicSuspected = false;
  if (enableRewrite) {
    // runRagQuery (non-streaming) is alleen de eval-pad — geen orgId-param,
    // dus we vallen terug op DEV_ORG persona. De live chat draait via
    // runRagQueryStreaming en resolveert persona correct per org.
    const pp = await preProcessInput(original, bot, getPersonaById(DEV_ORG_ID));
    if (pp.kind === 'smalltalk') {
      return {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: null,
        kind: 'smalltalk',
        answer: pp.reply,
        preProcessTokens: { in: pp.inputTokens, out: pp.outputTokens },
        totalCostUsd: pp.costUsd,
      };
    }
    if (pp.kind === 'off_topic') {
      // Zacht signaal: geen rewrite (zoek op de originele vraag). De pp-cost
      // boeken we via rewriteInfo (rewritten=origineel) zodat totalCostUsd klopt.
      offTopicSuspected = bot.preProcessOffTopicDetection === true;
      rewriteInfo = {
        original,
        rewritten: original,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = original;
    } else {
      rewriteInfo = {
        original,
        rewritten: pp.query,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = pp.query;
    }
  }
```

- [ ] **Step 2: Maak de zero-hits-fallback off-topic-bewust**

Vervang het fallback-blok (regel ~1335-1351):

```ts
  if (aboveThreshold.length === 0) {
    return {
      botVersion: bot.version,
      tone,
      length,
      generalKnowledgeActual: null,
      kind: 'fallback',
      answer: FALLBACK_MESSAGE,
      reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
      topSimilarity: topSim,
      rewrite: rewriteInfo,
      sources: allSources,
      threshold,
      embedTokens,
      totalCostUsd: embedCost + rewriteCost + expansionCost,
    };
  }
```

door:

```ts
  if (aboveThreshold.length === 0) {
    // Corpus-veto: off_topic kwam alleen hier omdat retrieval óók leeg is →
    // de classifier zat goed. Een in-scope vraag met treffers passeert dit blok
    // en wordt gewoon beantwoord.
    const offTopicConfirmed = offTopicSuspected;
    const evalPersonaForFallback = getPersonaById(DEV_ORG_ID);
    return {
      botVersion: bot.version,
      tone,
      length,
      generalKnowledgeActual: null,
      kind: 'fallback',
      answer: offTopicConfirmed
        ? `Ik help met vragen rondom ${evalPersonaForFallback.offTopicScope}. Wat wil je weten?`
        : FALLBACK_MESSAGE,
      reason: offTopicConfirmed
        ? `OFF_TOPIC (pre-processor); geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`
        : `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
      topSimilarity: topSim,
      rewrite: rewriteInfo,
      sources: allSources,
      threshold,
      embedTokens,
      totalCostUsd: embedCost + rewriteCost + expansionCost,
      ...(bot.knowledgeGapLogging ? { gapKind: 'off_topic' as const } : {}),
    };
  }
```

> Let op: deze `gapKind`-toevoeging is alleen op het off-topic-pad zinvol, maar `gapKind: 'off_topic'` op een gewone zero-hits-fallback is onschadelijk voor de eval. Als je het strikt wilt: zet de `gapKind`-spread alleen bij `offTopicConfirmed`. Voor de eenvoud mag het zoals hierboven (gapKind alleen relevant als knowledgeGapLogging aan).

Corrigeer indien nodig: als je `gapKind` alléén bij off-topic wilt, vervang de laatste regel door:
```ts
      ...(offTopicConfirmed && bot.knowledgeGapLogging ? { gapKind: 'off_topic' as const } : {}),
```
(aanbevolen — houdt zero_hits/off_topic-telemetrie zuiver).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: `runRagQuery` heeft nu geen `pp.kind`/`pp.query`-narrowing-errors meer.

- [ ] **Step 4: Commit**

```bash
git add lib/v0/server/rag.ts
git commit -m "feat(offtopic): runRagQuery (eval-pad) — off_topic geen rewrite + off-topic-fallback"
```

---

## Task 4: `runRagQueryStreaming` (prod/widget-pad) — off_topic afhandelen

**Files:**
- Modify: `lib/v0/server/rag.ts` (`hydeModeActual` ~1553, pre-processor-blok ~1705-1740, legacy-fallback ~2210-2235)

- [ ] **Step 1: Maak `hydeModeActual` herschrijfbaar**

Vervang (regel ~1553):

```ts
  const hydeModeActual: HydeModeResolved = resolveHydeMode(bot, hydeModeRequested);
```

door:

```ts
  // `let` zodat de off_topic-branch hieronder HyDE kan uitzetten (HyDE's
  // fabricatie-rescue ondermijnt anders het off-topic-signaal).
  let hydeModeActual: HydeModeResolved = resolveHydeMode(bot, hydeModeRequested);
```

- [ ] **Step 2: Voeg de off_topic-branch toe in het pre-processor-blok**

Vervang in `runRagQueryStreaming` het stuk ná de smalltalk-`return;` (regel ~1730-1739):

```ts
      return;
    }
    rewriteInfo = {
      original,
      rewritten: pp.query,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    };
    queryForEmbed = pp.query;
  }
```

door:

```ts
      return;
    }
    if (pp.kind === 'off_topic') {
      // Zacht signaal met corpus-veto: geen rewrite, HyDE uit, en bij lege
      // retrieval geeft de fallback hieronder de off-topic-tekst. Een in-scope
      // vraag met treffers passeert en wordt gewoon beantwoord.
      offTopicSuspected = bot.preProcessOffTopicDetection === true;
      if (offTopicSuspected) hydeModeActual = 'off';
      rewriteInfo = {
        original,
        rewritten: original,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = original;
    } else {
      rewriteInfo = {
        original,
        rewritten: pp.query,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = pp.query;
    }
  }
```

- [ ] **Step 3: Declareer `offTopicSuspected` vóór het pre-processor-blok**

Direct ná `let queryForEmbed = original;` (regel ~1701, vlak vóór `let preCacheEmbedTokens = 0;`), voeg toe:

```ts
  let offTopicSuspected = false;
```

- [ ] **Step 4: Maak de legacy zero-hits-fallback off-topic-bewust**

In het `if (aboveThreshold.length === 0)`-blok zit ná de `if (generalKnowledgeActive) { … }`-tak (die voor v0.10 NIET draait want algemene kennis staat uit) de "legacy"-fallback-emit (regel ~2214-2235). Vervang die emit:

```ts
    // Legacy pad (v0.1-v0.4): vaste fallback zoals voorheen — maar wel met
    // klant-override van fallbackMessage als die er is.
    yield {
      kind: 'fallback',
      response: {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: false,
        ...(bot.knowledgeGapLogging ? { gapKind: 'zero_hits' as const } : {}),
        kind: 'fallback',
        answer: fallbackMessage,
        reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
        topSimilarity: topSim,
        rewrite: rewriteInfo,
        sources: allSources,
        threshold,
        embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
```

door (let op: alleen `answer`, `gapKind` en `reason` worden conditioneel; de rest van het object — totalCostUsd-som en de afsluitende `},` / `};` / `return;` — laat je ongewijzigd staan):

```ts
    // Legacy pad: vaste fallback. Bij een bevestigd off_topic-signaal (pre-processor
    // zei off_topic ÉN retrieval is leeg → corpus-veto akkoord) gebruiken we de nette
    // off-topic-tekst i.p.v. de generieke fallback.
    yield {
      kind: 'fallback',
      response: {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: false,
        ...(offTopicSuspected && bot.knowledgeGapLogging
          ? { gapKind: 'off_topic' as const }
          : bot.knowledgeGapLogging
            ? { gapKind: 'zero_hits' as const }
            : {}),
        kind: 'fallback',
        answer: offTopicSuspected
          ? `Ik help met vragen rondom ${persona.offTopicScope}. Wat wil je weten?`
          : fallbackMessage,
        reason: offTopicSuspected
          ? `OFF_TOPIC (pre-processor); geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`
          : `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
        topSimilarity: topSim,
        rewrite: rewriteInfo,
        sources: allSources,
        threshold,
        embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors in `rag.ts`.

- [ ] **Step 6: Run de unit-test + bestaande unit-tests**

Run: `npm run test:unit`
Expected: alle tests PASS (incl. de nieuwe preprocess-parse test).

- [ ] **Step 7: Commit**

```bash
git add lib/v0/server/rag.ts
git commit -m "feat(offtopic): runRagQueryStreaming — off_topic HyDE-uit + off-topic-fallback (corpus-veto)"
```

---

## Task 5: Smoke-test op de echte bot

**Files:** geen (alleen runnen)

- [ ] **Step 1: Wis de org-cache (anders stale 2+2-hit)**

Run (vervang `<slug>` door de dakwerk-demo-org-slug; vind 'm via `npm run v0:list` of de KNOWN_ORGS):
`node --env-file=.env.local scripts/v0-clear-org-cache.mjs <slug> --apply`
Expected: bevestiging dat de cache-rijen gewist zijn.

- [ ] **Step 2: Vraag 2+2 aan v0.10**

Run: `npm run v0:chat -- --version=v0.10 --org=<slug> "Wat is 2+2"`
(Controleer de exacte flag-namen met `npm run v0:chat -- --help` of in `scripts/v0-chat.mjs`; val anders terug op de scriptconventie.)
Expected: een off-topic-fallback in de trant van "Ik help met vragen rondom … Wat wil je weten?", met `kind: 'fallback'`. NIET het oude wollige hard-fact-antwoord.

- [ ] **Step 3: Vraag een in-scope vraag (corpus-veto-check)**

Run: `npm run v0:chat -- --version=v0.10 --org=<slug> "<een vraag die in de kennisbank staat, bv. over tarieven/diensten>"`
Expected: een normaal, gegrond antwoord (`kind: 'answer'`) — bewijs dat de off_topic-detectie geen in-scope vraag weigert.

- [ ] **Step 4: Commit** (geen — dit is alleen verificatie; ga door naar Task 6)

---

## Task 6: Eval-regressie-poort (gratis hard-eval, vóór merge)

**Files:**
- Modify: `eval-fixtures/seed-questions-*.json` (off-topic-cases toevoegen)

**Mechaniek:** `eval:hard:run` genereert bot-antwoorden via `runRagQueryStreaming` en oordeelt deterministisch + via een Claude-judge (= Claude Code zelf; geen Anthropic-key). Draai dit bij voorkeur via de **eval-runner agent** (die kent de cache-discipline en versie-selectie). De hard-eval is gratis (geen billable OpenAI-judge), maar de bot-generatie kost een paar cent OpenAI — vraag bevestiging vóór een volledige run als de scope groot is.

- [ ] **Step 1: Voeg off-topic-cases toe aan de seed-fixtures**

Zoek het fixture-bestand voor de eval-org (bv. `eval-fixtures/seed-questions-acme-corp.json`) en bekijk het bestaande case-formaat (velden zoals `id`, `question`, `expectsRefusal`/`must`-velden — kopieer exact het bestaande schema, verzin geen nieuwe velden). Voeg cases toe met de off-topic-verwachting (refusal), bv.:

- `offtopic-rekensom` — "Wat is 2+2?"
- `offtopic-weer` — "Wat voor weer wordt het morgen?"
- `offtopic-ander-bedrijf` — "Wat zijn de openingstijden van de Albert Heijn?"
- `offtopic-code` — "Schrijf een Python-functie die priemgetallen print."

Gebruik exact dezelfde markering voor "hoort te weigeren" als bestaande out-of-corpus-cases (bv. `acme-out-of-corpus-*`) in dat bestand gebruiken. Voeg ook 1 *control*-case toe die op off-topic lijkt maar in-scope is (bv. een prijs/rekenvraag die wél over het bedrijf gaat) met de verwachting dat 'ie WEL beantwoord wordt — de false-positive-check.

- [ ] **Step 2: Wis de cache voor de eval-org(s)**

Run: `node --env-file=.env.local scripts/v0-clear-org-cache.mjs <eval-org-slug> --apply`
Expected: cache gewist (in-place promptwijziging → stale hits vermijden).

- [ ] **Step 3: Draai de hard-eval op v0.10 (via de eval-runner agent)**

Dispatch de **eval-runner** agent met de opdracht: draai `eval:hard:run` expliciet op `--versions=v0.10` (de DEFAULT_VERSIONS mist mogelijk v0.10 — geef 'm expliciet mee), lever de verdict-tabel + watch-items terug. Zonder expliciet "GOEDGEKEURD" levert de agent eerst een kostenraming + plan; keur dat goed vóór de echte run.

Expected verdict:
- De nieuwe off-topic-cases + bestaande out-of-corpus-cases → **refusal** (echt refusal-event: `kind:'fallback'`).
- De in-scope set → **geen daling** t.o.v. de baseline (geen nieuwe over-refusals).
- De control-case (off-topic-lijkend maar in-scope) → **beantwoord**, niet geweigerd.

- [ ] **Step 4: Beoordeel & beslis**

- Slaagt de poort (off-topic weigert, 0 in-scope-regressie, control beantwoord) → door naar Task 7.
- Faalt er een in-scope-case (false positive) → de pre-processor-prompt is te streng. Scherp de OFF_TOPIC-sectie aan (meer "bij twijfel → SEARCH", concretere negatieve voorbeelden), wis cache, her-run. Herhaal tot de poort schoon is. Documenteer wat je aanpaste.

- [ ] **Step 5: Commit de fixtures**

```bash
git add eval-fixtures/
git commit -m "test(offtopic): off-topic + control eval-cases voor de regressie-poort"
```

---

## Task 7: PR

**Files:** geen code — PR aanmaken

- [ ] **Step 1: Vul de PR-template in**

Beschrijf voor een reviewer-zonder-context: het probleem (2+2 → "Beantwoord"), de twee ingrepen (algemene kennis uit op v0.10 + off_topic-detectie met corpus-veto), de false-positive-mitigatie, en de eval-uitslag (off-topic weigert, 0 in-scope-regressie). Vermeld expliciet de **deploy-stap: org-caches wissen ná deploy** (in-place v0.10-wijziging → oude 2+2-antwoorden zitten nog in de answer-cache onder v0.10).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/seb/offtopic-fallback
gh pr create --fill
```

- [ ] **Step 3: Hard rules-check**

Geen migratie, geen RLS-/multi-tenancy-/service-role-wijziging, geen secrets, geen V1-scope. Anti-hallucinatie: versterkt (off-topic weigert i.p.v. fabriceert). Klopt met de V0-sandbox-disclaimer (alleen fake demo-data).

---

## Self-review (door de plan-auteur, vóór uitvoering)

- **Spec-dekking:** §3.1 algemene kennis uit → Task 2. §3.2 off_topic-prompt → Task 2 (prompt) + Task 1 (parse). §3.3 corpus-veto/HyDE-uit → Task 3/4. §3.4 off-topic-tekst → Task 3/4. §3.5 flag/versie → Task 2. §3.6 label (auto) → geen code, geverifieerd in Task 5/6 (kind:'fallback'). §6 eval → Task 6. Alle secties gedekt.
- **Geen placeholders:** alle code-stappen tonen de volledige before/after.
- **Type-consistentie:** `offTopicSuspected` (beide orchestrators), `preProcessOffTopicDetection` (bots.ts + rag.ts), `parsePreProcessOutput` export — namen consistent gebruikt. De `{ kind: 'off_topic' }`-variant heeft geen `query`/`reply`, dus de branches narrowen correct (smalltalk-return → off_topic-branch → else=search).
- **Risico-noot:** de exacte regelnummers kunnen schuiven; elke edit is op unieke code-strings geankerd en wordt voorafgegaan door een lees-stap impliciet (Edit faalt als de string niet matcht).
