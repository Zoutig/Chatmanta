# Handoff — V1 volledig afmaken (autonome orchestrator) — 2026-06-29

## ⚡ Resume in 30 seconds
> Plak in een **verse sessie**, vanuit `C:\Users\solys\Documents\Code\chatmanta` (hoofd-repo, op `main`):
> **"Lees `docs/handoffs/HANDOFF_2026-06-29_v1-volledig-afmaken.md` en voer 'm uit: jij bent de V1-completion-orchestrator."**

- **Branch:** `main` (tip `c645b20`, 0 achter) · **Worktree:** hoofd-repo. Schoon (alleen pre-existing untracked).
- **State:** V1-fundament + RAG + crawler + cache + **onboarding (#219) + klant-settings/account (#220) + document-upload (#221)** draaien live op `main`, op **gpt-4o-mini**. Migraties V1 = **0001–0006** toegepast op V1-prod (`tfijdnxqdvwzwgxdioqo`).
- **NEXT ACTION:** lees dit doc + `docs/V1_STATUS_EN_PLAN.md` + geheugen `project_v1_strategy`. Stel dan eerst de **Start-vragen** (§hieronder) aan Sebastiaan. Bouw daarna **autonoom** de milestones M-A → M-F af, elk via de vaste per-slice-loop. Eindig met de **Eindlijst voor Sebastiaan**.

---

## 🎯 Jouw opdracht (orchestrator)
Maak **V1 code-compleet volgens blueprint §1.5** ("V1 Minimal Build Scope"), autonoom, via gedelegeerde subagents. Sebastiaan heeft het kader vastgelegd (4 parameters hieronder). Jij praat met Sebastiaan; subagents doen het werk. Pure ops/legal die geen agent kán doen → in de Eindlijst, niet zelf proberen.

## 🔧 Operating-model — VAST (niet heropenen)

**De 4 kader-beslissingen (Sebastiaan, 2026-06-29):**
1. **Scope = álles uit blueprint §1.5** (volledige bindende V1-scope, niet alleen must-haves).
2. **Volledig autonoom:** pas migraties zélf toe op V1-prod (Supabase MCP) + merge zélf naar `main` na een groene 2-lens-review — **zonder tussentijds te vragen**. Leg élke live-DB-wijziging + merge vast voor de Eindlijst. (V1-prod heeft nu alleen test/seed-data → lage blast-radius.)
3. **Minimaal billable:** leun op de 2-lens reviews + **non-billable** smokes (zoals de Storage-upload-smoke). Draai GEEN automatische billable eval/LLM-runs tijdens de bouw. De V1-antwoordkwaliteit-eval (gpt-4o-mini) zet je als losse, expliciete stap in de Eindlijst.
4. **Beslis met veilige default + flag:** bij een product-/design-keuze mid-build kies je de conservatieve/aanbevolen optie, bouw door, en noteer de keuze in de Eindlijst (zodat Seb 'm kan nalopen/omkeren). Geen tussentijdse stops daarvoor.

**De per-slice-loop (exact wat de vorige sessie 3× clean deed):**
1. **Recon** — een gerichte `Workflow` (1–3 agents) leest het V0-precedent + de huidige V1-code + de hard rules → scherpe, implementeerbare bevindingen + open micro-beslissingen. **Verifieer migratie-nummer zelf** (lokaal `ls supabase/migrations-v1/`); recon-agents lezen soms een stale branch.
2. **Spec** — schrijf een implementer-spec (`docs/<SLICE>_SPEC.md`) ín de slice-worktree, met file-voor-file build + hard rules + "wat NIET" + verificatie.
3. **Worktree** — `git worktree add -b feat/seb/v1-<slug> ../chatmanta-v1-<slug> origin/main` → `cp .env.local ../chatmanta-v1-<slug>/.env.local` → `npm ci` (background).
4. **Implementer** — één `general-purpose` agent (background), werkt UITSLUITEND in de worktree, bouwt per spec, draait `tsc`/`test:unit`/schone build (`Remove-Item -Recurse -Force .next` eerst) + grep-gate, **geen billable**, commit klein, **migratie alleen schrijven (niet toepassen)**, niet pushen.
5. **2-lens review** (parallel, op de worktree-diff `git -C <worktree> diff origin/main...<branch>`): (a) **`chatmanta-reviewer`** (hard-rules-lens), (b) **`general-purpose` correctness/security-lens**. De correctness-lens ving in élke slice echte bugs die de static-groene build miste — neem 'm serieus.
6. **Fix-agent** — verwerk de echte bevindingen (verifieer ~1-2 false-positives zelf); re-verifieer groen.
7. **Migratie-apply** (als de slice er een heeft): lees het 0007+-bestand, `mcp__plugin_supabase_supabase__apply_migration(project_id="tfijdnxqdvwzwgxdioqo", name, query)` + **`_migrations`-ledgerrij** via `execute_sql` (`insert into public._migrations (id, applied_at) values ('<filename-stem>', now())`). Verifieer met `list_migrations` + `get_advisors`. *(Pooler is geblokkeerd vanaf deze machine → MCP is het kanaal, zie [[migrate_network_block_prod]].)*
8. **Non-billable smoke** (waar zinvol) — bewijs de nieuwe integratie zonder embedding/LLM (bv. service-role-script).
9. **Merge** — `git push -u origin <branch>` → `gh pr create --base main --head <branch> --body-file <scratchpad>` → `gh pr merge <PR> --squash --delete-branch`. De lokale-branch-delete faalt zolang de worktree 'm vasthoudt (verwacht; server-side merge slaagt — check `gh pr view --json state`).
10. **Cleanup** — `git worktree remove --force ../chatmanta-v1-<slug>` + `git branch -D feat/seb/v1-<slug>` + `git fetch --prune`.

**Hard rules (AGENTS.md — nooit schenden):** `organization_id NOT NULL` + RLS+policies in dezelfde migratie op elke tenant-tabel; service-role **alléén** via `getV1ServiceRoleClient()`/`getJorionAdminClient()`; **SA-1** existentie/404-guard op elke service-role-action met client-input-ID; **org uit `getSessionOrg()`** (sinds #219), nooit uit client/env; geen secrets in `NEXT_PUBLIC_*`; anti-hallucinatie boven volledigheid. **V0-sandbox is bewust niet multi-tenant-veilig — raak `lib/v0/**`/`app/api/v0/**`/`/v0` NIET aan.**

---

## ❓ Start-vragen aan Sebastiaan (stel deze VÓÓR M-B widget; bouw M-A er niet op)
Front-load deze (`AskUserQuestion`), bouw daarna autonoom:
1. **Widget-look:** vaste default-styling (FAB-kleur/positie), of **per-org configureerbare kleur** (V0-widget had een kleurkiezer)? *Default-aanbeveling als 'ie niet kiest: vaste nette default + 1 per-org accentkleur uit settings.*
2. **Cost-guardrails-getallen (§1.5 #12):** per-org **dag-budget** (de geheugen-default was trial €0,50 / paid €5 — V1 kent alleen `standard`-tier) + **valuta**: V1 `query_log` logt `cost_usd` → budget afdwingen op USD (geen migratie) of `cost_eur` toevoegen (FX)? *Aanbeveling: USD-cap nu, `cost_eur` = V2.* + bevestig `conversations_per_month: 300` hard-block (blueprint-default).
3. **Eventuele andere product-defaults** die je tijdens de recon tegenkomt en die zijn oordeel vragen — verzamel ze en stel ze in deze ene start-ronde, niet druppelsgewijs.

---

## ✅ Done (de basis waarop je bouwt)
- **Fundament + RAG-kernel + crawler + answer_cache** (PR's #208–#218, migr 0001–0003) — op gpt-4o-mini, neutrale client-geïnjecteerde `lib/rag/**`.
- **#219 onboarding** (migr 0004 `audit_logs`): `createClientOrganization` (Jorion-admin) + magic-link-invite (`verifyOtp`/`/v1/auth/confirm`) + **`getSessionOrg()`-keystone** (org uit sessie). Admin-UI = create-form + orgs-lijst.
- **#220 klant-settings + account + engine-wiring** (migr 0005 `chatbots.settings jsonb`): settings beïnvloeden het antwoord (`buildChatbotOverrides` → `runRagQuery`); account = echte Supabase Auth + org-naam-action. Default-toon = neutral.
- **#221 document-upload** (migr 0006 `v1-documents`-bucket): signed-Storage-upload + magic-bytes → `ingestDocument`.
- **#222 docs** — `docs/V1_STATUS_EN_PLAN.md` + AGENTS.md/blueprint op gpt-4o-mini.

## 🏗️ Wat nog moet — V1-milestones (geordend, dependency-bewust)
Elk via de per-slice-loop. Migratie-nummers lopen door vanaf **0007**.

- **M-A · Telemetrie-fundament (§1.5 #10 + #14-IP-hashing).** Port `logQuery` naar het V1-pad zodat `query_log` echt geschreven wordt (nu leeg) + **IP-hashing** (geen plain IPs). Klein, geen klant-UI. Fundament voor de budget-cap (M-C) + admin-telemetrie (M-D). Precedent: V0 `logQuery` in `lib/v0/server/log.ts`. *Mogelijk migratie 0007 als je `cost_eur` toevoegt — anders geen (kolommen bestaan).*
- **M-B · Widget publieke laag (§1.5 #7 + #8-embed-code + #13-allowed-domain). DE grote klant-zichtbare brick.** Vanilla launcher (`widget.js`) + iframe + `/embed/[slug]` + **publieke token-gated `/api/v1/chat`** (HMAC session-token 1u, fail-closed) + **allowed-domain-check** + basic rate-limit + embed-code in het klantdashboard. **`allowed_domains`-opslag = migratie 0007/0008** (kolom `text[]` op `chatbots`, Jorion-beheerd, géén klant-editor — §1.5). **Sterk V0-precedent om te porten:** `/embed`, `/api/v0/chat`, `/api/v0/widget/token`, `/widget.js`, `lib/widget/origin-allowlist.ts`, het embed-token-model (`EMBED_TOKEN_SECRET`), [[widget_embed_public_api]] + [[widget_v1_proofing_p1]] + [[widget_embed_iframe_gotchas]]. **Zet `sourceLinksEnabled` per-surface UIT voor de widget** (nu globaal `true` — zichtbare bronnen in widget = §1.5-V2).
- **M-C · Cost guardrails + rate-limit (§1.5 #12).** Upstash per-org rate-limit op `askV1` + de widget-`/api/v1/chat` + crawler-actions (fail-safe-wrapper bestaat: V0 `lib/v0/server/rate-limit*` + #174) + **per-org dag-budget-cap** (post-call aggregate op de gelogde cost; getallen uit Start-vraag 2) + **`conversations_per_month: 300` hard-block**. Hangt op M-A (telemetrie) + M-B (widget om te limiteren). Geheugen: [[v1_rate_limit_hardening]] + [[project_budget_limits_v1_v2]].
- **M-D · Admin-dashboard rest (§1.5 #9).** Op de M1-admin (`/v1/admin/organizations` lijst + create): **org-deep-dive** (org-info + chatbots + kennisbronnen + gesprekken/kosten-deze-maand uit `query_log` + recente errors) + **jobs-pagina + retry-knop**. Cross-org via `getJorionAdminClient()` ná `requireJorionAdmin()` (Jorion is geen member → RLS geeft anders 0 rijen). V0-precedent: `app/admindashboard/**` (UI-skelet porten, niet de CRM-laag). Hangt op M-A.
- **M-E · Observability + AVG-code (§1.5 #11 + #13 + #14).** Sentry-wiring + basic redaction (DSN = ops); **admin-2FA-AAL2-check** in `requireJorionAdmin` (de MFA-enrollment zelf = ops); **handmatige verwijder/export-actie** via Jorion-admin (AVG). UptimeRobot = puur ops.
- **M-F · Integratie-verificatie + Eindlijst.** Eén schone `tsc`/`test:unit`/build/grep-gate over `main`; loop de §1.5-checklist af (alles ✓ of bewust-deferred); stel de **Eindlijst voor Sebastiaan** samen (template hieronder, aangevuld met alles wat je onderweg flagde).

## 🧠 Beslissingen & rationale (vast — niet heropenen)
- **V1 = gpt-4o-mini.** Haiku + de `callLLM`/`streamLLM`-provider-abstractie + automatische fallback = **V2**. De engine roept `openai()` direct aan; de stub mag stub blijven. (Bevestigd 2026-06-29; AGENTS.md §Stack + blueprint §1.5 #3/§18 zijn bijgewerkt.)
- **Deferrals uit eerdere slices die nú landen:** `allowed_domains` (→ M-B widget), per-org rate-limit/budget (→ M-C), admin-deep-dive/jobs (→ M-D), logQuery-port (→ M-A).
- **Migraties via MCP** (pooler-block), niet `npm run migrate`. **Niet als gestackte sub-PR's** bouwen (squash-merge sluit de volgende stacked PR — zie [[squash_merge_workflow]]); één PR per slice, sequentieel.

## ⚠️ Dead-ends & valkuilen (niet herhalen)
- **Invite:** `inviteUserByEmail` is server-geïnitieerd → gebruik **`verifyOtp({token_hash,type})`**, NIET `exchangeCodeForSession`. Vereist een Supabase **email-template met `{{ .TokenHash }}`** (ops, staat in de Eindlijst).
- **Storage-bucket zónder `allowed_mime_types`** (storage-js negeert `contentType` op een browser-File → `.md`=octet-stream wordt 400-geweigerd); validatie = magic-bytes + ext + `file_size_limit`.
- **Vercel hard-capt server-action-bodies op 4,5MB** → grote uploads/payloads via signed-URL/direct, niet door een action.
- **`recon-agent leest soms een stale branch`** → verifieer migratie-nummer + de huidige `getSessionOrg`-code zelf in de worktree.
- **Schone `.next` vóór elke build** (Windows native-worker-crash op vervuilde `.next`).
- **`gh pr merge` vanuit een worktree** faalt op de lokale main-checkout maar **mergt server-side wél** — verifieer met `gh pr view --json state`.
- **Merge-classifier:** kan ondanks "volledig autonoom" alsnog één bevestiging vragen per merge — dat is een harness-safety, geen jouw gate; ga door zodra 'ie groen is.
- **Worktree-absolute-paden:** edit/write altijd onder de slice-worktree-root, nooit `C:\Users\solys\Documents\Code\chatmanta\...` vanuit een slice (pre-edit-hook "OUTSIDE worktree" = serieus nemen).

## 📋 Eindlijst voor Sebastiaan — TEMPLATE (vul aan met alles wat je onderweg flagde)
**Ops / accounts (geen agent kán dit):**
- [ ] **Supabase invite-email-template** (V1-prod): `{{ .TokenHash }}` → `/v1/auth/confirm` (default `{{ .ConfirmationURL }}` werkt niet) → dán de invite→login smoke.
- [ ] **Crawler in prod:** `FIRECRAWL_API_KEY` + `CRON_SECRET` op Vercel-V1 + externe pinger op `/api/v1/cron/process-crawls`.
- [ ] **Sentry**-project + DSN op Vercel-V1; **UptimeRobot**-monitor.
- [ ] **Upstash**-creds voor V1 (als niet gedeeld met V0) — voor de rate-limit van M-C.
- [ ] **Admin-2FA:** Supabase-MFA enrollen op je Jorion-admin-account.
- [ ] **leaked-password-protection** aanzetten (Supabase Auth, advisory-WARN).
- [ ] **Supabase Pro + PITR** op V1-prod vóór echte klantdata.
- [ ] **AVG/legal:** DPA's tekenen, privacyverklaring + sub-verwerkers-lijst online, **MX op chatmanta.com** (mail-ontvangst).

**Verifiëren (de orchestrator deed dit autonoom — loop na):**
- [ ] Elke **auto-toegepaste migratie** (0007+) + elke **auto-merge** naar `main` (lijst die de orchestrator bijhoudt).
- [ ] **Widget** op een echte testsite (HMAC-token + allowed-domain + rate-limit).
- [ ] Flagde **default-keuzes** (widget-look, budget-getallen, …) — akkoord of omkeren.

**Aanbevolen, billable (bewust draaien):**
- [ ] **V1-antwoordkwaliteit-eval** op gpt-4o-mini (de prod-gate/hard-eval) — valideer dat de V1-bot goed + anti-hallucinatie-veilig antwoordt vóór de eerste klant.

## 🗂️ Git & environment snapshot
- `main` @ `c645b20`, 0 achter origin. Schoon (alleen pre-existing untracked: `.agents/`, `docs/handoffs/`, drawio's, `.claude/skills/`).
- Worktrees: hoofd-repo (`main`) + `../chatmanta-devcontainer` (los, niet-V1). Geen V1-slice-worktrees open.
- Lokaal-only commits: geen. Open PRs: alleen **#207** (devcontainer, niet-V1).
- Background tasks / dev servers: geen draaiend.
- V1-DB `tfijdnxqdvwzwgxdioqo`: migr 0001–0006 toegepast, RLS overal, `is_jorion_admin=true` op `member@example.com` (test-admin).

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git checkout main; git pull --ff-only        # is al up-to-date
# .env.local heeft de V0_/V1_/V1_SEED_-vars. Per slice: nieuwe worktree off origin/main + npm ci + cp .env.local
```

## 📎 Context pointers
- **Lees-volgorde bij start:** dit doc → `docs/V1_STATUS_EN_PLAN.md` (status + plan per component, met bewijs) → geheugen `project_v1_strategy` (volledige V1-tijdlijn + werkmodel) → AGENTS.md (hard rules + commando's).
- **Geheugen:** [[project_v1_strategy]] · [[v1_rate_limit_hardening]] · [[project_budget_limits_v1_v2]] · [[resend_email_config]] · [[squash_merge_workflow]] · [[migrate_network_block_prod]] · [[widget_embed_public_api]] · [[widget_v1_proofing_p1]] · [[codex_mcp_model_chatgpt_account]].
- **MCP V1-project:** `tfijdnxqdvwzwgxdioqo` ("ChatManta V1-prod"). **NOOIT** het V0-project `emaoajcjfvnbasbiucpd`.
- **Blueprint §1.5** = de bindende scope-autoriteit; `c:\Users\solys\Documents\Claude\Projects\Jorion Solutions\Concept_Blueprint_ChatManta.md`.
