# PORTING.md — ChatManta overzetten naar een andere code-agent

> **Passieve hedge, ongetest.** Je gebruikt Claude Code (CC) gewoon door. Dit bestaat
> zodat je bij een probleem (prijs, kwaliteit, outage, policy) binnen ~1-2 dagen kunt
> overstappen naar bijv. Codex zónder opgebouwde context te verliezen. Het is een sterke
> kaart, geen 1-klik-route — reken op verrassingen bij MCP-config en memory-inlees.

## De generieke ontsnappingskaart staat elders
Het volledige, project-onafhankelijke draaiboek (concept-mapping CC→Codex, MCP-reconfig,
hoe je je opgebouwde *memory* leesbaar maakt voor een andere agent, welke CC-features géén
equivalent hebben) staat in de privé dotfiles-backup:

- Lokaal: `~/.claude/PORTING.md`
- Repo: **github.com/Zoutig/claude-config** (privé) → `PORTING.md`
- Je opgebouwde ChatManta-kennis (memory-store) zit daar onder
  `projects/C--Users-solys-Documents-Code-chatmanta/memory/`

Lees die eerst. Hieronder alleen de **ChatManta-specifieke** punten.

## Wat een nieuwe agent in deze repo direct kan
- **`AGENTS.md`** = de inhoudelijke projectinstructies, agent-neutraal. Codex/Cursor/Aider
  lezen dit native. `CLAUDE.md` importeert alleen `@AGENTS.md` + een graphify-sectie.
- Let op CC-specifieke verwijzingen in `AGENTS.md` (skills, worktrees, `EnterWorktree`,
  `superpowers:`): die betekenen niets voor een andere agent. Negeren, niet overtikken.

## ChatManta-specifiek bij een overstap
- **MCP-servers in gebruik**: `supabase`, `vercel`, `playwright`, `context7` (+ `codex`
  zelf). Opnieuw configureren in de nieuwe agent + opnieuw inloggen — keys/tokens zitten
  bewust NIET in de backup (Vercel-env / password manager als bron).
- **Migraties**: eigen tooling (`npm run migrate`), géén `supabase db push`. Nieuw nummer =
  hoogste `supabase/migrations/NNNN_*.sql` lokaal én in open PRs checken. RLS-policies horen
  in dezelfde migration. Dit zijn hard rules — staan in `AGENTS.md`.
- **V0-sandbox-disclaimer**: `/api/v0/*`, `lib/v0/*` draaien op een gedeeld demo-wachtwoord
  zónder per-user identiteit. STOP NOOIT echte klantdata in een V0-org. Zie `AGENTS.md`.
- **Guardrails die CC-hooks waren** (herexpresseren als regels/CI in de nieuwe agent):
  nooit direct naar `main` pushen (feature-branch + PR), worktrees voor parallel werk,
  `.next/` wissen vóór een verificatie-build op Windows.
- **graphify-graaf** (`graphify-out/`, gitignored): regenereerbaar met `graphify update .`.

## Onderhoud
Deze hedge vraagt geen dagelijkse discipline. De `~/.claude`-backup commit+pusht zichzelf
per sessie. Wil je ooit échte zekerheid: draai één keer een echte taak in Codex op deze
repo en werk dit doc bij met wat tegenviel.
