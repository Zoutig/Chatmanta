# Handoff — V1 Kickoff fundament (voorbereiding) — 2026-06-09

## ⚡ Resume in 30 seconds
> Paste in een verse sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta`:
> **"Lees `docs/handoffs/HANDOFF_2026-06-09_v1-kickoff-fundament.md` en ga verder waar ik gebleven ben."**

- **Branch:** `feat/seb/v1-prep` · **Worktree:** `C:\Users\solys\Documents\Code\chatmanta` (hoofd-repo, geen wegwerp-worktree)
- **State:** V1-kickoff-spec **goedgekeurd + gecommit** (`8283f22`). Geen code gebouwd. Volgende stap = implementatieplan, daarna bouwen. Jij wilt het bouwen zelf in een nieuwe sessie doen.
- **NEXT ACTION:** Lees de spec `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md` (vooral §0 + §4), draai dan `superpowers:writing-plans` om er een stap-voor-stap bouwlijst van te maken. Begin de bouw met **PR-1 (orgId-fix)** in een nieuwe worktree.

## 🎯 Goal
Sebas wil binnenkort V1 bouwen en wilde eerst **volledig voorbereid** zijn: grote readiness-analyse + opschoningen + welke plannen opnieuw te brainstormen. De sessie is geëindigd in een **goedgekeurde, geconsolideerde kickoff-spec** voor de eerste V1-mijlpaal ("fundament-only"), plus housekeeping. Het daadwerkelijke bouwen doet Sebas zelf in een aparte sessie.

## ✅ Done
- **Readiness-analyse** — de 5 bestaande V1-docs (06-02) afgezet tegen de échte staat op `origin/main` (vandaag). Conclusie: v0.10 heeft het meeste "prep" al geshipt; wat rest is klein + scherp.
- **Housekeeping** — verse branch `feat/seb/v1-prep` van `origin/main`; 16 ongecommitte V1-planningsdocs + `DPA_CONCEPT_v0.md` veiliggesteld (`fb72b4c`); root-PNG-clutter gitignored (zie gotcha: deels door jou teruggedraaid); dode `feat/seb/intake-skill-spec` (al gemerged als #152) opgeruimd.
- **Brainstorm → spec** — fundament-only kickoff-ontwerp doorlopen en vastgelegd in `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md` (`8283f22`). Bevat 3 codebase-vondsten die de oude plannen misten.

## 🚧 Where I left off (the live thread)
- Spec is geschreven, self-reviewed, gecommit en door jou goedgekeurd. De brainstorm-skill zou normaal doorgaan naar `writing-plans`, maar jij koos: **bouwen in een nieuwe sessie**. Dus de implementatieplan-stap is bewust **niet** gedaan — dat is het eerste wat de nieuwe sessie oppakt.
- Niets staat half-af in code. Geen dirty tracked files van V1-prep.

## ▶️ Next steps (ordered)
1. **Lees de spec** `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md` (§0 gewone taal, §4 de werkblokken).
2. **`writing-plans`** → maak het implementatieplan voor de fundament-ronde.
3. **Bouw PR-1 — `runRagQuery` orgId niet-optioneel** in een **nieuwe worktree** (vraag Sebas: zichtbaar `Documents/Code/` vs verstopt `.claude/worktrees/`). Files: `lib/v0/server/rag.ts` (defaults op regels 469/543/583/815 + `?? DEV_ORG_ID` op 1507) + callers. Nu-mergebaar in V0.
4. **Bouw PR-2 — service-role-client-consolidatie** (~20 ad-hoc `createClient(SERVICE_ROLE_KEY)` → één fabriek via `lib/supabase/admin.ts`). Gedragsbehoudend; rook de dashboard-/budget-/crawler-oppervlakken.
5. **Daarna pas** §3 (V1-prod Supabase-project + namespace-split + grep-gate) en §4 (auth e2e bewijzen). Dat is de eigenlijke fundament-bouw.

## 🧠 Decisions & rationale
- **In-place V1 (geen greenfield)** — bevestigt `2026-05-25-v1-codebase-strategie-design.md`; behoudt RAG-tuning + eval-historie + de al-gebouwde auth-laag.
- **Fundament-only scope** — V1 is te groot voor één spec; eerste mijlpaal = 2 Supabase-projecten + auth e2e bewezen, dan stoppen en herplannen. Verworpen: "alles tot eerste klant live" (verlammingsrisico, ~50 blockers).
- **Supabase: huidig=V0 (gratis), nieuw=V1-prod start op gratis tier → Pro pas vlak vóór echte klantdata.** Jij koos kosten-bewust; zonder echte data zijn auto-pause/PITR nog niet kritiek. (Eerst koos je Pro-direct, daarna omgezet naar gratis-eerst.)
- **Aanpak A: prep-first** — goedkope de-risking (orgId-fix + client-consolidatie) eerst mergen in V0, dán auth bewijzen. Verworpen: fundament-eerst (vangrail arriveert te laat) en wegwerp-spike (dubbel werk; auth-code bestáát al).
- **Model-keuze + DPA bewust UIT deze ronde** — horen bij latere mijlpalen; fundament-only snoeit ze weg.

## ⚠️ Dead-ends & gotchas (don't repeat)
- **De strategie-doc-aanname "schrijf de grep-gate nu, hij is groen" KLOPT NIET.** Geverifieerd: er is geen `lib/v0/supabase/`-split, V0 gebruikt `@/lib/supabase/admin`, en **~20 modules bouwen elk hun eigen service-role-client** buiten `admin.ts` (o.a. `lib/v0/klantendashboard/server/*`, `lib/commandcenter/server/*`, `lib/controlroom/server/db.ts`, `lib/v0/server/budget.ts`). Daarom is de grep-gate naar §3 verplaatst en is PR-2 (consolidatie) de echte prerequisite. Dit is dé reden dat de oude plannen bijgesteld zijn — verifieer claims, neem ze niet over.
- **Parallelle-sessie-race op deze branch.** `feat/seb/v1-prep` bevat een **vreemde commit** `1124eac chore(agents): eval-runner` + een **untracked** `.claude/agents/chatmanta-reviewer.md` die NIET uit deze V1-sessie komen (een parallelle CC-sessie heeft ertussen gewerkt). Mijn V1-commits (`fb72b4c`, `8283f22`) zijn intact en bovenop doorgebouwd — niets verloren. Beslis in de nieuwe sessie of die agent-bestanden op deze branch horen of verplaatst moeten; raak ze niet zomaar aan.
- **`.gitignore` /*.png-regel teruggedraaid.** Ik voegde `/*.png` toe (in commit `fb72b4c`), maar jij/een linter haalde 'm daarna weer uit de working tree (bewust — niet terugdraaien). Gevolg: de 12 root-screenshots zijn weer untracked + `.gitignore` heeft een ongecommitte wijziging. Laat staan tenzij je 'm anders wilt.
- **CRLF-ruis (Windows).** `git diff --no-index` meldt "DIFFERS" op identieke bestanden puur door LF/CRLF. Gebruik `tr -d '\r'` om echte verschillen te zien. Drie docs bleken zo identiek aan origin/main en zijn verwijderd vóór de branch-switch.
- **Branch is 1 commit achter `origin/main`** (origin bewoog tijdens de sessie). Rebase vóór een PR.

## ❓ Open questions / waiting on Sebastiaan
- **Worktree-locatie** voor de bouw: zichtbaar (`Documents/Code/chatmanta-v1-prep`) vs verstopt (`.claude/worktrees/`)? (Sebas kiest dit bewust — niet stilletjes.)
- **Branch-strategie voor de bouw:** verder op `feat/seb/v1-prep` (bevat de spec + de vreemde agent-commit), of een schone branch van `origin/main` en de spec cherry-picken (`8283f22`)? Spec is nog **niet gepusht** — alleen lokaal bereikbaar.
- **Open execution-details** staan in spec §6 (route-group-namen, env-var-naming V0_*/V1_*, plek van `cc_*`/`admin_*`-tabellen onder de split) — beslissen bij de bouw, niet nu.

## 🗂️ Git & environment snapshot
- Behind origin/main: **1** commit (rebase vóór PR).
- Uncommitted: alleen `?? .claude/agents/chatmanta-reviewer.md` (van parallelle sessie) + een ongecommitte `.gitignore`-wijziging (jouw /*.png-terugdraai).
- Local-only (unpushed) commits op `feat/seb/v1-prep`: `8283f22` (spec, mijn), `1124eac` (eval-runner, parallelle sessie), `fb72b4c` (docs-preservation, mijn).
- Open PRs: **geen**.
- Background tasks: **geen** gestart deze sessie.
- Dev server: **niet draaiend** (poorten 3000-3003 vrij).

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout feat/seb/v1-prep
# spec + planningsdocs staan hier al gecommit; .env.local is aanwezig in de hoofd-repo
# voor de bouw: maak een worktree (vraag locatie), npm ci daar, dev: npx next dev -p 3001
```

## 📎 Context pointers
- **Spec (lees dit eerst):** `docs/superpowers/specs/2026-06-09-v1-kickoff-fundament-design.md`
- **Achtergrond V1-plannen:** `docs/V1_PRODUCTIEWAARDIGE_CHATBOT_CRITERIA.md` · `docs/V0_10_V1_READY_CRITERIA.md` · `docs/superpowers/specs/2026-05-25-v1-codebase-strategie-design.md` · `docs/WIDGET_V1_READINESS.md` · `docs/DPA_CONCEPT_v0.md`
- **Memory:** [[project_v1_strategy]] · [[project_v1_auth_spike]] · [[project_v1_launch_plan]] · [[v1_rate_limit_hardening]] · [[project_budget_limits_v1_v2]] · [[feedback_always_ask_worktree]] · [[feedback_worktree_location_choice]] · [[parallel_session_branch_shift]] · MEMORY.md
- **Geverifieerde codepunten:** `lib/v0/server/rag.ts` (DEV_ORG_ID-defaults) · `lib/supabase/admin.ts` (service-role-wrappers) · `lib/auth.ts` (dormant auth) · `lib/ai/llm.ts:103-109` (callLLM gooit nog 'not implemented' — V1-werk, buiten fundament) · `supabase/migrations/0001_core_tenancy.sql`
- **Dubbele migratienummers** (info, niet blokkerend voor V1-baseline): 0039/0040/0044 op main; V1-prod krijgt een gecureerde baseline dus draagt dit niet mee.
