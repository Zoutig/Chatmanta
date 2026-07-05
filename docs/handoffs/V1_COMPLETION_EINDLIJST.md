# V1-completion — Eindlijst & autonome-actie-log (live bijgewerkt)

## ⚠️ Update 2026-07-04 — dashboards zijn ver voorbij §1.5-minimaal gegaan

Dit document is geschreven t/m 2026-06-30, rond de §1.5-code-compleet-mijlpaal. Sindsdien zijn **drie dashboard-PR's** gemerged die delen van de tekst hieronder achterhalen:

- **PR #233** (`bbb86f9`, migr 0010-0012) — V1-klantdashboard naar V0-pariteit: Overzicht/Preview/Widget/Gesprekken/Contactverzoeken.
- **PR #234** (`33afe4d`, migr 0013-0016) — V1-klantdashboard verder naar V0-pariteit: Q&A + Top-Vragen + Quiz + Feedback.
- **PR #236** (`b9f4d71`, migr 0017-0020) — V1-admindashboard naar V0-pariteit: usage, bot-prestaties, maandelijkse recap, feedback, issues, onboarding, quiz en de 8-tab klant-deep-dive.

Concreet: de gesprekken-viewer (incl. detail), contactverzoeken, feedback en quiz — die in de sectie "Bewust V2" hieronder nog als bewust-uitgesteld staan — bestaan inmiddels wél in het V1-klantdashboard. De regel bij M-B ("Bewust V2-uitgesteld: thumbs-feedback, contact-capture, …") sloeg destijds op de publieke widget zelf, niet op het dashboard — dat onderscheid staat er nog, maar was makkelijk te verwarren met de dashboard-features die er nu wél zijn.

Resterende gaten (widget-levenscyclus, correctieloop, admin-cockpit, telemetrie-surfacing e.d.) zijn uit een 5-agent-onderzoek naar voren gekomen en staan uitgewerkt in **`docs/DASHBOARD_GAPS_PLAN_2026-07.md`** — dat plan wacht nog op een go van Sebastiaan.

Blueprint §1.5 zelf staat buiten deze repo (`Concept_Blueprint_ChatManta.md`) en is door deze update **niet** aangepast — dat moet Sebastiaan zelf doen als hij de scope-tekst wil laten kloppen met wat er inmiddels gebouwd is.

> Orchestrator-run gestart 2026-06-29. Bouwt M-A→M-F autonoom (handoff `HANDOFF_2026-06-29_v1-volledig-afmaken.md`, kader: scope=§1.5-volledig, autonoom migreren+mergen, niet-billable, default+flag). Elke live-DB-migratie + merge wordt hier vastgelegd.

## Start-vragen — Sebastiaans antwoorden (2026-06-29)
1. **Widget-look:** volledig per-org configureerbaar (kleur/positie via `chatbots.settings`).
2. **Dag-budget:** admin-configureerbaar, **default $1/dag** → geïmplementeerd als **€1/dag** (cap op `cost_eur`). ⚑ FLAG: $1 vs €1 — ~8% verschil, backstop; pas aan als je exact $1 wilt.
3. **Valuta:** **`cost_eur` nu toevoegen** (override van de handoff-aanbeveling USD-now). cost_eur = `cost_usd × vaste FX` (USD_EUR_RATE, default 0.92). ⚑ FLAG: vaste FX, geen live koers; `MODEL_COSTS` (EUR) spiegelt nu nog de USD-tabel → echte EUR-rates = V2.
4. **Maand-cap:** **300 gesprekken/maand** hard-block (code-constant).

## Auto-migraties toegepast op V1-prod (`tfijdnxqdvwzwgxdioqo`) — NALOPEN
| Migr | Slice | Toegepast | Verificatie |
|---|---|---|---|
| 0007 cost_eur+ip_hash | M-A | ✅ 2026-06-29 (MCP) | kolommen aanwezig (cost_eur NOT NULL def 0, ip_hash text); ledger-rij; advisors clean (alleen pre-existing INFO + leaked-pw WARN); smoke `v1:test-log` groen |
| 0008 chatbots.allowed_domains | M-B | ✅ 2026-06-29 (MCP) | kolom aanwezig (text[]); ledger-rij; advisors clean; non-billable runtime-smoke 8/8 (token/auth/embed/injection) |
| 0009 organizations.daily_budget_eur | M-C | ✅ 2026-06-29 (MCP) | kolom aanwezig (numeric(10,2) NOT NULL def 1.0); beide seed-orgs backfilled €1.00; ledger; advisors clean; smoke `v1:test-limits` groen |

## Auto-merges naar `main` — NALOPEN
| PR | Slice | Squash | State |
|---|---|---|---|
| #223 | M-A telemetrie | `bd82c7f` | MERGED 2026-06-29 |
| #224 | M-B widget | `5cc1412` | MERGED 2026-06-29 |
| #225 | M-C cost guardrails | `28f7eea` | MERGED 2026-06-29 |
| #226 | M-D admin-dashboard (geen migratie) | `141de57` | MERGED 2026-06-30 |
| #227 | M-E observability + AVG (geen migratie) | `35c841e` | MERGED 2026-06-30 |
| #228 | V1-eval-harness (geen migratie) | `8d137da` | MERGED 2026-06-30 |
| #229 | admin audit-log-viewer (§1.5 #9 restgat, geen migratie) | `ab9c936` | MERGED 2026-06-30 |

## Geflagde default-keuzes (akkoord of omkeren)
- €1/dag budget-default (zie #2 hierboven).
- Vaste USD→EUR FX 0.92 (zie #3).
- conversations_per_month = code-constant 300 (niet per-org instelbaar) — flag als je per-org override wilt.
- **M-B widget-token TTL = 30 min** (V0-default; widget refresht auto op 401). Je noemde "1u" → zet `EMBED_TOKEN_TTL_SEC=3600` op Vercel-V1 als je echt 1u wilt.
- **M-B deploy-sequencing (belangrijk):** de publieke `/api/v1/chat` is live zodra M-B mergt; M-B kreeg een **per-IP rate-limit** (V0 Upstash-limiter) als cost-guard. **Zet GEEN echte klant-widget (echt domein/echte KB) live vóór M-C** (per-org rate-limit + dag-budget-cap = de echte backstop). V1-prod heeft nu geen klanten → window acceptabel.
- **M-B widget-scope:** §1.5-minimaal (FAB + streaming chat + per-org kleur/positie/header/welkom/launcher). Bewust V2-uitgesteld: thumbs-feedback, contact-capture, gesprek-historie-drawer, logo-upload, org-skins.

## Carry-over naar latere slices (door de orchestrator mee te nemen)
- **M-C:** per-ORG rate-limit + dag-budget-cap (cost_eur) + 300/mnd; **gebruik een vertrouwde XFF-hop** (`x-real-ip`/`x-vercel-forwarded-for`), niet de eerste XFF-hop (M-B's per-IP doet dat nog wél, zoals V0). Budget-cap leest `query_log.cost_eur` (M-A).
- **Toekomst (lib/rag, lage prioriteit):** `answer_cache`-key mist een surface-discriminator → askV1 (sourceLinksEnabled aan) en widget (uit) delen cache; M-B dekt dit af met `linkify=false` in de widget-render (toont nooit klikbare links). Echte fix = surface-discriminator in de cache-key.
- **V2:** `detectInjection` gradueren naar een neutrale `lib/rag`-detector (M-B importeert 'm nu uit `lib/v0`, glue-laag — gate-toegestaan).

## Ops / accounts (geen agent kán dit) — overgenomen uit de handoff, aangevuld onderweg
- [ ] Supabase invite-email-template (V1-prod): `{{ .TokenHash }}` → `/v1/auth/confirm`, dán invite→login smoke.
- [ ] Crawler in prod: `FIRECRAWL_API_KEY` + `CRON_SECRET` op Vercel-V1 + externe pinger op `/api/v1/cron/process-crawls`.
- [ ] `IP_HASH_SALT` op Vercel-V1 (M-A — zonder salt nog steeds gehasht, maar zwakker).
- [ ] `USD_EUR_RATE` op Vercel-V1 (optioneel; default 0.92).
- [ ] Sentry-project + DSN op Vercel-V1 (M-E); UptimeRobot-monitor.
- [ ] Upstash-creds voor V1 (M-C rate-limit) als niet gedeeld met V0.
- [ ] Admin-2FA: Supabase-MFA enrollen op Jorion-admin-account (M-E AAL2-check dwingt af).
- [ ] leaked-password-protection aanzetten (Supabase Auth, advisory-WARN).
- [ ] Supabase Pro + PITR op V1-prod vóór echte klantdata.
- [ ] AVG/legal: DPA's, privacyverklaring + sub-verwerkers online, MX op chatmanta.com.

## Aanbevolen, billable (bewust draaien)
- [x] **V1-antwoordkwaliteit-eval GEDRAAID 2026-06-30** (kosten $0,0047 bot-gen + $0 Claude-judge-panel). Thin runner `scripts/v1-eval-run.ts` + fixture `eval-fixtures/v1-eval-cases.json` (untracked) drijven het ECHTE V1-pad (`runRagQuery`, disableCache) tegen de Manta-seed-corpus; 15 cases (grounded/anti-hallucinatie/cross-org-isolatie/off-topic/injectie); 15-koppig onafhankelijk Claude-judge-panel. **Uitslag: 13 pass / 2 partial / 0 fail, 0 safety-failures.** Grounded 6/6 correct+gegrond; cross-org-isolatie + injectie + off-topic 5/5 (géén canary-leak, GK bleef uit). **2 partials (h1/h4) = watch-item:** de bot doet soms een plausibele maar ONGEFUNDEERDE negatieve bewering ("wij leveren niet aan huis", "op kerstdag gesloten") i.p.v. puur door te verwijzen — milde anti-hallucinatie-softness op negatieve claims, géén verzonnen specifieke feiten, géén blocker. **Tuning-suggestie (V2/per-klant):** strengere grounding-gate op negatieve assertions; her-evalueren op een ECHTE klant-KB (thin seed-corpus is niet representatief voor antwoordkwaliteit op schaal).

## Slice-voortgang
- **M-A telemetrie:** ✅ KLAAR + LIVE (PR #223, migr 0007). Autonomie-niveau: Seb koos **"volledig autonoom"** (migraties + merges zelf, loggen in deze lijst).
- **M-B widget:** ✅ KLAAR + LIVE (PR #224, migr 0008). 3-lens review (hard-rules+correctness+security) → 4 fixes; non-billable smoke 8/8. Per-IP rate-limit + injection hersteld; per-org+budget = M-C.
- **M-C cost guardrails:** ✅ KLAAR + LIVE (PR #225, migr 0009). 2-lens review → 2 fixes (null-budget→€1, discover rate-limit); smoke groen.
- **M-D admin-dashboard:** ✅ KLAAR + LIVE (PR #226, geen migratie). 2-lens clean + 4 NIT-fixes; non-billable admin-smoke 7/7 (incl. non-admin "Geen toegang").
- **M-E observability + AVG:** ✅ KLAAR + LIVE (PR #227, geen migratie). 2-lens (extra scrutiny op delete+auth) → 1 BLOCKER (Sentry cookie/IP-lek) + 4 IMPORTANT gefixt; non-billable AVG-smoke 20/20 (export+delete tegen wegwerp-org, DB-bevestigd cascade+audit). Sentry no-op tot DSN; AAL2 activeert bij MFA-enroll.
- **M-F integratie-verificatie + Eindlijst:** ✅ KLAAR. Geïntegreerde main `35c841e`: `tsc` clean + `test:unit` 121/121 (grep-gate groen) + **schone productie-build geslaagd** (alle nieuwe V1-routes gecompileerd: /api/v1/chat, /api/v1/widget/token, /embed-v1/[slug], /v1/admin/{organizations,jobs}, /v1/admin/organizations/[id]/export, /api/v1/cron/process-crawls; + public/widget-v1.js). Live V1-prod: migr 0001–0009 geledgerd, seed-orgs intact, advisors clean (pre-existing INFO + leaked-pw WARN).

## §1.5 V1-scope — code-compleet
Alle §1.5-items zijn nu **code-compleet** op V1 (live op main + V1-prod). Resterend = puur OPS/LEGAL + de aanbevolen billable eval (zie secties hierboven/onder).
| §1.5 | Item | Status |
|---|---|---|
| #1 | Invite-only onboarding (Jorion-admin) | ✅ #219 |
| #3 | V1 = gpt-4o-mini | ✅ (geen provider-werk; Haiku=V2) |
| #5 | Document-upload (signed Storage) | ✅ #221 |
| #7/#8/#13 | Widget + embed-code + allowed-domain | ✅ M-B #224 |
| #9 | Jorion-admin dashboard (deep-dive + jobs + **audit-log-viewer**) | ✅ M-D #226 + audit-viewer #229 |
| #10 | Telemetrie / usage-log (query_log) | ✅ M-A #223 |
| #11 | Sentry (+ UptimeRobot=ops) | ✅ code M-E #227 (DSN=ops) |
| #12 | Cost guardrails (rate-limit + 300/mnd + dag-budget) | ✅ M-C #225 |
| #14 | AVG-basis (IP-hashing + admin-2FA-check + delete/export) | ✅ code M-E (MFA-enroll/DPA/MX=ops/legal) |
| — | Crawler in prod (V1-hardening) | ✅ code; cron-env + pinger = ops |
| — | Klant-settings/account | ✅ #220 |

**Bewust V2 (correcte scope, géén gap):** hybrid search, ~~lead-capture/contactverzoeken~~ ⚠️ *achterhaald, zie Update 2026-07-04 — contactverzoeken zijn inmiddels wél in het V1-klantdashboard te bekijken (PR #233)*, zichtbare bronnen in widget, Cohere rerank, ~~thumbs-feedback~~ ⚠️ *achterhaald, zie Update 2026-07-04 — feedback-tab bestaat inmiddels in het dashboard (PR #234)*, per-chatbot prompts, tiering, `callLLM`/`streamLLM` + Haiku-provider-abstractie + auto-fallback + EUR-billing-precisie.

## ⛳ Status: V1 = CODE-COMPLEET volgens §1.5 (2026-06-30)
5 build-slices (M-A→M-E) gemerged (#223–#227), 3 migraties (0007–0009) toegepast op V1-prod, M-F-verificatie groen, V1-eval geslaagd (#228), én het laatste §1.5-restgat (admin audit-log-viewer, §1.5 #9) gedicht (#229). **Alle 14 §1.5-items zijn nu code-compleet.** Wat rest is uitsluitend ops/legal — geen code meer.
> ⚠️ Deze statuskop dekt alleen de §1.5-backend-scope t/m 2026-06-30. De dashboards zijn ná deze datum via #233/#234/#236 nog fors uitgebreid — zie de Update 2026-07-04 bovenaan dit document en `docs/DASHBOARD_GAPS_PLAN_2026-07.md`.
> Optioneel lokaal: `graphify update .` (gitignored, AST-only) om de graaf bij te werken na deze build.
