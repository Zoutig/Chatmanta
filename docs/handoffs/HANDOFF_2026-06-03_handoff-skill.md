# Handoff — handoff-skill aanmaken — 2026-06-03

## ⚡ Resume in 30 seconds
> Paste in een verse sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta`:
> **"Lees `docs/handoffs/HANDOFF_2026-06-03_handoff-skill.md` en ga verder waar ik gebleven ben."**

- **Branch:** feat/seb/intake-skill-spec · **Worktree:** C:\Users\solys\Documents\Code\chatmanta (hoofd-repo)
- **State:** Skill `~/.claude/skills/handoff/SKILL.md` is geschreven + gevalideerd (gather-block draait clean). Deze handoff is de dogfood-demo.
- **NEXT ACTION:** Beoordeel het format van deze demo-handoff; beslis of je `/handoff` zo wil houden of secties wil schrappen/toevoegen.

## 🎯 Goal
Een `/handoff`-skill bouwen die op commando één Markdown-bestand maakt waarmee een verse sessie exact verder kan waar deze stopte. Sebastiaan vroeg expliciet om zelf nuttige toevoegingen te bedenken.

## ✅ Done
- Skill geschreven → `C:\Users\solys\.claude\skills\handoff\SKILL.md` (global personal skill, NIET in deze repo).
- Gemodelleerd naar de `close`-skill (chatmanta-aware PowerShell, vaste templates, common-mistakes-tabel).
- Gather-block gevalideerd op deze repo; één echte bug gevonden + gefixt (zie Dead-ends).
- Deze demo-handoff geschreven naar `docs/handoffs/` als end-to-end validatie.

## 🚧 Where I left off (the live thread)
- Skill is functioneel compleet. Laatste stap was de dogfood-demo schrijven (= dit bestand).
- Nog niet gedaan: Sebastiaan's akkoord op het format; eventueel secties trimmen.

## ▶️ Next steps (ordered)
1. Format van deze demo reviewen — te veel/te weinig secties?
2. Optioneel: skill committen. LET OP: de skill staat in `~/.claude/skills/`, niet in deze git-repo — er is hier niks te committen voor de skill zelf. Versiebeheer van skills loopt apart.
3. Optioneel: deze demo-handoff weggooien (`docs/handoffs/` is untracked scratch).

## 🧠 Decisions & rationale
- **Naam = `handoff`** (niet `handoff-session`) — consistent met `/close` (kort slash-command). Rejected langere naam.
- **Opslag = `docs/handoffs/` in de repo** — door Sebastiaan gekozen via AskUserQuestion. Rejected globaal `~/.claude/handoffs/` (overleeft worktree-cleanup maar staat los van project) en "allebei" (twee bestanden bijhouden).
- **Bron-van-waarheid = de agent, niet git** — kerninzicht in de skill: git toont *wat*, alleen de sessie houdt *waarom* + *waar-ik-stopte*. Anti-pattern "thin handoff" expliciet tegengegaan met een self-check.
- **Niet auto-committen** — handoffs zijn scratch; aanbieden, Sebastiaan beslist (zelfde lijn als `close` die nooit auto-commit).

## ⚠️ Dead-ends & gotchas (don't repeat)
- **`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` is onbetrouwbaar voor upstream-detectie.** Bij een branch zonder upstream echo't git de letterlijke string `@{u}` naar stdout én exit 128 → een truthiness-check op stdout denkt ten onrechte dat er een upstream is. **Fix: branch op `$LASTEXITCODE`, niet op stdout.** (De `close`-skill gebruikt nog het oude stdout-patroon — mogelijk dezelfde latente bug op deze git-versie, niet aangeraakt deze sessie.)

## ❓ Open questions / waiting on Sebastiaan
- Akkoord op het handoff-format, of secties aanpassen?
- Wil je dat ik de `close`-skill ook fix voor dezelfde `@{u}`-bug? (Vereist eigen test op die skill — niet ongevraagd gedaan.)

## 🗂️ Git & environment snapshot
- Behind origin/main: 20 commits
- Uncommitted: alleen pre-existing untracked docs/PNG's (niet van deze sessie); deze nieuwe demo-handoff
- Local-only (unpushed) commits: c812620 (intake-spec, niet van deze sessie)
- Open PRs: #171 v0.10 (draft) · #170 hybrid keyword OR
- Background tasks still running: geen
- Dev server: niet draaiend

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout feat/seb/intake-skill-spec
# Skill bewerken: open ~/.claude/skills/handoff/SKILL.md (buiten de repo)
```

## 📎 Context pointers
- Skill-bestand: `C:\Users\solys\.claude\skills\handoff\SKILL.md`
- Zuster-skill als referentie: `C:\Users\solys\.claude\skills\close\SKILL.md`
- Memory: [[squash_merge_workflow]] · MEMORY.md
