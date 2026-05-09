# V0 Tone & Length toggles — design

**Status:** approved
**Date:** 2026-05-10
**Scope:** V0 chat UI + RAG-pijplijn + query_log
**Out of scope:** V1 widget, multi-tenant per-org defaults, per-user persistence in DB

## Doel

Twee gebruikers-controls toevoegen aan de V0 chat: **Tone** (`formal` / `neutral` / `casual`) en **Length** (`short` / `medium` / `detailed`). Keuzes persisteren in `localStorage`, gaan mee in elke `/api/v0/chat`-call, sturen de system prompt van de antwoord-LLM, en worden gelogd in `query_log` voor empirische analyse (bv. "leidt `detailed` tot meer hallucinaties of fallbacks?"). Ontwikkel-feedback via een nieuwe **Prompt-tab** in de RightPanel die de samengestelde prompt live rendert.

## Beslissingen

| | Keuze | Reden |
|---|---|---|
| Plaatsing UI | Composer-pills **én** Settings-tab mirror. Rewrite-pill verhuist uit composer naar Settings. | Snelle wissel tussen vragen door + uitlegplek in Settings; Rewrite hoort thuis bij andere "advanced" toggles met cost-implicatie. |
| Length-implementatie | Alleen prompt-instructie. `max_tokens` blijft 500. | Simpel; korte experimenten zonder schaal-effect op de pipeline. |
| Cache-gedrag (v0.3) | Tone/length **niet** in cache-key. Mismatches geaccepteerd. | V0 is leeranalyse; cache-fragmentatie (9 combinaties) is duurder dan af en toe een "verkeerde stijl"-hit. |
| Smalltalk | Tone/length **niet** toepassen op pre-processor. | Pre-processor heeft strict ACTION/REPLY-format; risico op parser-breakage te groot voor de winst. |
| Dev-preview | Eigen **Prompt-tab** in RightPanel naast Sources/Settings. | Meer ruimte voor base + suffix + final, geen disclosure-clutter in Settings. |
| Settings mirrors | Inline segmented-buttons (altijd uitgeklapt) ipv pill+popover. | Beter overzicht in een settings-context; popover-pattern is alleen voor de composer. |
| Type-locatie | `BaseChatResponse.tone` / `BaseChatResponse.length` (niet `extras`). | Tone/length zijn metadata van élke call (smalltalk + fallback + answer), geen v0.3-feature. |

## Architectuur

```
ChatShell  (state via useStyle() hook → localStorage)
   │
   ├─► Composer            : pills [drempel] [toon] [lengte]    (Rewrite verdwijnt hier)
   ├─► RightPanel
   │     ├─ Settings tab   : segmented [drempel] [toon] [lengte] [Rewrite]
   │     └─ Prompt tab     : live render van buildSystemPrompt(bot, {tone, length})
   └─► fetch /api/v0/chat  : body { question, threshold, enableRewrite, version, history,
                                     tone, length }
            │
            ▼
       route.ts            : valideert + default (neutral/medium) bij invalide/missing
            │
            ▼
       runRagQueryStreaming({...input, tone, length})
            │
            ├─► buildSystemPrompt(bot.systemPrompt, {tone, length})
            │   gebruikt door:
            │     · main answer-call (chatComplete + streaming)
            │     · cascade-call (v0.3 low-confidence pad)
            │   NIET door: pre-processor (smalltalk-pad)
            │
            └─► finalResponse.tone / .length  ← op BaseChatResponse, álle response-kinds
            │
            ▼
       logQuery(question, response)   : leest tone/length, schrijft naar query_log
                                        (kolommen tone + length, migratie 0006)
```

## Datatypes

**`lib/v0/style-types.ts`** (universeel — types + guards + defaults):

```ts
export const TONES = ['formal', 'neutral', 'casual'] as const;
export const LENGTHS = ['short', 'medium', 'detailed'] as const;
export type Tone = (typeof TONES)[number];
export type Length = (typeof LENGTHS)[number];
export const DEFAULT_TONE: Tone = 'neutral';
export const DEFAULT_LENGTH: Length = 'medium';
export function isTone(v: unknown): v is Tone {
  return typeof v === 'string' && (TONES as readonly string[]).includes(v);
}
export function isLength(v: unknown): v is Length {
  return typeof v === 'string' && (LENGTHS as readonly string[]).includes(v);
}
```

**`lib/v0/style.ts`** (universeel — pure prompt-bouw):

```ts
import { type Tone, type Length, DEFAULT_TONE, DEFAULT_LENGTH, isTone, isLength } from './style-types';

const TONE_INSTRUCTION: Record<Tone, string> = {
  formal:  'Antwoord in een formele, zakelijke toon. Gebruik u-vorm waar passend.',
  neutral: 'Antwoord in een neutrale, professioneel-vriendelijke toon (de standaard).',
  casual:  'Antwoord in een losse, informele toon. Mag jij/je. Mag een knipoog.',
};
const LENGTH_INSTRUCTION: Record<Length, string> = {
  short:    'Houd het kort: maximaal 2 zinnen.',
  medium:   'Houd het op één korte alinea (3–5 zinnen).',
  detailed: 'Geef een uitgebreid antwoord van meerdere alinea\'s waar de stof dat toelaat.',
};

export function normalizeStyle(input: { tone?: unknown; length?: unknown }): { tone: Tone; length: Length } {
  return {
    tone:   isTone(input.tone)     ? input.tone   : DEFAULT_TONE,
    length: isLength(input.length) ? input.length : DEFAULT_LENGTH,
  };
}

export function buildSystemPrompt(
  baseSystem: string,
  style: { tone: Tone; length: Length },
): string {
  const suffix =
    `\n\nSTIJL:\n` +
    `- ${TONE_INSTRUCTION[style.tone]}\n` +
    `- ${LENGTH_INSTRUCTION[style.length]}`;
  return baseSystem + suffix;
}

export function describeStyle(style: { tone: Tone; length: Length }): { tone: string; length: string } {
  return { tone: TONE_INSTRUCTION[style.tone], length: LENGTH_INSTRUCTION[style.length] };
}
```

## State & persistence

**localStorage** key `chatmanta:v0:style`, één blob:
```json
{ "tone": "neutral", "length": "medium" }
```

**`app/components/use-style.ts`** — hydrate-safe hook:
- Eerste render: defaults (anders SSR/CSR mismatch).
- `useEffect` na mount: parse localStorage, `setStyle(...)` als geldig.
- Setter schrijft synchroon naar localStorage; bij JSON-parse-fout key wissen + defaults.

```ts
export function useStyle(): {
  tone: Tone; length: Length;
  setTone: (t: Tone) => void; setLength: (l: Length) => void;
}
```

## API-contract

**`app/api/v0/chat/route.ts`** — body uitbreiden:
```ts
type Body = {
  question?: unknown;
  threshold?: unknown;
  enableRewrite?: unknown;
  version?: unknown;
  history?: unknown;
  tone?: unknown;     // NIEUW
  length?: unknown;   // NIEUW
};
```
Defaulting via `normalizeStyle({ tone: body.tone, length: body.length })`. Geen 400 bij invalide — silent fallback (consistent met huidige threshold-default).

`runRagQueryStreaming` krijgt twee extra parameters:
```ts
runRagQueryStreaming({ question, threshold, enableRewrite, bot, history, tone, length })
```

## RAG-laag wijzigingen (`lib/v0/server/rag.ts`)

1. Import `buildSystemPrompt` uit `@/lib/v0/style`.
2. Bovenaan `runRagQuery` en `runRagQueryStreaming`: bereken
   ```ts
   const systemPrompt = buildSystemPrompt(bot.systemPrompt, { tone, length });
   ```
3. Gebruik `systemPrompt` ipv `bot.systemPrompt` op:
   - main `chatComplete` / streaming `openai().chat.completions.create` voor het antwoord
   - cascade-call (`stronger`) bij v0.3 low-confidence
4. **Niet** vervangen op:
   - `preProcessInput` (smalltalk-routing)
   - `generateMultiQueries`, `decomposeQuery`, `generateHydeDocument`, `rerankChunks`, `generateFollowUps` — die hebben eigen, taakspecifieke system prompts.
5. **Smalltalk-response** krijgt tone/length toch op de top-level response (logging completeness):
   ```ts
   { botVersion, kind: 'smalltalk', tone, length, answer, ... }
   ```
6. Idem `fallback` en `answer`-responses: `tone` en `length` op `BaseChatResponse`.

`BaseChatResponse` wordt:
```ts
type BaseChatResponse = {
  botVersion: string;
  tone: Tone;
  length: Length;
};
```

## DB-migratie 0006

**`supabase/migrations/0006_v0_query_log_style.sql`**:

```sql
-- =============================================================================
-- Migration 0006 — V0 query log tone/length kolommen
--
-- Voor empirische analyse: zorgt 'detailed' voor meer hallucinaties/fallbacks?
-- Werkt 'casual' beter dan 'formal' op begroetingen?
--
-- Kolommen zijn nullable: legacy rijen blijven geldig zonder backfill.
-- =============================================================================

alter table public.query_log
  add column tone   text,
  add column length text;

alter table public.query_log
  add constraint query_log_tone_chk
    check (tone is null or tone in ('formal','neutral','casual'));

alter table public.query_log
  add constraint query_log_length_chk
    check (length is null or length in ('short','medium','detailed'));

create index query_log_org_style_idx
  on public.query_log (organization_id, tone, length);
```

**`lib/v0/server/log.ts`** — `QueryLogRow` uitbreiden, beide branches (smalltalk + answer/fallback) nemen `response.tone` / `response.length` over.

## UI-componenten

### Composer (`app/components/composer.tsx`)

- **Verwijderd**: Rewrite-pill + de twee props `rewriteOn` / `onToggleRewrite`.
- **Toegevoegd**: twee `<StylePill>` instanties.
- Pill-volgorde: `[drempel] [toon] [lengte]`.

### Nieuw: `app/components/style-pill.tsx`

```tsx
<StylePill
  kind="tone"            // 'tone' | 'length'
  value={tone}
  onChange={setTone}
/>
```
Render: `composer-tool` button met label `toon: neutral` (resp. `lengte: medium`). Popover met segmented-buttons + hint-regel:

```
┌─ Toon ────────────────────┐
│  [Formal] [Neutral] [Casual]   ← active = accent  │
│  professioneel ↔ losser                          │
└──────────────────────────┘
```
Volgt het visuele pattern van bestaande `ThresholdPill` (popover positionering, sluit-op-buiten-klik, ESC).

### Nieuw: `app/components/style-segmented.tsx`

Inline variant voor Settings-tab — geen popover, segmented-buttons direct zichtbaar. Zelfde props (`kind`, `value`, `onChange`).

### `app/components/settings-view.tsx`

- Sectie **Antwoord-stijl**: `<StyleSegmented kind="tone" />` + `<StyleSegmented kind="length" />`.
- Sectie **Pre-processing**: Rewrite-toggle (verhuisd uit composer) met de cost-uitleg uit de oude pill-tooltip.
- Drempel: bestaande slider blijft.

### Nieuw: `app/components/prompt-view.tsx`

Render-component voor de Prompt-tab. **Beslissing:** alleen de actieve bot's systemPrompt wordt meegestuurd, als losse prop `botSystemPrompt: string` van `app/page.tsx` → `ChatShell` → `RightPanel` → `PromptView`. `BotMeta` blijft ongewijzigd (anders zou de payload van de bot-dropdown elke pagina-laad alle systemPrompts van alle bots dragen — verspilling van ~3kb). De prop wordt server-side gevuld via `resolveBot(botVersion).systemPrompt` in `app/page.tsx`.

Layout:
```
Bot: v0.3 — alle features                        [📋 kopieer]
Toon: neutral · Lengte: medium

Base prompt (uit bot-config)
  [scrollbaar <pre>-blok met bot.systemPrompt]

Stijl-suffix (live)
  [<pre> met de huidige suffix uit buildSystemPrompt]

Final (wordt naar het model gestuurd)
  [<pre> met de samengestelde final-string]
```

Suffix + final renderen via dezelfde `buildSystemPrompt(...)` als de server. Geen drift mogelijk.

### `app/components/right-panel.tsx`

`RightTab` uitbreiden:
```ts
type RightTab = 'sources' | 'settings' | 'prompt';
```
Tab altijd zichtbaar (geen feature-flag). Volgorde: Sources, Settings, Prompt.

### `app/components/chat-shell.tsx`

- Vervang `useState(defaultEnableRewrite)` + `setRewriteOn` door:
  - `const { tone, length, setTone, setLength } = useStyle();`
  - Rewrite-state blijft bestaan maar wordt nu alleen door Settings-mirror beïnvloed (niet door Composer).
- `ask()` body uitbreiden met `tone, length`.
- Hand `tone`/`length` door naar Composer (alleen pills) en RightPanel (Settings + Prompt).
- Hook-deps van `ask`: voeg `tone, length` toe.

### `app/components/topbar.tsx`, `app/components/bot-dropdown.tsx`

Geen wijzigingen.

## Error-handling

| Situatie | Gedrag |
|---|---|
| API-body bevat invalide / ontbrekende tone of length | `normalizeStyle` → defaults, geen 400. |
| localStorage-blob corrupt JSON | hook wist key + valt terug op defaults; geen user-facing error. |
| Migratie 0006 niet gedraaid | `logQuery` faalt graceful (bestaande catch in log.ts), gebruiker krijgt antwoord, alleen die rij gaat verloren in analyse. |
| Toggle veranderd mid-stream | Lopende fetch draait door op closure-waarden; nieuwe waarde geldt vanaf volgende `ask()`. |

## Testing

1. **Unit (Node test runner)** — `tests/v0/style.test.mjs`:
   - `normalizeStyle` → defaults voor invalide / null / undefined / verkeerd type.
   - `buildSystemPrompt` bevat correct de tone- en length-zin per combinatie (9 cases, snapshot-achtig).
   - `buildSystemPrompt` muteert `baseSystem` niet; suffix begint met `\n\nSTIJL:`.

2. **Playwright** — `tests/v0/style-toggles.spec.ts`:
   - Composer toont 3 pills (drempel, toon, lengte); Rewrite is afwezig.
   - Tone-popover openen, klik "Casual", popover sluit, label `toon: casual`.
   - Reload pagina → label nog steeds `toon: casual` (localStorage-persistentie).
   - Switch naar Prompt-tab → final-blok bevat `STIJL:` en `losse, informele toon`.
   - Settings-tab → segmented Tone-button "Casual" is actief; klik "Formal" → composer-pill update óók (state-sync).

3. **Geen aparte test voor**: backend prompt-string (gedekt door unit op `buildSystemPrompt`); `query_log` insert (V0 is fire-and-forget logging).

## File-impact (samenvatting)

**Nieuw:**
- `lib/v0/style-types.ts`
- `lib/v0/style.ts`
- `app/components/use-style.ts`
- `app/components/style-pill.tsx`
- `app/components/style-segmented.tsx`
- `app/components/prompt-view.tsx`
- `supabase/migrations/0006_v0_query_log_style.sql`
- `tests/v0/style.test.mjs`
- `tests/v0/style-toggles.spec.ts`

**Aangepast:**
- `app/api/v0/chat/route.ts` (body parse + doorgeven tone/length)
- `lib/v0/server/rag.ts` (buildSystemPrompt-import, BaseChatResponse, runRagQuery + runRagQueryStreaming, smalltalk/fallback/answer responses)
- `lib/v0/server/log.ts` (QueryLogRow + insert mapping)
- `app/page.tsx` (server-laad `botSystemPrompt = resolveBot(botVersion).systemPrompt`, doorgeven aan ChatShell)
- `app/components/composer.tsx` (Rewrite weg, twee StylePills erbij)
- `app/components/chat-shell.tsx` (useStyle hook, botSystemPrompt-prop, ask-body, RightPanel-props)
- `app/components/right-panel.tsx` ('prompt'-tab + botSystemPrompt-prop)
- `app/components/settings-view.tsx` (segmented Tone/Length, Rewrite-toggle erbij)

**Niet aangepast:**
- `app/components/topbar.tsx`, `bot-dropdown.tsx`
- `lib/v0/server/bots.ts` — base `systemPrompt` per versie blijft ongemoeid
- `app/actions/threads.ts` — geen per-thread tone/length-persistentie

## Open punten / non-goals

- **Per-thread historie van tone/length**: niet bewaard in `messages`-tabel. Een herladen oude thread vertoont antwoorden met de stijl waarmee ze toen gegenereerd zijn (zit in `answer`-tekst zelf), maar de toggles-state is altijd de globale localStorage-waarde. Acceptabel V0.
- **Per-org / per-user defaults**: niet in scope. Defaults zijn hardcoded `neutral`/`medium`.
- **Tone op pre-processor (smalltalk)**: bewust geen — format-risico.
