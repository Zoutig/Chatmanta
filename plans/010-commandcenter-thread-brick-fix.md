# Plan 010: Command Center-assistent — een half-gepersisteerde tool-turn brickt de thread niet meer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3437648..HEAD -- app/api/commandcenter/assistant/route.ts lib/commandcenter/server/assistant-threads.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3437648`, 2026-07-06

## Why this matters

De Command Center-assistent (intern admin-tool, `/commandcenter`, achter
`requireV0Auth`) kan een gespreksthread **permanent** onbruikbaar maken. Zodra
een assistant-turn met `tool_calls` naar de DB is geschreven maar één of meer
bijbehorende `tool`-resultaten daarna **niet** worden gepersisteerd (DB-blip,
client-abort mid-stream, of een Vercel-functietimeout tussen de twee writes),
staat er een "dangling" `tool_calls` in de thread. Elke volgende beurt
reconstrueert die geschiedenis 1-op-1 en stuurt hem naar OpenAI, die hard
faalt met een 400: *"an assistant message with 'tool_calls' must be followed by
tool messages responding to each 'tool_call_id'"*. De thread self-heal't nooit;
erger nog, elke retry appendt eerst nóg een user-message aan de kapotte thread.
Herstel kan nu alleen door de thread te verwijderen of te wachten tot de
`MAX_ACTIVE_THREADS = 3`-pruning hem opruimt.

Er is maximaal drie actieve threads, dus één gebrickte thread is meteen een
derde van de capaciteit. Geen klant-impact (intern), maar wel een frustrerende,
ondoorzichtige faalmodus voor de operator. De fix maakt zowel het schrijfpad
robuust (geen nieuwe dangling-turns) als het leespad zelf-herstellend (repareert
óók reeds-gebrickte threads, zonder migratie).

## Current state

Alle relevante logica staat in één route-handler plus één storage-module:

- `app/api/commandcenter/assistant/route.ts` — de turn-handler: auth → thread
  laden/maken → user-message persisten → context+history laden → tool-loop (max
  5 iteraties, `gpt-4o`) → NDJSON-events streamen. **Dit is het enige bestand
  dat je wijzigt** (plus een nieuw helper-bestand en zijn test).
- `lib/commandcenter/server/assistant-threads.ts` — de storage-laag.
  `appendMessage(input): Promise<AssistantMessage>` **throwt** een `Error` bij
  een Supabase-insert-fout (`route.ts` heeft geen per-call compensatie).
  `listMessages(threadId)` geeft alle rijen `ORDER BY created_at ASC`.
  **Lees-referentie, niet wijzigen.**

De drie plekken die samen de bug vormen (regelnummers t.o.v. commit `3437648`):

**1. De assistant-turn met tool_calls wordt EERST gepersisteerd** — `route.ts:172-185`:

```ts
if (toolCalls.length > 0) {
  // Persist de assistant-turn met tool-calls (content is meestal null/leeg).
  await appendMessage({
    threadId: threadIdResolved,
    role: 'assistant',
    content: assistantMsg.content ?? null,
    toolCalls: toolCalls,
    model: MODEL,
    ...
  });
```

**2. De tool-resultaten worden daarna in een `Promise.all` geschreven** —
één throw rejectt de hele batch en er is geen compensatie-write — `route.ts:196-242`:

```ts
await Promise.all(
  toolCalls.map(async (tc) => {
    const tool = getTool(tc.function.name);
    ...
    emit({ type: 'tool_call', id: tc.id, name: tc.function.name, args: parsedArgs });
    const result = tool ? await tool.execute(parsedArgs) : { ok: false, error: `Onbekende tool: ${tc.function.name}` };
    const stored = await appendMessage({            // <-- throwt bij DB-blip
      threadId: threadIdResolved, role: 'tool', content: null,
      toolCallId: tc.id, toolName: tc.function.name, toolResult: result,
    });
    messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    emit({ type: 'tool_result', tool_call_id: tc.id, message_id: stored.id, ... });
  }),
);
```

De `emit(...)` (`route.ts:206`, `route.ts:231`) enqueue't op de stream-controller
(gedefinieerd `route.ts:136-138` als `controller.enqueue(...)`) en **throwt óók**
als de client de stream heeft gecanceld — een tweede realistische trigger. Let op:
de eerste `emit` (`tool_call`-event, r206) vuurt VÓÓR de `appendMessage` (r213); een
client-abort op precies dat moment laat de tool-message dus ongeschreven — de
try/catch-wrap uit Step 3 moet daarom de héle per-call-body dekken, inclusief die
eerste emit. De outer `catch` (`route.ts:287-291`) logt en emit't een `error`-event,
de `finally` sluit de stream — maar er is géén compensatie-write naar de DB:

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[cc-assistant]', message);
  emit({ type: 'error', message });
} finally {
  controller.close();
}
```

**3. De history-reconstructie stuurt de dangling `tool_calls` onveranderd naar
OpenAI** — `route.ts:113-130`:

```ts
const messages: ChatMsg[] = [{ role: 'system', content: systemPrompt }];
for (const m of history) {
  if (m.role === 'user' && m.content) {
    messages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    messages.push({ role: 'assistant', content: m.content, tool_calls: m.toolCalls ?? undefined });
  } else if (m.role === 'tool' && m.toolCallId) {
    messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: JSON.stringify(m.toolResult ?? { ok: false, error: 'missing result' }) });
  }
}
```

Er is geen check dat elk `tool_call_id` in een assistant-turn een aansluitende
`tool`-message heeft; `m.role === 'tool' && m.toolCallId` skipt bovendien stil een
tool-rij met `null` toolCallId. Deze `messages`-array gaat 1-op-1 naar
`openai().chat.completions.create` (`route.ts:149-155`) → 400.

**Geverifieerd (2026-07-08, HEAD `d94c90a`): het omgekeerde brick-scenario — een
`tool`-message zonder voorafgaande assistant-turn-met-`tool_calls` (óók een
OpenAI-400) — is met de huidige code onbereikbaar.** `listMessages`
(`assistant-threads.ts:211-219`) filtert niets (er bestaat geen `undone`-kolom;
migratie 0028), de undo-route gate't hard op `role === 'tool'` en
`markMessageUndone` (`assistant-threads.ts:232-244`) zet alleen een
`undone: true`-flag ín de `tool_result`-JSON — verwijdert niets en raakt de
assistant-turn nooit aan. Losse messages worden nergens verwijderd (alleen hele
threads, CASCADE). De helper in Step 1 dropt orphan-tool-rijen desondanks als
vangnet: hij is dé plek die OpenAI-validiteit van de gereconstrueerde history
garandeert, en een toekomstige wijziging aan `listMessages`/undo mag die garantie
niet stil kunnen breken. Bijvangst (bewust buiten scope): een ge-undo'de
tool-message houdt `undone: true` in zijn content-JSON — semantische ruis voor het
model, geen 400.

**De relevante types** (uit `lib/commandcenter/types.ts` — lees ze, wijzig ze niet):
`AssistantMessage` heeft o.a. `role: AssistantRole`, `content: string | null`,
`toolCalls: AssistantToolCall[] | null`, `toolCallId: string | null`,
`toolResult: AssistantToolResult | null`. `AssistantToolCall` heeft de OpenAI-vorm
`{ id, type: 'function', function: { name, arguments } }`.

**Conventies om te volgen** (belangrijk — de executor matcht bestaande stijl):

- Bestandsheaders + comments zijn in het **Nederlands** (zie de header van
  `route.ts` en `assistant-threads.ts`). Volg die toon.
- De tool-executors gebruiken een `{ ok: false, error }`-conventie in plaats van
  te throwen (zie `lib/commandcenter/server/assistant-tools.ts`). Een
  gesynthetiseerd placeholder-tool-resultaat volgt diezelfde vorm.
- De OpenAI-message-types (`ChatMsg` in `route.ts:56-64`) staan **bewust los** van
  de SDK-types en worden met `as unknown as ...ChatCompletionMessageParam[]`
  (`route.ts:151`) gecast. Behoud die scheiding — voeg geen SDK-type-afhankelijkheid
  toe aan de nieuwe helper.
- `route.ts` is `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`.

## Commands you will need

| Purpose   | Command                                              | Expected on success        |
|-----------|------------------------------------------------------|----------------------------|
| Typecheck | `npm run typecheck`                                  | exit 0, geen errors        |
| Unit test | `npm run test:unit`                                  | alle tests groen, incl. de nieuwe |
| Build     | `npm run build` (Windows: eerst `.next/` verwijderen) | exit 0                     |

(Op Windows crasht `next build` op een vervuilde `.next/` als er een dev-server
heeft gedraaid — verwijder die map eerst: PowerShell `Remove-Item -Recurse -Force .next`.)

## Scope

**In scope** (de enige files die je aanmaakt/wijzigt):
- `app/api/commandcenter/assistant/route.ts` — tool-loop hardenen + de
  reconstructie vervangen door een aanroep van de nieuwe helper.
- `lib/commandcenter/server/assistant-history.ts` **(nieuw)** — de pure,
  testbare reconstructie- + repair-helper.
- `lib/commandcenter/server/__tests__/assistant-history.test.ts` **(nieuw)** —
  unit-tests (maak de `__tests__`-map aan; die bestaat nog niet voor commandcenter).

**Out of scope** (NIET aanraken, ook al lijken ze gerelateerd):
- De undo-flow (`markMessageUndone` + de undo-route) en `pruneToMax` /
  `MAX_ACTIVE_THREADS` in `assistant-threads.ts`.
- De tool-schema's/executors in `assistant-tools.ts`.
- De NDJSON-eventtypes — de commandcenter-client parseert die; voeg **geen**
  nieuwe eventtypes toe.
- Elke DB-migratie — het schema `cc_assistant_messages` blijft ongewijzigd
  (de leespad-repair heeft geen migratie nodig). Raak `supabase/migrations*/` niet aan.
- `requireV0Auth` en de auth-afhandeling.

## Git workflow

- Branch: `feat/seb/cc-thread-brick-fix` (repo-conventie: `feat/seb/<beschrijving>`,
  nooit direct op `main` — een lokale pre-push-hook blokkeert push naar main).
- Commit klein en vaak; conventional-commit-stijl zoals in `git log`
  (bv. `fix(commandcenter): repareer gebrickte assistent-thread bij half-gepersisteerde tool-turn`).
- Push naar de feature-branch en open een PR met `gh pr create` (vul
  `.github/pull_request_template.md` volledig in). Push/merge alleen als de
  operator daarom vraagt.

## Steps

### Step 1: Extraheer de history-reconstructie naar een pure helper met repair-logica

Maak `lib/commandcenter/server/assistant-history.ts`. Begin met `import 'server-only';`
(zoals de buren) en importeer de types uit `../types`. Exporteer één functie die
de logica uit `route.ts:113-130` overneemt **plus** de dangling-`tool_calls`-repair.

Doel-vorm (het `ChatMsg`-type is nu privé in `route.ts` — verplaats de `type ChatMsg`-
definitie naar dit helper-bestand en exporteer 'm, zodat `route.ts` 'm kan importeren):

```ts
import 'server-only';
import type { AssistantMessage, AssistantToolCall } from '../types';

export type ChatMsg =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * Bouwt de OpenAI-messages-array uit de opgeslagen thread-geschiedenis en
 * repareert beide invaliditeits-richtingen:
 * 1. "Dangling" tool_calls: voor elke assistant-turn met tool_calls waarvan een
 *    tool_call_id géén tool-message heeft, wordt direct ná die assistant-turn
 *    een placeholder-tool-message ingevoegd (anders OpenAI-400, thread bricked).
 * 2. Orphan-tool-rijen: een tool-message waarvan het tool_call_id in géén enkele
 *    assistant-turn is aangekondigd wordt gedropt (óók een OpenAI-400). Vandaag
 *    onbereikbaar (zie plan-Current-state) — dit is de vangnet-laag.
 */
export function buildChatHistory(system: string, history: AssistantMessage[]): ChatMsg[] {
  const out: ChatMsg[] = [{ role: 'system', content: system }];
  // Eén keer vooraf verzamelen (niet per assistant-turn opnieuw):
  // - answered: tool_call_ids die ergens in de thread een tool-rij hebben;
  // - called:   tool_call_ids die door een assistant-turn zijn aangekondigd.
  const answered = new Set(
    history.filter((h) => h.role === 'tool' && h.toolCallId).map((h) => h.toolCallId as string),
  );
  const called = new Set(
    history.flatMap((h) => (h.role === 'assistant' && h.toolCalls ? h.toolCalls.map((c) => c.id) : [])),
  );
  for (const m of history) {
    if (m.role === 'user' && m.content) {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const calls = m.toolCalls ?? undefined;
      out.push({ role: 'assistant', content: m.content, tool_calls: calls });
      if (calls && calls.length > 0) {
        for (const c of calls) {
          if (!answered.has(c.id)) {
            out.push({
              role: 'tool',
              tool_call_id: c.id,
              content: JSON.stringify({ ok: false, error: 'tool-resultaat verloren gegaan' }),
            });
          }
        }
      }
    } else if (m.role === 'tool' && m.toolCallId && called.has(m.toolCallId)) {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: JSON.stringify(m.toolResult ?? { ok: false, error: 'missing result' }),
      });
    }
    // Tool-rij met null toolCallId óf zonder aankondigende assistant-turn (orphan)
    // wordt bewust genegeerd: geen van beide kan een geldige OpenAI tool-message
    // vormen. De placeholder hierboven dekt het dangling-gat.
  }
  return out;
}
```

Let op de OpenAI-eis: een `tool`-message moet **direct** volgen op de
assistant-message die zijn `tool_call_id` opriep. Omdat de tool-resultaten in de
DB per definitie ná hun assistant-turn zijn geschreven (of ontbreken), volstaat
het om de placeholder meteen achter de assistant-turn in te voegen en de echte
tool-rijen op hun eigen chronologische plek te laten — die staan er direct achter.
Als een assistant-turn helemaal géén tool-resultaten kreeg, staan er ná de
placeholders geen echte tool-rijen: dat is correct.

**Verify**: `npm run typecheck` → exit 0. (Nog geen gedragswijziging in `route.ts`.)

### Step 2: Laat `route.ts` de helper gebruiken i.p.v. de inline-reconstructie

In `route.ts`:
- Verwijder de lokale `type ChatMsg = ...` (regels 56-64) en importeer 'm uit
  de nieuwe helper: `import { buildChatHistory, type ChatMsg } from '@/lib/commandcenter/server/assistant-history';`
- Vervang het blok `const messages: ChatMsg[] = [...]; for (const m of history) { ... }`
  (regels 113-130) door: `const messages: ChatMsg[] = buildChatHistory(systemPrompt, history);`

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Hardt de tool-loop zodat een half-gepersisteerde turn nooit meer ontstaat

In de tool-loop (`route.ts:196-242`) vervang je `Promise.all` door een variant die
per tool-call gegarandeerd een tool-resultaat in de DB achterlaat, óók als
`tool.execute`, de `appendMessage`, of een `emit` throwt. Wrap de per-call body in
een `try/catch`; in de `catch` probeer je alsnog een placeholder-tool-message te
persisten en (best-effort) naar de client te emitten:

```ts
await Promise.all(
  toolCalls.map(async (tc) => {
    try {
      // ... bestaande body: parse args, emit tool_call, tool.execute,
      //     appendMessage(tool-result), messages.push, emit tool_result ...
    } catch (toolErr) {
      const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
      // Zorg dat er ALTIJD een tool-message voor dit tool_call_id in de DB komt,
      // anders brickt de thread. Best-effort: slik een tweede fout.
      const fallback = { ok: false as const, error: `tool-uitvoering faalde: ${errMsg}` };
      try {
        await appendMessage({
          threadId: threadIdResolved, role: 'tool', content: null,
          toolCallId: tc.id, toolName: tc.function.name, toolResult: fallback,
        });
      } catch { /* DB onbereikbaar — de leespad-repair (Step 1) vangt dit alsnog */ }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(fallback) });
      try { emit({ type: 'tool_result', tool_call_id: tc.id, name: tc.function.name, ok: false, error: errMsg }); } catch { /* client weg */ }
    }
  }),
);
```

Belangrijk: laat de `emit`-aanroepen binnen de happy-path body ook tegen een
gecancelde stream kunnen — als je twijfelt, wrap de losse `emit(...)`-calls in de
body in een kleine helper die throws slikt, zodat een client-abort de DB-writes
niet meesleept. De `message_id` in het happy-path `tool_result`-event blijft
`stored.id`; in het fallback-event laat je `message_id`/`undo_token` weg (de
client behandelt die als optioneel).

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Schrijf de unit-tests voor de helper

Maak `lib/commandcenter/server/__tests__/assistant-history.test.ts`. Gebruik
`node:test` + `node:assert/strict`, in de stijl van
`lib/rag/__tests__/history-entities.test.ts` (pure-functie-tests, geen mocks).
De runner (`npm run test:unit`) draait alleen `.test.ts` **binnen** een
`__tests__`-map en faalt hard op strays — plaats het bestand dus exact daar.

`buildChatHistory` importeert `server-only`; dat is prima onder de default
react-server-pass van de runner (net als de embed-token-tests). Mock niets.

Dek minstens deze gevallen af (bouw `AssistantMessage`-fixtures met de velden uit
`../types`; alleen de relevante velden hoeven gevuld, de rest `null`):

1. **Complete turn** — assistant met 1 tool_call + bijbehorende tool-message →
   output bevat de assistant-turn gevolgd door precies één tool-message, geen
   placeholder.
2. **Gebrickte turn** — assistant met 2 tool_calls maar slechts 1 tool-message
   → er wordt precies één placeholder-tool-message ingevoegd voor het ontbrekende
   `tool_call_id`, met `content` die `"tool-resultaat verloren gegaan"` bevat, en
   elke assistant-`tool_calls`-id heeft nu een tool-message.
3. **Tool-rij met `null` toolCallId** — wordt niet als losse tool-message
   toegevoegd én levert geen dangling call op.
4. **Thread zonder tool-calls** — gewone user/assistant-tekst blijft ongewijzigd;
   geen placeholders.
5. **Orphan-tool-rij** — een tool-message waarvan het `toolCallId` in géén enkele
   assistant-turn voorkomt → verschijnt niet in de output (gedropt; vandaag
   onbereikbaar scenario, maar de helper garandeert het).
6. Invariant die de OpenAI-eis borgt: voor elke `assistant`-message met
   `tool_calls` in de output heeft **elk** `tool_call_id` ergens ná die message
   een `tool`-message met datzelfde id, én elke `tool`-message in de output heeft
   een eerdere `assistant`-message die zijn `tool_call_id` aankondigt.

**Verify**: `npm run test:unit` → alle tests groen, inclusief de 6 nieuwe cases.

### Step 5: Volledige verificatie

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → alle groen
- `npm run build` (Windows: eerst `.next/` verwijderen) → exit 0

## Test plan

- Nieuw: `lib/commandcenter/server/__tests__/assistant-history.test.ts` met de 6
  cases hierboven. Structuurvoorbeeld: `lib/rag/__tests__/history-entities.test.ts`
  (`node:test`, `assert/strict`, pure functie, geen I/O).
- Geen wijziging aan bestaande tests.
- Verificatie: `npm run test:unit` → alle bestaande + 6 nieuwe cases groen.
- **Handmatige E2E (optioneel, na de unit-tests)**: verwijder in de V0-Supabase
  handmatig één `tool`-rij van een bestaande `cc_assistant_messages`-thread
  (simuleert de half-gepersisteerde turn), stuur dan een nieuw bericht in
  `/commandcenter` op die thread. **Vóór de fix**: een `error`-event met de
  OpenAI-400-tekst. **Na de fix**: een normaal antwoord (de thread is hersteld).

## Done criteria

Machine-checkbaar. ALLE moeten gelden:

- [ ] `npm run typecheck` exit 0
- [ ] `npm run test:unit` exit 0; `assistant-history.test.ts` bestaat en de 6
      cases passen
- [ ] `npm run build` exit 0 (na schone `.next/`)
- [ ] `route.ts` bevat geen inline `for (const m of history)`-reconstructie meer
      (`grep -n "for (const m of history)" app/api/commandcenter/assistant/route.ts`
      → geen match)
- [ ] Geen files buiten de in-scope lijst gewijzigd (`git status`)
- [ ] `plans/README.md` statusrij bijgewerkt

## STOP conditions

Stop en rapporteer (niet improviseren) als:

- De drift-check laat zien dat `route.ts` of `assistant-threads.ts` sinds commit
  `3437648` is gewijzigd en de "Current state"-excerpts niet meer kloppen.
- Een verificatie faalt twee keer na een redelijke fixpoging.
- De fix blijkt een out-of-scope bestand te vereisen (bv. een migratie of een
  wijziging aan `assistant-tools.ts`).
- De aanname "een `tool`-message moet direct ná zijn assistant-turn staan om de
  400 te vermijden" blijkt onjuist bij de handmatige E2E (OpenAI klaagt alsnog) —
  dan is de invoeg-positie het probleem, meld het.

## Maintenance notes

- Als er ooit een DB-migratie komt die oude gebrickte threads wil "opschonen",
  is dat overbodig geworden: de leespad-repair in `buildChatHistory` herstelt ze
  al bij het eerstvolgende bezoek. De placeholder-tekst
  `"tool-resultaat verloren gegaan"` is de zichtbare marker daarvan.
- Wat een reviewer moet checken: (1) dat de placeholder-tool-message op de juiste
  positie (direct ná de assistant-turn, vóór de volgende assistant/user) belandt —
  dit is de kern van de OpenAI-eis; (2) dat geen enkel pad in de tool-loop meer
  een assistant-`tool_calls` kan achterlaten zonder tool-message; (3) dat er geen
  nieuw NDJSON-eventtype is geïntroduceerd (de client-parser is out-of-scope);
  (4) dat de orphan-drop (`called`-set) intact blijft — dat is het vangnet dat
  toekomstige wijzigingen aan `listMessages`/undo dekt.
- Bewust uitgesteld: het dedupliceren van de `ChatMsg`↔SDK-typecast en een echte
  integratietest tegen een gemockte OpenAI-client — de pure helper dekt de
  regressie; een end-to-end test vergt een OpenAI-mock die deze repo (nog) niet heeft.
