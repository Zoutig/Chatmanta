# Implementation Plans

Gegenereerd door de improve-skill (volledige repo-audit) op 2026-07-02, tegen commit `628e7df`.
Voer uit in onderstaande volgorde tenzij de dependency-notes anders zeggen. Elke executor:
lees het plan volledig vóór je begint, respecteer de STOP-condities, en werk je statusrij bij.

Audit-methode: 9 parallelle categorie-agents + ponytail-over-engineering-scan over ~113K regels TS,
elke bevinding adversarieel geverifieerd (33/33 overeind, 0 weerlegd), top-bevindingen daarna
handmatig herbevestigd in de bron. Alle bewijs-excerpts in de plannen komen uit eigen reads.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Unit-test glob-runner + `verify`-commando (8 wees-tests weer actief, o.a. SSRF/origin/embed-token) | P1 | M | — | DONE (0f9eb5a) |
| 002  | axios/form-data HIGH-advisories fixen (via firecrawl) | P1 | S | — | DONE (6325032) |
| 003  | Follow-up-chips uit `activeAnswerText` (anti-hallucinatie-lek) | P1 | S | — | DONE (5cf7b63) |
| 004  | check-env + AGENTS.md/ONBOARDING/HANDOFF waarheidsgetrouw + Node-pin | P1 | S | — | DONE (afcbd3c) |
| 005  | Timing-safe CRON_SECRET-helper voor 5 cron-routes | P2 | S | 001 (zacht) | DONE (d0c1e56) |
| 006  | Answer-cache stale-write-race: epoch-guard (⚠️ Step 0 = akkoord Sebastiaan, migraties) | P2 | M | akkoord Seb | DONE (e0f60e0; migr 0054+0021 op prod) |
| 007  | Tests op de V1 PII-poorten: embed-token HMAC + contact-validatie-extractie | P2 | M | 001 | DONE (c31bdc3+fb66d24) |
| 008  | Ponytail-opruiming: nanoid, EUR-kostentabel, crawler-utils dedup (~170 r, −1 dep) | P3 | S | 001 (zacht) | DONE (6268817+d6f7c19+4d53a54) |
| 009  | migrate.mjs: checksum-drift-detectie + TLS-certvalidatie | P2 | M | — | DONE (1e9b6fb; TLS teruggedraaid — CA-cert nodig, zie eindrapport) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (met één regel reden) | REJECTED (met één regel rationale)

## Dependency notes

- **005 en 007 na 001**: hun nieuwe testfiles worden pas automatisch gedraaid door de glob-runner uit 001. Zonder 001 kan het ook, maar dan moet de file handmatig aan de package.json-lijst.
- **008 na 001** (zacht): de crawl-ssrf-test staat na 001 op z'n definitieve plek; 008 verwijst ernaar.
- **006 heeft een harde menselijke gate**: datamodel-wijziging (nieuwe tabel + RPC in beide DB's) — Sebastiaan moet Step 0 expliciet goedkeuren. Let ook op migratienummer-collisiecheck met open PRs.
- 002, 003, 004, 009 zijn volledig onafhankelijk en kunnen parallel (in aparte worktrees).

## Backlog — geverifieerde bevindingen zonder plan (op aanvraag uit te werken)

| Bevinding | Categorie | Effort | Notitie |
|---|---|---|---|
| Command Center-assistent: onvolledig gepersisteerde tool-results bricken een thread permanent (`app/api/commandcenter/assistant/route.ts:174,196,114`) | bug | M | Interne tooling; fix = placeholder-tool-result per tool_call + onvolledige turns filteren bij history-reconstructie |
| `/home` laadt de WebGL-shader-lib eager terwijl login 'm lazy-load (`app/components/home/hub-background.tsx:17`) | perf | S | Wrap in `next/dynamic({ssr:false})` naar het model van `login-background.tsx:31` |
| Dashboard-gesprekslijsten over-fetchen volledige `response`-JSONB + ongebounde `.in()` (`lib/v0/klantendashboard/server/conversations.ts:71,224`) | perf | S | Smalle projectie `response->>kind` + expliciete `.limit()`; recap.ts-claim was onjuist (HEAD-count) |
| RAG hydrateert filename+parent per query-branch i.p.v. één keer na de merge (`lib/rag/run-rag-query.ts:754,784,2089`) | perf | M | ~3× onnodige DB-round-trips per multi-query-beurt |
| Crawl-ingest embed max 50 pagina's strikt sequentieel (`lib/v1/crawler/processCrawl.ts:135`) | perf | M | Bounded pool (4-5); begrensd door MAX_CRAWL_PAGES=50 |
| Dubbele embed van de originele vraag op het no-rewrite-pad (`lib/rag/run-rag-query.ts:1469,1685`) | perf | S | Hergebruik cacheEmbedVector als queryvector wanneer queryForEmbed===original |
| `authFail`-helper 12× gekopieerd in V1-actions, deels gedivergeerd | tech-debt | S | Eén export vanuit `lib/errors/action.ts` |
| 4 V1-actions omzeilen actionTry → fouten bereiken `admin_error_groups` nooit (`app/v1/app/gesprekken/actions.ts:90` e.a.) | tech-debt | M | Wrap in actionTry met meta |
| RAG-kernpad heeft alleen een regex-tripwire, geen gedragstest (anti-hallucinatie-fallback ongetest) | tests | M | Characterization-tests met gestubde vector-search; **voorwaarde** voor de god-file-split hieronder |
| God-file `lib/rag/run-rag-query.ts` (2944 r, generator van 1747 r) splitsen | tech-debt | L | Pas ná characterization-tests; hoog regressierisico |
| God-component `chatmanta-widget.tsx` (2067 r, 54 hooks) splitsen | tech-debt | L | Custom hook voor transport/streaming + subcomponenten |
| V0/V1-duplicatie: 26 geforkte componenten, ~10 lib-modules; V1 leunt via 63 imports op 21 klantendashboard-modules | tech-debt | L | Gedocumenteerd bewust (import-only reuse, fork-pad gepland); eerstvolgende stap = alleen de byte-identieke `firecrawl.ts` dedupliceren |
| Naming-split route `/admindashboard` vs `lib/controlroom` vs `app/actions/controlroom.ts` | tech-debt | S | Mechanische rename óf pointer-comments |
| Lint-schuld: 36 errors / 33 warnings (vooral `react-hooks/set-state-in-effect`, `no-explicit-any` in scripts) — daarná lint in `verify` + CI | dx | M | Gemeten 2026-07-02; tweede helft van bevinding tests-05 |
| Gecrawlde/geüploade content bereikt de answer-LLM zonder expliciete "bron = data, geen instructies"-afbakening | security | M (investigate) | LOW-confidence; eerst blootstelling onderzoeken (UGC-pagina's?); her-eval nodig bij promptwijziging |
| `@ark-ui/react` (hele lib voor één popover) → native popover-API | tech-debt | S | Vereist visuele UX-check van de accent-picker vóór verwijdering |
| Timing-safe-compare bestaat nu 4× (cron-auth, auth-cookie, embed-token V0/V1) — consolideer naar één helper in `lib/security` | tech-debt | S | Uit batch-code-review 2026-07-03; embed-token V0/V1-kopieën zijn bewuste conventie, dus alleen deels consolideerbaar |
| ~37 oudere scripts (`scripts/cc/*` e.a.) lezen nog oude unprefixed Supabase-env-namen die check-env niet meer valideert | dx | S | Uit batch-code-review 2026-07-03; stragglers migreren naar V0_/V1_-namen óf oude namen als soft-check terugzetten |
| TLS-certvalidatie migrate.mjs open (`rejectUnauthorized:false`) — `ssl:true` faalt op de Supabase-CA (self-signed chain) | security | S | Uit plan 009: CA-cert downloaden (Dashboard → Database → SSL) en MIGRATE_SSL_CA-variant bouwen+testen; vergt menselijke go |
| V1-prod-ledger heeft migraties 0017-0020 (admin_*) zónder repo-file — reconstrueren of expliciet documenteren | tech-debt | M | Ontdekt 2026-07-03; out-of-band toegepast tijdens de autonome orchestrator-run, files nooit gecommit |

## Direction — opties voor Sebastiaan (bewust geen plannen; productkeuzes)

1. **V1 lead-notificatie ontbreekt** — de klant vult een `notificationEmail` in maar niets verstuurt ooit mail; V0's `notifyNewContactRequest` bestaat al (S; scherpste quick win vóór launch — voor een lead-capture-product ís de melding het product).
2. **V1 heeft geen PII-retentie/auto-delete** — V0 heeft een retentie-cron, V1 niet; de beloofde 90d-delete op contact_requests is niet gebouwd (M; AVG-relevant, hoort bij het launch-kritieke pad).
3. **"Algemene kennis"-toggle is in V1 hard uitgezet** zonder klant-optie, terwijl V0 'm per org bood; de wiring bestaat al (S; bewuste productkeuze — expliciet maken).
4. **Meerdere chatbots per org** — het hele datamodel is al chatbot-scoped; alleen resolutie+UI zijn 1-op-1 (L; design-spike, pas bij klantvraag).
5. **V1-klantrecap** ("wat deed mijn bot deze maand") — V0 heeft de recap-PDF, V1 heeft de data al (M; retentie-touchpoint, kan ná eerste klant).

## Findings considered and rejected

- **e2e retries:0 + LLM-flakiness**: grotendeels moot — e2e draait niet in CI en de LLM-specs zijn expliciet local-only gedocumenteerd; alleen de 2 permanent-geskipte "glass"-tests zijn ooit opruimwaardig.
- **recap.ts:104 JSONB-over-fetch**: weerlegd — dat is een HEAD-count zonder rijen; de success-rate-cap is bewust gedocumenteerde V0-tradeoff.
- **bots.ts (1081 r) archiveren**: append-only registry is by design (?v=-vergelijk); pas handelen als de file echt hindert. Telling gecorrigeerd: 15 snapshots, niet 22.
- **`firecrawl.ts` nu dedupliceren**: byte-identiek maar bevat de API-koppeling (363 r) — bewust uitgesteld tot na de utils-dedup (plan 008).
- **postcss-moderates (npm audit)**: build-time via next; "fix" is een breaking next-downgrade — niet doen, verdwijnt bij een next-upgrade.
- **V0-sandbox multi-tenancy, threshold 0.4, callLLM-stub, pre-push soft-gate, admin_*-zonder-RLS**: gedocumenteerde tradeoffs — bewust niet geauditeerd als bevinding.

## Niet geauditeerd (scope-grenzen van deze run)

SQL-migraties zijn niet regel-voor-regel op schema-niveau geverifieerd; de INJECTION_PATTERNS-lijst is niet op bypass-kwaliteit getest; exacte bundle-groottes zijn niet gemeten (geen build-analyzer gedraaid); `docs/superpowers/`-artefacten alleen steekproefsgewijs; e2e-suites zijn statisch gelezen, niet uitgevoerd. Typecheck (groen), lint (36 errors) en npm audit (3 high prod) zijn wél echt gedraaid.
