# General-knowledge toggle (V0)

**Status:** Design — vastgesteld 2026-05-13
**Branch:** `feat/seb/general-toggle` (worktree `../chatmanta-general-toggle`)
**Auteur-context:** Sebastiaan + agent, brainstorming-sessie 2026-05-13

## Doel

Een toggle in `SettingsView` waarmee de V0-gebruiker per-sessie afzet of de bot bij retrieval zero-hits nog mag proberen via de reclassify-stap een algemeen-kennis-antwoord te geven (bijv. "wat is MKB?"). Wanneer uit: directe vaste `FALLBACK_MESSAGE`, géén tweede LLM-call. Wanneer aan: huidig v0.5-gedrag (reclassify → general/off_topic/fallback pad).

## Niet-doelen

- Niet: aan/uit zetten op v0.1–v0.4 (daar staat `bot.generalKnowledgeEnabled=false` en is er geen pad om te overrulen — toggle is dan disabled).
- Niet: persistentie tussen sessies — keuze leeft in-memory, refresh = terug naar bot-default.
- Niet: per-org of per-bot opslaan — V0 heeft geen user-identiteit en geen settings-table. V1 (Phase 1) krijgt een andere model.
- Niet: eval-pipeline parametriseren met deze toggle. Eval volgt de bot-default zodat eval-runs reproduceerbaar blijven.
- Niet: extra UI om de actuele waarde in een chip te tonen — bij toggle-uit krijg je gewoon de bestaande FALLBACK_MESSAGE-render.

## Gedrag

| Bot-versie | Toggle UI | Default-stand | Effect bij UIT |
|------------|-----------|---------------|----------------|
| v0.1–v0.4  | disabled  | n.v.t. (bot ondersteunt het niet) | n.v.t. |
| v0.5+ (`generalKnowledgeEnabled=true`) | interactief | aan | zero-hits → direct `FALLBACK_MESSAGE`, geen reclassify-LLM-call, geen general-LLM-call |

Bij toggle UIT spaart de pipeline 1 reclassify-LLM-call (~$0.0001) altijd, en bij category=general daarbovenop nog de general-antwoord-LLM-call. Bij toggle AAN is gedrag identiek aan huidig v0.5.

## Architectuur — data flow

### Client (chat-shell)
- Nieuwe state: `const [generalKnowledgeOn, setGeneralKnowledgeOn] = useState(bot.generalKnowledgeEnabled);`
  - Initial waarde = bot-default; in-memory; geen localStorage.
  - Bij wisselen van bot-versie via dropdown vindt page-refresh plaats (via `router.push('/?v=...')`), dus state wordt automatisch ge-init op de nieuwe bot-default — geen extra effect nodig.
- POST-body naar `/api/v0/chat` krijgt extra veld: `enableGeneralKnowledge: boolean`.
- `SettingsView` krijgt prop `generalKnowledgeOn` + `onToggleGeneralKnowledge` + `disabled = !botFlags.generalKnowledgeEnabled` (nieuwe key in `botFlags`).

### Server (route + pipeline)
- `app/api/v0/chat/route.ts`:
  - Body-type uitgebreid met `enableGeneralKnowledge?: unknown`.
  - Parse: `const enableGeneralKnowledge = body.enableGeneralKnowledge !== false;` — default true, voor backwards-compat met oudere clients/scripts.
  - Doorgegeven aan `runRagQueryStreaming({ ..., enableGeneralKnowledge })`.
- `lib/v0/server/rag.ts`:
  - `RunRagInput` (de input-type van `runRagQueryStreaming`) krijgt veld `enableGeneralKnowledge: boolean`.
  - Gate in zero-hits-branch (rond regel 1595) wijzigt van `if (bot.generalKnowledgeEnabled)` naar `if (bot.generalKnowledgeEnabled && enableGeneralKnowledge)`.
  - Else-tak (`FALLBACK_MESSAGE` zonder LLM) blijft ongewijzigd.
  - `ChatResponse` varianten `answer` en `fallback` krijgen veld `generalKnowledgeActual: boolean | null`:
    - `true` als het reclassify-pad mocht draaien (bot supports + user didn't opt out).
    - `false` als bot het niet ondersteunt OF user zette uit én we actief aan zero-hits-pad bezig waren.
    - `null` voor paden waar reclassify überhaupt niet aan de orde was: smalltalk, en non-zero-hits `answer` waar retrieval gewoon hits gaf. Semantiek "actual" = "wat heeft pipeline gedaan in de zero-hits-tak"; buiten die tak = niet relevant.

### Logging
- `lib/v0/server/log.ts`:
  - `logQuery` insert krijgt extra kolom `general_knowledge_actual`.
  - Waarde komt van `response.generalKnowledgeActual` (boolean voor `answer`/`fallback`-varianten; voor smalltalk wordt `null` geschreven).

### Migration
- Nieuwe SQL-file: `supabase/migrations/<NNNN>_v0_general_knowledge_logging.sql`.
- Migration-nummer bepaald via `check-migration` skill direct vóór aanmaken (niet vastleggen in design — voorkomt nummer-collision met parallele branches).
- DDL:
  ```sql
  ALTER TABLE query_log
    ADD COLUMN general_knowledge_actual boolean;
  ```
- Nullable: bestaande rijen krijgen `NULL` (= "niet bekend"; voor pre-toggle-data klopt dat).
- Geen index — laag-cardinaal, eval filtert eerst op `bot_version`.
- Geen RLS-wijziging — `query_log` heeft al policies.

## Surface-detail — SettingsView

Nieuwe `ToggleRow` onder "Pipeline-opties", net na `Smart pre-processing`:

```tsx
<ToggleRow
  label="Algemene-kennis-antwoorden"
  desc="Bij zero-hits beantwoordt de bot algemene vragen binnen ons domein (extra LLM-call ≈ $0.0001-0.0003). Uit = directe fallback zonder LLM-call."
  on={generalKnowledgeOn}
  onChange={onToggleGeneralKnowledge}
  disabled={!botFlags.generalKnowledgeEnabled}
/>
```

`ToggleRow` ondersteunt al `disabled` (zie regel 158 settings-view.tsx). Bij disabled toont hij een grijze switch en negeert clicks — geen extra UI-werk.

`botFlags` (gepasseerd vanaf `app/page.tsx` → `chat-shell` → `settings-view`) krijgt nieuwe key `generalKnowledgeEnabled: bot.generalKnowledgeEnabled`.

## Files te raken

- `app/components/settings-view.tsx` — nieuwe `ToggleRow`, disabled-prop, `botFlags`-uitbreiding
- `app/components/chat-shell.tsx` — state, prop-doorgeef, body-veld in POST
- `app/page.tsx` — `botFlags.generalKnowledgeEnabled` toevoegen aan props
- `app/api/v0/chat/route.ts` — body parse + doorgeef aan `runRagQueryStreaming`
- `lib/v0/server/rag.ts` — input-type, gate-condition, `generalKnowledgeActual` op final response
- `lib/v0/server/log.ts` — insert-kolom + type-uitbreiding (`QueryLogInput`)
- `supabase/migrations/<NNNN>_v0_general_knowledge_logging.sql` — nieuwe migration
- `tests/v0/v05-general-knowledge.spec.ts` — extra case: toggle-uit + zero-hits → `kind='fallback'` + geen reclassify-call
- `docs/CHATBOT_REFERENCE.md` — kort regelje "v0.5+: per-vraag override via `enableGeneralKnowledge` body-veld; default true"

## Telemetrie-semantiek

Veld `general_knowledge_actual` in `query_log`:

| Waarde | Betekenis |
|--------|-----------|
| `null` | Pad niet relevant (smalltalk, of pre-migration legacy-rij) |
| `true` | Reclassify-pad mocht draaien — bot ondersteunt het en user opt-in |
| `false` | Reclassify-pad geskipt — bot ondersteunt het niet OF user opt-out |

Dit volgt het `hyde_mode_actual`-patroon: "actual" = wat de pipeline daadwerkelijk deed, niet wat de gebruiker requestte.

Voor analyse later: voor v0.5+ rijen met `general_knowledge_actual=false` zien we "user heeft toggle uit gezet". Voor v0.1–v0.4 zien we ook `false` maar dan via `bot_version` te onderscheiden.

## Test-strategie

**Unit/integration (Vitest, `tests/v0/v05-general-knowledge.spec.ts`):**
- Bestaande cases blijven werken (toggle aan = huidig gedrag).
- Nieuwe case: bot=v0.5, query=zero-hits, body `enableGeneralKnowledge=false` → response `kind='fallback'` met `FALLBACK_MESSAGE`, en mock van LLM-client wordt **niet** aangeroepen voor reclassify.

**Geen eval-uitbreiding** — eval volgt bot-default. Dat houdt eval-budgets stabiel.

**Smoke-test handmatig:**
1. v0.5 + toggle aan + "wat is MKB?" → general-antwoord met disclaimer.
2. v0.5 + toggle uit + "wat is MKB?" → FALLBACK_MESSAGE, ~0.5s sneller, geen extra cost in usage-footer.
3. v0.4 + open settings → toggle is disabled / grijs.

## Risico's / open items

- **Geen risico voor multi-tenancy / RLS** — alleen UI-state + 1 nullable kolom + 1 if-conditie. Geen security-laag geraakt.
- **Backwards-compat clients/scripts:** door default-true bij ontbrekend body-veld blijven `v0:chat` en eval-runner ongewijzigd werken.
- **Type-veiligheid `generalKnowledgeActual`:** moet op alle `ChatResponse`-varianten consistent zijn (`answer` en `fallback` minimaal; smalltalk mag `false`).
- **Migration-nummer:** via `check-migration` skill bepalen vlak voor aanmaken om collision met parallele branches te voorkomen.
