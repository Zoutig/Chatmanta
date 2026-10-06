# ChatManta — Agent-landmijnen

_Gedistilleerd uit de opgebouwde sessie-kennis op 2026-07-06 (51 items); aangevuld op
2026-10-05 met een tweede memory-sweep (alles tegen de code geverifieerd). Levend document —
vul aan wanneer een nieuwe val is uitgevonden; corrigeer wanneer de code is veranderd._

Duurzame technische valkuilen en empirie voor iedereen (AI-agent of mens) die in deze
codebase werkt **zonder toegang tot de sessie-memory**. Elk item: symptoom / oorzaak / wat
te doen, met bron tussen haakjes (PR-nummer of memory-slug).

Dit document is een aanvulling op `AGENTS.md` — de hard rules (RLS, multi-tenancy,
service-role-discipline, SA-1, vector-isolatie, V0-sandbox-disclaimer), de basis-worktree-
regels, de migratie-nummercheck en de threshold-0.4-empirie staan dáár en worden hier niet
herhaald. Alles hieronder is een niet-voor-de-hand-liggende val die je zonder deze kennis
opnieuw instapt.

> Let op: memory-observaties zijn punt-in-tijd. Bij een concrete file/regel/kolom: verifieer
> read-only tegen de huidige code vóór je erop bouwt.

---

## Stack & Build

**Tailwind v4 PostCSS stript hele selector-blokken (niet alleen properties)**
Symptoom: CSS-regels verdwijnen volledig uit de geserveerde bundle (`curl` op de chunk = 0
occurrences), hard reload/dev-restart helpt niet (dus géén cache-issue).
Oorzaak: een `.dark`-class-selector gecombineerd met een `[data-style="…"]`-attribuut-selector
ín een file met `@custom-variant dark (…)` bovenaan — de compiler leest `.dark` als
Tailwind-variant en botst met de rauwe class-selector.
Wat te doen: zet zulke scoped overrides in een **aparte CSS-file** (zoals `app/styles/manta.css`
doet, dat overleeft wél); voor losse properties volstaat de inline-`style`/`<style>`-bypass uit
AGENTS.md. (memory: tailwind_v4_postcss_quirk)

**Next.js metadata-route-filenames breken `next build` maar niet `next dev`**
Symptoom: `next dev` rendert prima, `next build` faalt met "Default export is missing in
icon.tsx" / `…--route-entry.js`.
Oorzaak: bestandsnamen `icon`/`favicon`/`apple-icon`/`opengraph-image`/`twitter-image`/
`sitemap`/`robots`/`manifest` onder `app/` zijn gereserveerd door de metadata-route-conventie
(naast de routing-specials page/layout/route/etc.).
Wat te doen: geef herbruikbare componenten een plurale/prefixed naam (`icon.tsx`→`icons.tsx`)
of plaats ze buiten een route-segment. (memory: nextjs_metadata_route_filename_collision)

**`next dev` verbergt build-brekers algemeen — verifieer met een echte build**
Symptoom: dev groen, maar `next build` faalt (excess-property TS2353, metadata-collisie,
etc.); soms dook na het fixen van veld 1 pas veld 2 op.
Oorzaak: dev is lakser dan de build; tsc meldt maar de eerste excess-property per object-
literal. Erger: **Vercel deployt alleen de main-tip**, dus één buildfout op main blokkeert de
prod-deploy van álle eronder gemergede PR's.
Wat te doen: draai altijd een echte `npm run build` vóór merge; op Windows eerst `.next` wissen
(`Remove-Item -Recurse -Force .next`) — een door een dev-server vervuilde `.next` geeft een
native worker-crash (exit `0xC0000409`/`3221226505`) in static-gen die op een code-bug lijkt
maar het niet is; een groene build op vervuilde `.next` is net zo onbetrouwbaar als een rode.
(memory: nextjs_metadata_route_filename_collision, windows_next_build_dirty_next_crash)

**`'use server'`-modules: elke export moet een `async function` zijn**
Symptoom: "export not found" op de client / 500.
Oorzaak: een plain `export function` die een promise teruggeeft is niet toegestaan in een
server-actions-module.
Wat te doen: maak elke export in zo'n file `async function`. (PR #139, memory: error_issues_system_v0)

**Vercel 4,5MB body-cap negeert `bodySizeLimit` → geen server-action-multipart-upload**
Symptoom: grotere file-uploads via een server-action falen ondanks een verhoogde limiet.
Oorzaak: Vercel kapt de request-body op ~4,5MB, ongeacht Next's `bodySizeLimit`.
Wat te doen: upload via een **signed upload-URL** rechtstreeks naar Storage, niet via
server-action-multipart; valideer met magic-bytes + ext-allowlist. (PR #221, memories:
niels_punchlist_2026_06, project_v1_strategy)

**pdf-parse is v2.4.5 (rewrite) + serverExternalPackages**
Symptoom: v1-API (`pdfParse(buffer)` default-export) bestaat niet; bundler-crash
"module-not-found" op de dynamische import.
Oorzaak: v2 API = `import { PDFParse }` → `new PDFParse({data}).getText()` → `.destroy()`;
pdfjs onder de motorkap.
Wat te doen: gebruik de class-API en zet `pdf-parse` + `mammoth` in `serverExternalPackages`
(next.config). (PR #148, memory: controlroom_admin_dashboard_v0)

**`.map(fn)` breekt zodra `fn` een optionele 2e parameter krijgt**
Symptoom: na het toevoegen van een optionele boolean aan een helper gedragen bestaande
`.map(helper)`-callsites zich ineens anders (of tsc klaagt).
Oorzaak: `Array.map` geeft `(item, index, array)` door — de index belandt in je nieuwe parameter.
Wat te doen: wrap expliciet, `.map((c) => toSource(c))` (zo staat het in `lib/rag/run-rag-query.ts`).
(PR #168, memory: project_prod_gate_eval)

**Next overschrijft een al-gezette env-var niet vanuit `.env.local`**
Symptoom: je wilt lokaal een integratie uitschakelen (bv. mails niet echt versturen) door de key
leeg te zetten in `.env.local`, maar de oude waarde blijft actief — of andersom.
Oorzaak: Next laadt `.env*` alleen voor vars die nog níet in de proces-omgeving staan.
Wat te doen: zet de var in de shell vóór `next dev` (PowerShell: `$env:RESEND_API_KEY=''`), of
herstart vanuit een schone shell. (memory: niels_punchlist_2026_06)

**`.env.local` sourcen in bash lekt secrets naar de output; check of keys niet uitgecommentarieerd zijn**
Symptoom: `source .env.local` (of `set -a; . .env.local`) print waarden of voert regels uit als
commando — secrets belanden in de sessielog. Los daarvan: een worktree-smoke-test/eval faalt pas
halverwege omdat `OPENAI_API_KEY` als `# OPENAI_API_KEY=…` in `.env.local` staat.
Oorzaak: regels met een spatie na `=` worden door de shell als commando geïnterpreteerd; en
`.env.local` is gitignored, dus elke worktree heeft een eigen (mogelijk verouderde) kopie.
Wat te doen: lees env alleen via `node --env-file=.env.local …` of een node-parser, nooit via
shell-sourcing. Vóór LLM-afhankelijk werk in een worktree: controleer alléén de var-*namen*
(`grep -oE '^[A-Z_]+=' .env.local`), niet de waarden. (memories: herstart_2026_10,
feedback_worktree_env_keys, feedback_autonomous_build_no_signoff_skill)

**Scripts: `process.exit()` slaat `finally` over; import van een script met top-level `main()` = side-effect**
Symptoom: test-cleanup draait niet (achtergebleven test-rijen maskeren een volgende kapotte run);
of het importeren van één constante uit een ander script draait diens hele seed opnieuw.
Oorzaak: `process.exit` beëindigt direct; een script dat bij import `main()` aanroept voert dat
uit bij elke import.
Wat te doen: in scripts `throw` + `finally` + pre-clean op een herkenbare naam; deel constanten via
een los modulebestand (zoals `scripts/v1-iso-token.ts`). (PR #213/#214, memory: project_v1_strategy)

**eslint `react-hooks/purity` + `set-state-in-effect` zijn streng**
Symptoom: lint-fouten op `Date.now()` tijdens render of `setState` in een effect-body.
Wat te doen: leg "nu" vast in een event-handler (bv. de `onChange` van een periode-select), niet
in render of een effect. NB: de lint-baseline op main is niet groen — beoordeel alleen of je
eigen diff nieuwe fouten toevoegt. (memories: controlroom_admin_dashboard_v0, audit_2026_07_full)

## Supabase & migraties

**`npm run migrate` bereikt prod soms niet vanaf de dev-machine → ledger-drift**
Symptoom: pooler `aws-0-eu-west-1.pooler.supabase.com` resolvt via DNS maar TCP-connect naar
`:5432` én `:6543` timet out; directe host `db.<ref>.supabase.co` = ENOTFOUND.
Oorzaak: uitgaande Postgres-poort dicht op sommige netwerken of Supabase Network Restrictions —
puur netwerk, niet de creds. Migraties worden dan out-of-band toegepast → `public._migrations`
loopt uit de pas + een deploy-before-migrate-venster met HTTP 400's.
Wat te doen: is de pooler bereikbaar (het is **niet permanent** geblokkeerd), gebruik gewoon
`npm run migrate`. Zo niet: pas toe via Supabase MCP `execute_sql` en repliceer `migrate.mjs`
atomair — DDL + `insert into public._migrations(id) values ('<file-id>') on conflict do nothing`
in dezelfde call — en commit het echte `.sql`-bestand. Directe MCP-write naar prod vereist
expliciete user-autorisatie. (PR #190, memories: migrate_network_block_prod, audit_fixbatch_2026_07)

**`migrate.mjs` draait op `rejectUnauthorized:false`**
Symptoom/oorzaak: `ssl:true` faalt op de self-signed Supabase-CA-chain.
Wat te doen: laat het staan tenzij je een CA-cert-variant (`MIGRATE_SSL_CA`) opzet; de runner
heeft wél sha256-checksum-drift-detectie (fail-loud) en een gebackfilde V0+V1-ledger. Een
al-toegepaste migratie bewerken = harde stop. (PR #237, memory: audit_fixbatch_2026_07)

**Cache-epoch-guard: zonder migr 0054/0021 → stil 0% cache-writes**
Symptoom: geen foute antwoorden, wél volle kosten (cache serveert nooit).
Oorzaak: `answer_cache_epoch` + `bump_cache_epoch`-RPC (migr **0054 V0 / 0021 V1**);
`purgeAnswerCache` bumpt, de engine skipt een cache-write bij epoch-verschil (fail-closed).
Ontbreekt de migratie in een omgeving → elke write wordt geskipt.
Wat te doen: zorg dat 0054/0021 toegepast zijn vóór je op de answer-cache leunt. (PR #237,
memory: audit_fixbatch_2026_07)

**PostgREST/supabase-js capt selects op ~1000 rijen → stille onder-telling**
Symptoom: counts/aggregaten (FAQ-telling, all-time-usage, label-audit) tellen te laag zonder
foutmelding.
Oorzaak: supabase-js retourneert max 1000 rijen per select.
Wat te doen: pagineer expliciet bij tellingen/aggregaties over grote tabellen (`query_log`,
`eval_runs`). (PR #198, memories: klantendashboard_bigship_2026_06, eval_recall_at_k_unreliable)

**PostgREST `!inner`-embed + filter op de embed filtert óók de teruggegeven embedded rijen**
Symptoom: afgeleide velden (counts / first / last message) komen uit een subset i.p.v. het geheel.
Oorzaak: een `.ilike`/filter op een `!inner`-embed beperkt niet alleen welke parents matchen,
maar ook wélke embedded child-rijen terugkomen.
Wat te doen: twee-staps — eerst alleen parent-ID's matchen, dan de ongefilterde embed via
`.in('id', ids)`. (PR #244, memory: dashboard_gaps_bigship_2026_07)

**`match_chunks_hybrid` keyword-helft stond effectief UIT voor natuurlijke vragen (tot migr 0046)**
Symptoom: `keyword_score=0.0000` op álle rijen; hybrid degradeert stil naar vector-only voor
elke meerwoords-vraag; NL-lexicale match ("eigen risico"/"fysiotherapie") boost niet.
Oorzaak: `plainto_tsquery('dutch', <hele vraag>)` AND't álle content-lexemen; extra vraagwoorden
("telt", "mee") komen in geen enkele chunk samen voor → `keyword_results` leeg.
Wat te doen: bouw de tsquery **OR-gebaseerd** (migr 0046 doet `plainto_tsquery` `&`→`|`). Bij
NL keyword/BM25-zware retrieval: verifieer dat de keyword-helft echt scoort, niet alleen dat de
RPC draait. (PR #170, memory: project_prod_gate_eval)

**Migratie-nummercollisie tussen parallelle branches is benign — niet hernoemen**
Symptoom: twee bestanden `0044_*.sql` (of `0039×2`/`0040×2`) op main.
Oorzaak: parallelle branches claimen hetzelfde nummer; de migrate-tracker keyt op de **volledige
bestandsnaam**, dus beide worden los getrackt en toegepast.
Wat te doen: laat ze staan als ze losse objecten raken; hernoemen desyncet de tracker. Kies wél
het volgende vrije nummer verder. (PR #156, memory: quiz_kennisbank_pr156)

**pgvector staat in het `extensions`-schema → RPC's hebben `search_path` nodig**
Symptoom: een migratie/RPC resolvet `<=>`, `vector(1536)` of `vector_cosine_ops` niet; of de
advisor klaagt over `extension_in_public`.
Oorzaak: de extensie is bewust in `extensions` geïnstalleerd (niet `public`), dus zonder expliciet
search_path vindt de functie de operatoren/typen niet.
Wat te doen: `create extension … with schema extensions` + in de RPC én de migratie
`set search_path = public, extensions, pg_temp`. Nieuwe V1-tabellen: RLS aan + org_id/chatbot_id
NOT NULL + SELECT-policy (membership-patroon van `0001_core_tenancy`) in dezelfde migratie;
service-role-only tabellen krijgen RLS-aan-zonder-policy (deny-all voor session-clients). (PR #213,
memory: project_v1_strategy)

**`create or replace function` kan signatuur/RETURNS niet wijzigen → `drop` + `create`**
Symptoom: een migratie die een kolom aan het resultaat van een RPC toevoegt (bv. `source_url` in
`match_chunks_with_parents`) faalt op "cannot change return type of existing function".
Oorzaak: Postgres staat bij `create or replace` alleen een body-wijziging met identieke
signatuur/return-shape toe.
Wat te doen: wijzigt de shape → `drop function … ; create function …` in dezelfde migratie
(grants/`search_path` opnieuw zetten); blijft de shape gelijk → `create or replace` volstaat.
(PR #107/#215, memories: crawler_dashboard_plan, project_v1_strategy)

**Migratie vóór de merge — code die een nieuwe kolom expliciet selecteert breekt anders prod**
Symptoom: na een merge geeft prod HTTP 400/500's tot iemand de migratie draait; of álle orgs vallen
stil terug op mock-instellingen.
Oorzaak: Vercel deployt de main-tip automatisch, migraties zijn handmatig. Een
`.select('…, nieuwe_kolom')` faalt op de hele query zolang de kolom ontbreekt.
Wat te doen: pas de migratie toe (en verifieer) vóór je mergt. Voor een kolom in een centrale read
(zoals `getOrgSettings`): schrijf de read defensief — bij een kolom-fout herhalen zonder die kolom
(zie de `contact_requests`-fallback in `lib/v0/klantendashboard/server/settings.ts`).
(PR #206/#239-#249, memories: contactverzoeken_bigship, dashboard_gaps_bigship_2026_07)

**Service-role bypasst RLS → filter soft-deletes zelf**
Symptoom: een script/CLI/admin-pad vindt een verwijderde org/chatbot en schrijft ernaar.
Oorzaak: de `deleted_at`-afscherming zit (deels) in RLS-policies en RPC-joins; de service-role ziet
alles.
Wat te doen: zet op elke service-role-lookup expliciet `.is('deleted_at', null)` (plus de
org/chatbot-filter). (PR #214, memory: project_v1_strategy)

**Storage-bucket: géén `allowed_mime_types` bij browser-uploads via signed URL**
Symptoom: een `.md`-upload wordt met 400 geweigerd terwijl `.md` toegestaan zou moeten zijn.
Oorzaak: `uploadToSignedUrl` negeert de `contentType`-optie bij een browser-`File` → het object komt
binnen als `application/octet-stream`.
Wat te doen: valideer op magic-bytes + extensie-allowlist + bucket-`file_size_limit` (zoals
V1-migratie `0006_v1_document_uploads.sql`), niet op MIME-type. (PR #221, memory: project_v1_strategy)

**PostgREST-embeds zijn in TypeScript array-getypeerd; `tsx` is lakser dan `tsc`**
Symptoom: `row.organizations.name` werkt in een `tsx`-script maar `npm run typecheck` faalt (of
andersom: runtime `undefined`).
Oorzaak: een embed als `organizations(name)` wordt door de gegenereerde types als array gezien;
`tsx` doet geen typecheck.
Wat te doen: behandel embeds als array (of narrow expliciet) en draai `npm run typecheck` ook over
scripts die je met `tsx` test. (PR #228, memory: project_v1_strategy)

## V0 → V1 porting

**V0-code porten tegen strikter V1-schema — WRITE-kant: 23502 op elke insert**
Symptoom: elke write faalt met NOT-NULL-violation (23502); build + reads verbergen het volledig.
Oorzaak: V0-tabel miste een kolom (bv. `chatbot_id`) die de V1-migratie NOT NULL zette; de
geporte data-laag vult 'm nergens.
Wat te doen: bij een NOT-NULL-kolom op een geport schema → grep álle geporte inserts; cheap
check = `information_schema.columns WHERE is_nullable='NO' AND column_default IS NULL` en
verifieer dat elke insert ze vult. Alleen `chatmanta-reviewer` + write-path-runtime vangt dit.
(PR #234, memory: v1_dashboard_parity)

**V0-code porten tegen strikter V1-schema — LEES-kant: stille EMPTY_STATS / nul-metrics**
Symptoom: recap/metrics tonen altijd 0, AI-samenvatting nooit gegenereerd; tsc + build groen.
Oorzaak: een geporte select vraagt kolommen die V0 wél maar V1 niét heeft (`visitor_id`/
`updated_at` op `threads`; `source_url`-kolom i.p.v. `metadata->>source_url`; `allowed_domains`
op `organizations` i.p.v. `chatbots`) → PostgREST-column-error valt stil terug op EMPTY_STATS.
Kolomnamen zijn string-literals, dus tsc/build zien niets.
Wat te doen: bij elke V0→V1-port de select-kolommen tegen het **echte V1-schema** checken (via
MCP), niet op build/tsc vertrouwen. (PR #236 / #238, memories: v1_admin_parity, v1_launch_ops_progress)

**Service-role-factory MOET in `lib/supabase/service-role.ts`, NIET in `admin.ts`**
Symptoom: `React.createContext is not a function` in tsx-scripts (`--conditions=react-server`,
o.a. `audit:retrieval`) en/of een kapotte client-bundle — terwijl `next build` EXIT 0 geeft.
Oorzaak: `admin.ts` importeert `@/lib/auth` → `next/navigation`/`next/headers`; zodra consumers
(rag.ts, credit-log.ts) dat erven breekt het react-server + browser-bundle.
Wat te doen: houd de rauwe key-lezende factory in `service-role.ts` (geen auth/next); `admin.ts`
host alleen de auth-gated wrappers. Draai bij zulke refactors `audit:retrieval` + `npm run build`,
niet alleen tsc. (PR #209, memory: project_v1_strategy)

**`lib/rag/**` mag niets uit `lib/v0/**` importeren — maar `import type` mag wel**
Symptoom: grep-gate (`no-adhoc-service-client.test.ts`, in CI via `test:unit`) faalt.
Oorzaak: de neutrale kernel is client-geïnjecteerd en V0-onafhankelijk.
Wat te doen: `import type {RagConfig}` uit `lib/v0/...` is build-safe (erased at runtime, valt
buiten de gate) — gebruik dat voor V1-glue; runtime-imports uit lib/v0 zijn verboden. (PR #212/#213,
memory: project_v1_strategy)

**answer_cache is gekeyd op `(org, bot_version)` — chatbot_id ontbreekt in V0**
Symptoom (latent in V1): meerdere chatbots op dezelfde bot-versie lekken cross-chatbot uit de cache.
Oorzaak: de V0-key mist `chatbot_id` (in V0 correct: 1 bot/org).
Wat te doen: voeg bij een V1-port `chatbot_id` toe aan de key (tabel + `lookup_cached_answer`-RPC +
lookup/write in de engine). En: de answer_cache-**write** moet in V1 via de **service-role**
(RLS-session-client heeft SELECT-only policy → een write faalt stil → `cacheEnabled` = dode no-op).
(PR #215/#217, memory: project_v1_strategy)

**`sourceLinksEnabled` staat in de LATEST-bot op TRUE → moet FALSE in V1**
Symptoom: bronlinks in V1-antwoorden terwijl de document-only RPC geen `source_url` levert.
Oorzaak: de flag staat sinds v0.9.1 default op true.
Wat te doen: zet `sourceLinksEnabled:false` in de V1-rag-config (hard rule: bronlinks uit in V1).
(PR #230/#233, memory: v1_v0_look_restyle_pr230)

## RAG & evals

**Similarity-thresholds zijn MODEL-bound, niet feature-bound**
Symptoom: bij 0.7 worden zelfs verbatim-quotes als "ongegrond" gemarkeerd.
Oorzaak: `similarityThreshold` én `claimVerificationThreshold` liggen voor
`text-embedding-3-small` + NL beide in de 0.45–0.65-band.
Wat te doen: gebruik ~0.4 (AGENTS.md); bij een model-swap **beide** opnieuw kalibreren met
`npm run v0:tune` op `scripts/fixtures/`, niet als globale constante behandelen. (memory:
v0_rag_threshold_finding)

**De answer-cache vervuilt evals bij een in-place prompt-wijziging**
Symptoom: een aantoonbaar correcte fix (unit-test groen) heeft GEEN effect op de eval-uitkomst;
`[cache] HIT` in de logs.
Oorzaak: de cache is gekeyd op de `bot_version`-STRING; overschrijf je een prompt binnen dezelfde
versie, dan serveert `eval:run` STALE antwoorden en de cache-return komt vóór je nieuwe guards.
Wat te doen: wis de cache per org vóór een `eval:run` na een in-place wijziging. De alias
`npm run v0:clear-cache` is **kapot** (geen org-arg → "Onbekende org-slug undefined"); draai
`node --env-file=.env.local scripts/v0-clear-org-cache.mjs <slug> --apply` per org
(dev-org acme-corp globex-inc initech demo-nieuw). `eval:hard:run` en de V1-eval zetten intern
`disableCache:true` en zijn veilig. (memories: eval_cache_and_run_gotchas, eval_hard_dimension_cheap_strategy)

**Judge-queue trunceerde het bron-excerpt → structurele false grounding-fails**
Symptoom: gegronde getal-cases falen massaal op grounding/answer-quality; zelfs een bekend-JA
baseline zakt → scoring kapot, niet de bot.
Oorzaak: de answer-LLM krijgt de volledige `parent_content`, maar de judge-queue kreeg alleen het
≤800-char `parentExcerpt` → de judge is blind voor feiten voorbij ~char 800.
Wat te doen: gebruik `includeFullParentContent:true` (eval-only flag op `runRagQuery`); tell-teken
dat de scoring kapot is i.p.v. de bot = de bekend-JA baseline zakt óók. (PR #168, memory: project_prod_gate_eval)

**gpt-4o-mini negeert instructies in de SYSTEM-prompt (taal/gedrag/settings)**
Symptoom: een EN-vraag krijgt een NL-antwoord ondanks een "answer in English"-systeeminstructie;
een dashboard-taalinstelling doet niets op élke versie.
Oorzaak: de NL `STIJL:`-suffix wordt ná de instructie geplakt → recency wint.
Wat te doen: dwing taal-/gedragsdirectieven af in de **USER-turn** (aan het eind), niet in de
system-prompt; settings horen op de override-laag (chatbotOverrides), niet als versie-flag.
(PR #164/#166, memory: project_prod_gate_eval)

**recall@k / MRR is geen betrouwbaar retrieval-bottleneck-signaal**
Symptoom: recall@k=0 over de hele linie of "64% retrieval-bottleneck".
Oorzaak: stale `ideal_source_filenames`-labels (corpus geheringest onder andere filenames) +
exacte-filename-match straft een ander-maar-geldig doc af.
Wat te doen: leun op grounding/correctness/must-not + `npm run audit:retrieval` (ideal vs
retrieved); fix labels vóór je een embedding-upgrade overweegt. (PR #101, memory: eval_recall_at_k_unreliable)

**Over-refusal-maat is een CTA-regex-meetartefact**
Symptoom: "over-refusal 13%" die na een fix "verdwijnt".
Oorzaak: `looksLikeRefusal` is een regex op `results[0]` die elke "neem contact op"-CTA als
weigering telt; n=30 = ruisvloer.
Wat te doen: tel op het **échte** deterministische refusal-event + majority-of-N; lees hits
handmatig na vóór her-tuning. Werkelijke over-refusal ≈ 3%. (PR #171, memories:
eval_over_refusal_metric_unreliable, v0_10_build)

**must_not / hard-fact-substringchecks zijn false-positief op een CORRECTE weigering**
Symptoom: een goede ontkenning die de verboden term herhaalt ("wij geven GEEN 40% korting")
faalt de must-not-check.
Oorzaak: substring-match onderscheidt adoptie niet van ontkenning.
Wat te doen: alléén `canary`/`malformed`/`consistency` zijn HARDE gates; `must-not`/`hard-fact`/
`scope`/`refusal` = ADVISORY → aan de judge geven, niet auto-fail. Meet must-not op adoptie-frases,
niet op de kale naam/waarde. (PR #119, memory: eval_hard_dimension_cheap_strategy)

**De deterministische hard-fact-weigergate over-vuurt op niet-feitelijke (nood)vragen**
Symptoom: op "acute pijn op de borst, kan amper ademen" verving de gate het "bel 112"-advies door
het generieke "kan geen bedragen/datums/cijfers vinden"-weigertemplate.
Oorzaak: `shouldDeterministicallyRefuseHardFact` vuurt op `hardFactSupported===false` +
`retrievalStrength∈{weak,medium}`; de verifier ziet élk getal ≥2 cijfers als hard feit → "112"
telt als ongegrond. De gate is **retrieval-sterkte-gestuurd, NIET claim-confidence** (comments in
`bots.ts`/`rag.ts` die claim-confidence zeggen zijn stale). Voor NL + text-embedding-3-small landen
gegronde antwoorden routinematig in 0,50–0,56 = de gevarenzone.
Wat te doen: de gate mag nooit vuren op een draft met een nood-doorverwijzing
(`hardFactRefusalSafetyAware`, sinds v0.9.1). Test elke wijziging tegen BEIDE: de noodvraag (mag
NIET weigeren) én echte out-of-corpus-fabricatie (MOET weigeren). (PR #119, memories:
eval_hard_dimension_cheap_strategy, v0_version_history)

**De eval schrijft naar `eval_runs`, NIET naar `query_log`**
Symptoom: `SELECT FROM query_log WHERE bot_version=…` geeft 0 rijen tijdens eval-diagnose.
Oorzaak: `query_log` wordt alleen door productiepaden gevuld (`/api/v0/chat` via `after()`);
`eval_runs` krijgt judge-scores + `stage_timings_ms` (jsonb).
Wat te doen: query `eval_runs` (`stage_timings_ms->verify_ms`, `bot_answer`, scores) voor
eval-telemetrie. `eval:run` leest bovendien de LIVE `eval_questions`-tabel, `eval:seed` is
upsert-only → de fixture trimmen verwijdert geen orphan-DB-rijen. (memories:
eval_writes_to_eval_runs_not_query_log, eval_recall_at_k_unreliable)

**Rerank doet load-bearing chunk-SELECTIE, niet reordering — niet skippen**
Symptoom: rerank-skip geeft "geen informatie" op nummer-zware vragen (0/4 runs).
Oorzaak: rerank kiest top-20 → finalContextMaxChunks=5; "strong retrieval" (hoge top1-sim)
garandeert NIET dat de kern-chunk in de hybrid-top-5 zit.
Wat te doen: een latency-lever mag rerank niet skippen; behoud de selectie (goedkopere rerank of
rerank-on-weak-rescue). (PR #159, memory: project_latency_ttft)

**Kosten-attributie: klant-verbruik = `query_log.cost_usd`, NIET de OpenAI Costs-API**
Symptoom: het OpenAI-account-totaal (~$54) is veel hoger dan het klant-cijfer (~$0,47).
Oorzaak: `query_log.cost_usd` wordt alléén op `/api/v0/chat` geschreven (full pipeline) = zuiver
klant-verbruik; eval/judge-kosten staan in `eval_runs`; de Costs-API is account-breed (incl.
evals/dev/embeddings).
Wat te doen: gebruik `query_log.cost_usd` voor klant-chatbot-kosten; behandel de Costs-API als
apart, niet-vergelijkbaar account-totaal. (PR #150, memory: controlroom_admin_dashboard_v0)

**`answer_cache` is óók de delivery-store van de FAQ-pre-cache — niet "zomaar een perf-cache"**
Symptoom: na het uitzetten/weghalen van de cache-lookup lijkt alles te werken, maar FAQ-antwoorden
worden nooit meer geserveerd (rijen worden geschreven, niemand leest ze).
Oorzaak: `precacheTopN` (`lib/v0/server/faq-snapshot.ts`) schrijft goedgekeurde FAQ-antwoorden
rechtstreeks in `answer_cache`; de chat-pipeline levert ze via de gewone cache-lookup af.
Wat te doen: elke cache-wijziging (uitzetten, TTL, key-wijziging) moet expliciet beslissen wat er
met de FAQ-pre-cache gebeurt. Purges lopen via `purgeAnswerCache` in de ingest-primitieven
(`ingestText`/`deleteDoc`, `processCrawl`) en de settings-/bron-mutaties — een nieuw pad dat
kennisbank-content wijzigt moet óók purgen, anders serveert de cache stale antwoorden.
(PR #198/#205, memory: answer_cache_removal_analysis)

**Het Test-/Preview-scherm schrijft geen `answer_cache` — alleen het echte chat-pad doet dat**
Symptoom: je probeert een cache-bug te reproduceren via het klantendashboard-Test-scherm en ziet
nooit een cache-rij ontstaan.
Oorzaak: `askTestQuestion` (`app/klantendashboard/test/actions.ts`) stopt de stream bij
`answer-done`; de cache-write zit aan het eind van de pipeline en draait alleen op het volledige
`/api/v0/chat`-pad (gegate op `bot.cacheEnabled` en `disableCache !== true`).
Wat te doen: reproduceer cache-gedrag via de widget/chat-route of seed de rij direct in de DB.
(PR #178, memory: niels_punchlist_2026_06)

**Twee "veilige" features kunnen elkaar saboteren: bronlinks × hard-fact-gate**
Symptoom: correcte antwoorden met een echte bronlink werden (~2 van 3 runs) vervangen door het
"kan geen exacte bedragen/datums vinden"-weigertemplate.
Oorzaak: de hard-fact-extractor zag de link-URL als ongegrond `url:`-feit (de URL staat in
pagina-metadata, niet in chunk-content) → de deterministische weiger-gate vuurde.
Wat te doen: links worden nu via `stripMarkdownLinks()` tot label teruggebracht vóór de
claim-verificatie (`lib/rag/run-rag-query.ts`). Algemeen: test feature-interacties op de échte
pipeline mét cache omzeild, niet elke feature los. Gecachte antwoorden worden bij een HIT opnieuw
gesaneerd (`sanitizeSourceLinks` op de cache-read) — saneer bij lezen i.p.v. een destructieve
cache-DELETE-migratie. (PR #145/#149, memory: bron_links_pr145)

**Algemene-kennis-toggle: org-instelling wint, en raakt alleen het zero-hit-pad**
Symptoom: de klant-toggle "beantwoord algemene vragen" leek niets te doen; na de fix blijft het
zichtbare effect klein.
Oorzaak: (1) vroeger moesten zowel de botversie-flag als de org-toggle aan staan, en de LATEST-bot
had de flag uit; nu geldt `input.enableGeneralKnowledge ?? bot.generalKnowledgeEnabled`. (2) De
gate stuurt alléén het pad waarin géén enkele chunk de threshold haalt; bij threshold ~0,4 krijgen
de meeste in-domein-vragen een zwakke hit en gaan via het normale antwoordpad.
Wat te doen: verwacht weinig verschil bij orgs met redelijke KB-dekking; test het met een
geforceerde zero-hit-vraag. Callers zonder het veld (eval) houden de versie-default → baselines
blijven gelijk. (PR #203, memory: klantendashboard_fixes_batch_pr203_204)

**Eval moet het FINALE terminale event meten (`replacement` wint van `answer-done`)**
Symptoom: een regenerate-gebaseerde fix (hard-fact-weigering, anti-adoptie) heeft geen enkel
effect op de eval-score.
Oorzaak: de pipeline kan ná `answer-done` nog een `replacement`-event sturen dat het antwoord
vervangt; een harness die bij `answer-done` stopt meet het verworpen concept.
Wat te doen: consumeer de stream tot het einde en neem het laatste van
`answer-done`/`fallback`/`smalltalk`/`replacement` (zoals `lib/v0/server/eval.ts` en
`scripts/v1-eval-run.ts` doen). Evals vóór deze fix onderschatten regenerate-fixes. (memories:
v0_version_history, project_v1_strategy)

**V0-botversies zijn append-only; nieuw gedrag gaten zodat de eval-baseline byte-identiek blijft**
Symptoom: een "kleine" wijziging verschuift alle eval-baselines of verandert stil oude versies.
Oorzaak: oudere versies in `lib/v0/server/bots.ts` zijn vergelijkings-snapshots; eval-runners geven
veel per-org-input (toon, Q&A, overrides) niet door.
Wat te doen: nieuwe RAG-feature = nieuwe versie (`LATEST_BOT_VERSION` + `BOT_VERSIONS_ORDERED`
bijwerken), nieuwe pipeline-flag = default uit, alleen de nieuwste versie zet 'm aan. Een
klant-*instelling* hoort op de override-laag (`chatbotOverrides`), niet als versie-flag — dan werkt
ze op alle versies. Houd nieuw gedrag buiten het eval-pad (bv. `DEFAULT_TONE` blijft `neutral`,
Q&A-promptregel alleen als de org Q&A heeft, contact-aanbod in de chat-route i.p.v. de engine).
In-place patch van de live versie alleen bij een duidelijke correctheidsbug, en dan de cache wissen
(zie hierboven). (memories: v0_is_active_learning_platform, widget_persoonlijk_tone_and_tone_surface,
contactverzoeken_bigship, niels_punchlist_2026_06)

**Eval-kosten: de judge domineert; draai standaard alleen de twee nieuwste versies**
Symptoom: een eval-run kost veel meer dan verwacht.
Oorzaak: vrijwel alle kosten zitten in de `gpt-4o`-judge, niet in de `gpt-4o-mini`-botgeneratie.
Wat te doen: `eval:run` draait standaard `EVAL_DEFAULT_VERSIONS` (= laatste 2 uit
`BOT_VERSIONS_ORDERED`); `eval:hard:run` standaard baseline + nieuwste. Gebruik `--smoke` of een
subset, noem vooraf welke versies en hoeveel vragen, en draai geen eval "tussendoor om te checken".
Een eval is een billable externe call → eerst bevestigen. (memories: feedback_eval_cost_discipline,
eval_hard_dimension_cheap_strategy, project_latency_ttft)

**Nooit `bots.ts` (of andere pipeline-code) wijzigen terwijl een eval draait**
Symptoom: de run crasht halverwege (exit 9).
Oorzaak: de tsx-loader leest gewijzigde modules opnieuw in tijdens de run.
Wat te doen: laat de run uitlopen; wil je tussendoor een schone baseline, maak eerst een backup en
edit pas daarna. (memory: eval_cache_and_run_gotchas)

**Eval-signaal-lessen: wat wel en niet discrimineert**
- `claimConfidence` scheidt fabricatie en gegronde berekening NIET (embeddings matchen vorm, niet
  waarde); `retrievalStrength` wél → bouw weiger-logica op retrieval-sterkte.
- Prompt-tuning beweegt "engage"-types (false-premise, ambiguous, injection), maar niet
  pure-weigertypes (out-of-corpus, planted-fact) — die vragen een retrieval-/threshold-/
  verifier-ingreep.
- Judge-ruis ≈ 0,12 op de overall-score; behandel kleinere delta's als ruis, sub-buckets (n<20)
  nog meer.
- Geld-hard-facts strikt: een bedrag met €-teken mag niet als bewezen gelden alleen omdat het
  kale getal ergens in de chunks staat (bv. als tabelparameter) → `hardFactNumericFallback: false`.
(memory: v0_version_history)

**Valideer een nieuwe eval-metriek op echte output vóór je erop stuurt; multi-run-checks zijn advisory**
Symptoom: unit-tests van de metriek zijn groen, maar het verdict is omgekeerd (bv. 71-82%
"under-refusal", of een perfecte kandidaat die op consistency zakt).
Oorzaak: een correcte false-premise-correctie telde als hallucinatie; elke getalsvariatie tussen
stochastische runs werd een harde fail — ook als alle runs gegrond waren.
Wat te doen: draai elke nieuwe metriek end-to-end mét judge op echte, gevarieerde output en lees
hits handmatig na. Cross-run-divergentie is alleen een harde fail voor de `consistency`-dimensie
én alleen als ≥1 run een ongegrond specifiek gaf (`consistencyWithGrounding` in
`lib/rag/hard-eval-checks.ts`); multi-run draait op alle versies, niet alleen de kandidaat.
(PR #165/#169, memory: project_prod_gate_eval)

**`chatComplete` in de engine rekent altijd het `gpt-4o-mini`-tarief**
Symptoom: kosten van een `gpt-4o`-call worden flink onderschat.
Oorzaak: `chatComplete` (`lib/rag/run-rag-query.ts`) berekent `costUsd` met vaste
mini-tarief-constanten, ongeacht het meegegeven model.
Wat te doen: gebruik je een ander model, reken de kosten opnieuw uit met `costForModelUsd`
(`lib/ai/llm.ts`), zoals `lib/controlroom/server/quiz-analysis.ts` doet. (PR #156, memory:
quiz_kennisbank_pr156)

**Live-telemetrie = proxies, nooit "accuraatheid"; let op ontbrekende koppelingen**
Symptoom: een dashboard-cijfer suggereert een correctheidspercentage, of een join tussen
`query_log` en gesprekken levert niets.
Oorzaak: live verkeer heeft geen ground-truth. `query_log` heeft géén `thread_id` (per-beurt
cijfers en per-gesprek cijfers komen uit losse bronnen: `query_log` resp.
`v0_threads`/`v0_thread_messages`); `v0_feedback` (👍/👎) heeft géén `bot_version`, dus telt
over alle versies. Niet verwarren: `v0_feedback` = duimpjes, `admin_feedback` = klant-meldingen.
Wat te doen: toon fallback-/gap-/feedback-ratio's als proxies; schrijf live-telemetrie nooit naar
`eval_runs`. Filter metrics/recaps op de retentie-placeholder via `lib/v0/retention-sentinel.ts`
(anders lekt "[verwijderd — retention]" in top-vragen en LLM-samenvattingen). (PR #172/#173/#188,
memories: maandelijkse_recap_pr172, bot_prestaties_tab_pr173, nacht_audit_2026_06_14,
project_feedback_system)

## Widget & embed

**Iframe-viewport ≠ host-viewport (responsive) + cookie/logging-valkuilen**
Symptoom (alleen op externe sites, niet op de directe `/widget/`-demo): widget denkt altijd
"mobiel" → fullscreen paneel; gesprekken onzichtbaar in de dashboards; elke beurt een nieuwe
losse thread.
Oorzaak: (1) `matchMedia` meet de iframe-breedte (~420px), niet het scherm; (2) server-side
thread-logging hing aan `isWidgetRequest()` die alleen referer `/widget/` matchte, niet `/embed/`;
(3) de visitor-cookie (`SameSite=Lax`) wordt in een third-party iframe geblokkeerd.
Wat te doen: (1) laat de host het mobiel-signaal bepalen en via `postMessage` doorgeven; (2) match
óók `/embed/` + de `x-chatmanta-embed`-header; (3) gebruik een cookie-onafhankelijke client-id
(localStorage) via `x-chatmanta-visitor`-header. Elke responsive beslissing in de widget moet van
de host komen. (PR #133, memory: widget_embed_iframe_gotchas)

**Origin-allowlist wordt op het `/embed`-render (Referer) afgedwongen, NIET per chat-request**
Symptoom/oorzaak: een fetch uit het iframe heeft als Origin de ChatManta-host, niet het
klantdomein — dus per-request origin-check kan niet op het klantdomein filteren.
Wat te doen: enforce op de `/embed`-render via de Referer (ouderpagina); lege/onbekende host =
fail-open. Referer is strippbaar → restrisico afgedekt door de per-org rate-limit; volledige
sluiting (host-in-token) = V1. (PR #122, memory: widget_v1_proofing_p1)

**`EMBED_TOKEN_SECRET` ontbreekt op een Vercel-env → `/embed/<valid-org>` = 500**
Symptoom: geldige org geeft 500 (excluded org = nette 404 want notFound komt vóór token-creatie).
Oorzaak: `createEmbedToken()` throwt fail-closed zonder de secret; een verse Vercel-env/preview
mist 'm.
Wat te doen: zet `EMBED_TOKEN_SECRET` per environment. De embed-routes (`/embed`, `/api/v0/chat`,
`/api/v0/widget/ping`+`/token`, `/api/v0/contact-request`, `/widget.js`) vallen buiten de
`V0_DEMO_PASSWORD`-proxy-gate en draaien op HMAC-token + origin-lock + rate-limit. (PR #105/#106,
memory: widget_embed_public_api)

**`proxy.ts`-matcher gate-t ook `public/` `.html`/`.xml` en nieuwe cron-routes**
Symptoom: een nieuwe publieke route (`.html`/`.xml`, of een V1-cron) wordt 307 naar `/login`
gestuurd → Firecrawl/externe pinger ziet niets.
Oorzaak: de proxy-matcher exempteert alleen specifieke paden; alles anders valt achter de
V0-demo-loginpoort.
Wat te doen: voeg het pad **segment-geankerd** toe aan de negative-lookahead (`crawl-eval(?:/|$)`,
`api/v1/cron(?:/|$)` — niet bare prefix, anders un-gate je te veel). (PR #121 / #231, memories:
crawler_observability_eval_pr121, v1_launch_ops_progress)

**Chat-bubble = `renderMarkdownLite` (XSS-veilig); `render-markdown.tsx` = alleen demo/marketing**
Symptoom/oorzaak: `renderMarkdownLite` maakt géén rauwe links/`dangerouslySetInnerHTML`;
`render-markdown.tsx` heeft rauwe href (`javascript:`-risico) en hoort niet in de bot-output.
Wat te doen: houd bot-antwoorden op `renderMarkdownLite`. (PR #122, memory: widget_v1_proofing_p1)

**Widget-script heet `public/widget-v1.js`, NIET `v1-widget.js`**
Symptoom/oorzaak: een `/v1`-prefix in het pad botst met de proxy-sessie-branch.
Wat te doen: gebruik `widget-v1.js` (collision-vrij naast V0's `widget.js`). (PR #224, memory:
project_v1_strategy)

**`/embed/[slug]` moet tegen `ALL_ORG_SLUGS` valideren, niet `ORG_SLUGS_WIDGET`**
Symptoom: de embed-snippet uit het klantendashboard geeft 404 voor `dev-org` of `demo-nieuw`.
Oorzaak: `ORG_SLUGS_WIDGET` sluit die orgs bewust uit (geen nep-site-pagina's), maar het dashboard
genereert voor élke org een snippet.
Wat te doen: laat `app/embed/[slug]/page.tsx` op `ALL_ORG_SLUGS` staan. (PR #106, memory:
widget_embed_public_api)

**Widget lokaal testen: origin-allowlist, dev-indicator en iframe-styling**
Symptoom: `/embed/<org>?h=<host>` toont "geblokkeerd"; Playwright-kliks op de chat-knop komen niet
aan; dashboard-kleuren ontbreken in het widget-formulier.
Oorzaak: (1) orgs met een allowlist blokkeren hosts die er niet op staan; zonder `?h` is
`parentHost` null → fail-open. (2) De Next dev-indicator overlapt de FAB-hoek en onderschept
kliks. (3) In de iframe bestaan de `--klant-*`-CSS-variabelen van het dashboard niet.
Wat te doen: open lokaal `/embed/<org>` zonder `?h`; klik in Playwright via `el.click()` binnen
`page.evaluate`; style widget-UI in de iframe inline. (PR #133/#206, memories:
widget_embed_iframe_gotchas, contactverzoeken_bigship)

**V1: lege `chatbots.allowed_domains` = elke site mag embedden**
Symptoom/oorzaak: de V1-origin-allowlist (`lib/v1/widget/load-embed.ts`) is fail-open bij een lege
of NULL-lijst. NB: de kolom staat op `chatbots`, niet op `organizations`.
Wat te doen: vul `allowed_domains` als vaste stap bij het onboarden van elke klant. (PR #224/#238,
memory: v1_launch_ops_progress)

## Crawler (Firecrawl)

**"0 pagina's" / job faalt terwijl de scrape klaar is = Firecrawl-429 tijdens pollen**
Symptoom: een crawl eindigt zonder pagina's of als `failed`, maar Firecrawl heeft de batch wel
afgerond.
Oorzaak: `getBatchScrapeStatus` pagineert standaard automatisch → veel requests → rate-limit 429
tijdens het pollen.
Wat te doen: pol met `autoPaginate:false` en behandel 429 als tijdelijk (job blijft `processing`,
volgende tick opnieuw) — zo staat het in `lib/v0/crawler/firecrawl.ts`/`processJobs.ts`. Diagnose:
een afgeronde batch opnieuw uitlezen via `getBatchScrapeStatus` is een gratis status-GET.
(PR #115, memory: v0_version_history)

**Discovery-cap ≠ scrape-cap; subdomeinen worden niet ontdekt**
Symptoom: "de crawler toont niet alle sitemap-pagina's".
Oorzaak: `map()` kost een vaste kleine hoeveelheid credits ongeacht de lengte, dus de keuzelijst
hoeft niet aan de scrape-kostengrens; `map` draait bovendien zonder `includeSubdomains`.
Wat te doen: houd `MAX_DISCOVER_PAGES` (keuzelijst) los van `MAX_CRAWL_PAGES` (harde scrape-cap);
`blog.site.nl` verschijnt niet bij root `www.site.nl` — bewust, i.v.m. ongerelateerde content.
(PR #112, memory: crawler_dashboard_plan)

**Bron uitzetten zonder RPC-wijziging; admin-gestarte crawls hebben geen auto-ingest**
Symptoom/oorzaak: de retrieval-RPC's filteren al op `website_pages.included = true`; en
`processCrawlJobs` wordt alleen gedreven door de klant-Website-tab-tick, de cron-route en
expliciete knoppen — een crawl die vanuit het admin-dashboard start blijft anders hangen op
"openstaand".
Wat te doen: een bron inactief maken = `knowledge_sources.disabled_at` zetten + de pagina's
`included=false` (reactiveren zet ze allemaal terug op included). Na een admin-crawl: "Verwerk
openstaande crawls" (of de cron-pinger). (PR #134/#137, memory: controlroom_admin_dashboard_v0)

**Externe verbruiks-API's: lees het historiek-ledger, niet `plan − remaining`**
Symptoom: "credits verbruikt deze maand" klopt niet na een top-up/coupon; de OpenAI-kosten-call
faalt met een gewone API-key.
Oorzaak: resterende credits kunnen boven het plan uitkomen; de OpenAI Costs-API
(`/v1/organization/costs`) accepteert alleen een org-admin-key (`OPENAI_ADMIN_KEY`), geen
project-key, en `amount.value` is een string.
Wat te doen: Firecrawl → `getCreditUsageHistorical()`; OpenAI → admin-key + `Number(value)` + ruime
timeout/caching (de API is traag); beide fail-safe met gelabelde fallback in de UI. (PR #144/#147,
memory: controlroom_admin_dashboard_v0)

**Publieke crawl-tests moeten tegen het productiedomein**
Symptoom/oorzaak: Vercel-preview-deployments zitten achter Vercel-auth (401), dus Firecrawl ziet
daar niets — ook al suggereert het voorbeeld in `scripts/v0-crawl-eval.ts` een preview-URL.
Wat te doen: draai fixtures zoals `v0:crawl-eval` tegen het productiedomein (of een preview met
uitgeschakelde deployment-protection); doel overschrijven via `CRAWL_EVAL_BASE_URL`. (PR #121, memory: crawler_observability_eval_pr121)

## E-mail & crons

**Resend: geverifieerd domein = chatmanta.com (NIET .nl) → stille 403**
Symptoom: mails komen niet aan, geen zichtbare fout.
Oorzaak: de default-afzender `feedback@chatmanta.nl` wordt door Resend met HTTP 403 geweigerd
("domain not verified"), en de code slikt die fail-safe in.
Wat te doen: zet `RESEND_FROM=ChatManta <feedback@chatmanta.com>` expliciet (op `.com`), lokaal
én op Vercel; env-wijziging werkt pas na een redeploy. (PR #154, memory: resend_email_config)

**chatmanta.com kan mail VERSTUREN maar niet ONTVANGEN → notify-adres bounct stil**
Symptoom: "ik krijg geen notificatie-mail" terwijl versturen werkt.
Oorzaak: chatmanta.com heeft geen MX-records (DKIM-verificatie ≠ mail-hosting); `niels@chatmanta.com`
bounct dus.
Wat te doen: check bij élk notify-adres eerst `nslookup -type=MX <domein>`; gebruik een adres op
een domein mét MX (chatmanta.nl of privé). `CONTACT_REQUEST_NOTIFY_EMAIL` staat niet default op
Vercel → zonder valt contactverzoek-notificatie terug op `captureError`. (memories:
resend_email_config, contactverzoeken_bigship)

**cron-job.org volgt GEEN redirects**
Symptoom: elke run "308 Permanent Redirect"; na een reeks fails schakelt cron-job.org de job zelf
uit. De failure is edge-side → verschijnt NIET in Vercel function-logs.
Oorzaak: `http://`, apex-zonder-`www`, of trailing-`/` → 308 naar de canonieke URL.
Wat te doen: gebruik exact `https://www.chatmanta.nl/...` + `Authorization: Bearer <CRON_SECRET>`.
Een groene 200 met body `{"processed":0}` = succes (no-op). (memory: v1_launch_ops_progress)

**Vercel: env-wijzigingen werken pas na een redeploy die ná het opslaan is aangemaakt**
Symptoom: nieuwe var lijkt niet gelezen; `vercel env pull` geeft `NEXT_PUBLIC_*` leeg (`=""`).
Oorzaak: env wordt gesnapshot bij deploy; NEXT_PUBLIC wordt at-build inlined; de lege pull is een
artefact, niet de echte waarde.
Wat te doen: maak een verse redeploy ná het zetten van de var; verifieer "is env correct" via de
live site, niet via gepullde waarden. (memories: vercel_deployment, v1_rate_limit_hardening)

**Vercel: frequente crons → externe pinger; Vercel-eigen crons krijgen `CRON_SECRET` vanzelf**
Symptoom: een cron per minuut/5 minuten in `vercel.json` blokkeert de deploy (Hobby-plan); of je
twijfelt of een geroteerde `CRON_SECRET` de bestaande crons breekt.
Oorzaak: Hobby staat alleen dagelijkse crons toe. Vercel injecteert de actuele `CRON_SECRET` zelf in
z'n eigen cron-aanroepen.
Wat te doen: `vercel.json` bevat alleen dagelijkse jobs (retention, faq-snapshot); de crawl-ingest
draait via een externe pinger (cron-job.org, zie hierboven) + de client-tick. Na rotatie van
`CRON_SECRET`: alleen de header van externe pingers bijwerken. (PR #102/#103, memories:
v0_version_history, crawler_dashboard_plan, v1_launch_ops_progress)

**Vercel CLI-quirks**
- Env-vars van het type *Sensitive* zijn achteraf onleesbaar (`vercel env pull` geeft `""`) — kwijt =
  roteren, niet "terughalen".
- `vercel link` plakt een `VERCEL_OIDC_TOKEN`-regel aan `.env.local` — haal die na afloop weg.
- `vercel redeploy <deployment-url>` kent geen `--yes`-flag (vraagt ook niets).
- De Vercel-MCP heeft geen env-var-tool; gebruik de CLI (`vercel env ls/add/rm`).
(memories: vercel_deployment, v1_launch_ops_progress)

## Git & parallel werk

**Gestapelde PR's + squash-merge: `--delete-branch` sluit de volgende PR**
Symptoom: na `gh pr merge <parent> --squash --delete-branch` staat de child-PR op CLOSED en kan niet
heropend worden; of de child-PR heeft ineens conflicten met main.
Oorzaak: de child had de parent-branch als base (die nu weg is); en de child bevat nog de originele
parent-commits, terwijl main een andere squash-SHA heeft.
Wat te doen: retarget elke open child eerst (`gh pr edit <child> --base main`) vóór je de parent
mergt; rebase de child daarna met `git rebase --onto origin/main <oude-parent-tip>` en force-push.
Al gesloten? Maak een verse PR vanaf dezelfde branch. Bij voorkeur geen ketting van
delete-branch-merges bouwen. (PR #215-#218, memory: squash_merge_workflow)

**`gh pr merge` vanuit een worktree geeft een fout, maar de merge is wél gelukt**
Symptoom: `fatal: 'main' is already used by worktree at …` na `gh pr merge`.
Oorzaak: gh probeert na de server-side merge lokaal `main` uit te checken, die al in de hoofd-checkout
staat.
Wat te doen: verifieer met `gh pr view <n> --json state` (= MERGED) en negeer de lokale fout, of merge
vanuit de hoofd-checkout. (memory: squash_merge_workflow)

**Rode CI op tests buiten je eigen diff = je branch loopt achter op main**
Symptoom: CI faalt op tests die je niet hebt aangeraakt.
Oorzaak: ze waren al rood op je base-commit en zijn inmiddels op main gefixt.
Wat te doen: check eerst of de failures in je diff zitten; zo niet → `git fetch` + rebase op
`origin/main`, dan opnieuw draaien. Main beweegt snel bij parallelle sessies — fetch vóór elke
rebase/merge. (PR #236, memories: v1_admin_parity, v1_launch_ops_progress)

**Commit op de verkeerde branch / vreemde commits op je branch (parallelle sessie)**
Symptoom: je commit landt op een andere branch, of er staat een commit tussen die jij niet maakte.
Oorzaak: een tweede sessie in dezelfde working-directory wisselde van branch (preventie staat in
AGENTS.md).
Wat te doen: niet `reset --hard` of interactief rebasen (je wist mogelijk werk van de andere sessie).
Cherry-pick je eigen commits naar de juiste branch en haal ze op de verkeerde weg met
`git reset --soft`; meld onbekende commits aan de gebruiker. `git reflog -20` toont wat er gebeurde.
(memory: parallel_session_branch_shift)

**Lege, gelockte worktree-map na `git worktree remove`**
Symptoom: de map blijft staan met "being used by another process", terwijl `git worktree list` 'm
niet meer toont.
Oorzaak: een proces houdt de map als cwd open — typisch de Playwright-MCP-server (niet je
dev-server), tot het einde van de sessie.
Wat te doen: accepteer het als onschuldig (git-metadata is schoon) en verwijder de map later; kill
niet alle `node`-processen (dat breekt andere sessies). (memories: feedback_playwright_worktree_lock,
contactverzoeken_bigship)

## Overig

**Upstash rate-limit: 3 valkuilen die elk een 500-outage op publieke routes geven**
Symptoom: schone homepage (307) maar 500 op élke rate-limited route (widget/token, chat, feedback,
ping, client-error).
Oorzaak: (1) de startup-assert checkt **presence, niet validity** — een aanwezige-maar-foute
`UPSTASH_REDIS_REST_URL` passeert; (2) **REST ≠ TCP** — een geplakte `rediss://…:6379`-string geeft
`UrlError` (pak de `https://<naam>.upstash.io`-REST-URL uit de @upstash/redis-tab, geen `:6379`);
(3) een env-flip vereist een redeploy die ná het zetten is aangemaakt.
Wat te doen: gebruik de REST-URL, valideer via een `seq`-curl-burst boven de limiet (`401→429`,
0×500). Fail-safe naar in-memory zit in PR #174. (memory: v1_rate_limit_hardening)

**Codex MCP-review: default `gpt-5.x-codex` geeft HTTP 400 op dit ChatGPT-account**
Symptoom: "The '<model>' model is not supported when using Codex with a ChatGPT account."
Oorzaak: de `-codex`-suffixed slugs werken niet op een ChatGPT-account; config.toml heeft geen
`model`-regel → fallback naar de afgewezen default.
Wat te doen: geef `model: "gpt-5.5"` mee (of `gpt-5.4`/`gpt-5.4-mini`). (memory: codex_mcp_model_chatgpt_account)

**`query_log.tone` heeft een CHECK-constraint → een nieuwe toon breekt de insert**
Symptoom: elke query_log-insert op de nieuwe toon faalt → geen `queryLogId` → kapotte feedback.
Oorzaak: `query_log_tone_chk` staat maar een vaste set toe.
Wat te doen: voeg een nieuwe toon-waarde via migratie toe (zoals migr 0044 voor `persoonlijk`);
een pipeline-toon moet bovendien op álle plekken bij (`TONES`, `TONE_INSTRUCTION`, `STYLE_LABELS`,
losse `TONE_OPTIONS`-arrays die typecheck mist, dashboard-maps). (PR #155, memory:
widget_persoonlijk_tone_and_tone_surface)

**Demo-org-instellingen zijn DB-backed — de mock overruled niet**
Symptoom: een wijziging in `lib/v0/klantendashboard/mock/*.ts` heeft geen effect op sandbox-orgs.
Oorzaak: `getOrgSettings()` doet partial-merge waarbij de `v0_org_settings`-DB-row wint van de mock
(`{...defaults, ...data}`). De mock = alleen first-visit-default voor orgs zónder de key.
Wat te doen: bij toon/settings-werk eerst de **DB-state** checken (via service-role, read-modify-
write), niet alleen de mock aanpassen. (PR #155, memory: widget_persoonlijk_tone_and_tone_surface)

**Klant-dashboard, admin-dashboard én V1 delen `app/klantendashboard/klant.css`**
Symptoom: een CSS-/layout-wijziging raakt onbedoeld meerdere dashboards.
Oorzaak: alle drie hangen aan hetzelfde design-systeem onder `[data-klant-scope]`
(`.klant-shell`/`-topbar`/`-sidebar`/`-main`). Bewust.
Wat te doen: houd admin-only widgets (bv. een latency-paneel) in de admin-route, niet in gedeelde
klant-componenten. Responsive shell = off-canvas drawer ≤900px; brede tabellen in een
`.table-scroll`/`overflowX:auto`-wrapper met `min-width:0` op `.klant-main`. (PR #146, memories:
responsive_dashboards_shared_css, project_latency_ttft)

**V1-auth: server-invite/recovery gebruikt `verifyOtp({token_hash})`, NIET PKCE**
Symptoom: een invite/reset-link werkt niet (of faalt op een ander toestel geopend).
Oorzaak: een server-geïnitieerde flow heeft geen code_verifier → `exchangeCodeForSession`/PKCE
werkt niet.
Wat te doen: e-mailtemplates linken naar de eigen route `…/v1/auth/confirm?token_hash={{ .TokenHash }}&type=<waarde>`
(Confirm signup/Magic link = `type=email`, Invite = `type=invite`, Reset = `type=recovery`);
hardcode het domein i.p.v. `{{ .SiteURL }}`. De Supabase invite-template moet `{{ .TokenHash }}`
emitten (niet de default `{{ .ConfirmationURL }}`) — dit is een launch-blocker voor klant-onboarding.
(memories: v1_auth_email_templates, v1_launch_ops_progress)

**Firecrawl laat contentloze pagina's helemaal WEG uit batch-scrape-resultaten**
Symptoom: een lege pagina komt niet binnen als doc met lege markdown; het `excluded`-pad is er
niet mee te triggeren.
Oorzaak: Firecrawl geeft geen doc terug voor contentloze pagina's; een 404 komt wél terug als doc
met statusCode 404 → `failed`.
Wat te doen: toets het invariant "niet als content opgenomen" (afwezig OF excluded = goed). (PR #121,
memory: crawler_observability_eval_pr121)

**Service-role-client in react-server tsx-scripts → `React.createContext`-crash**
Symptoom: een `--conditions=react-server` tsx-script crasht op de import.
Oorzaak: `@/lib/supabase/admin` → `lib/auth` → `next/navigation`.
Wat te doen: injecteer de client als parameter (DI) + gebruik een type-only admin-import, zodat
scripts een direct-aangemaakte service-role-client meegeven (zie `scripts/v0-crawl-debug.ts`).
(PR #121, memories: crawler_observability_eval_pr121, project_v1_strategy)

**Actieve org in het klantendashboard komt uit de `v0_active_org`-cookie, NIET uit `?org=`**
Symptoom: `?org=<slug>` in de dashboard-URL doet niks.
Oorzaak: `getActiveOrgFromCookies()` (server components/layout) leest alleen de cookie; de
`?org=`-route zit enkel in `getActiveOrgId(req)` voor API-routes.
Wat te doen: previewen = zet de (non-httpOnly) cookie of gebruik de org-switcher. Een nieuwe
V0-org toevoegen? Zet de slug in de `OrgSlug`-union in `active-org.ts` → `npm run typecheck` somt
elke `Record<OrgSlug>` op die je nog moet vullen (autoritatieve checklist). (PR #98, memory:
v0_add_org_and_dashboard_org_resolution)

**`ActionResult<T>` (lib/errors/action.ts) heeft GEEN `.data` — payload is FLAT**
Symptoom: `res.data.x` is undefined.
Oorzaak: op de ok-branch staat de payload flat op het object (`res.rootUrl`, niet `res.data`).
Wat te doen: lees velden direct van het resultaat. (PR #107, memory: crawler_dashboard_plan)

**Review-false-positive: "switch zonder `default`" in een functie met expliciet return-type**
Symptoom: een reviewer (mens of AI) wil een `default`-tak toevoegen aan bv. `httpStatusFor`
(`lib/errors/app-error.ts`).
Oorzaak: met een gedeclareerd return-type (`: number`) en zonder `default` bewijst TypeScript dat de
switch uitputtend is — een nieuwe enum-waarde zonder case wordt een compile-fout.
Wat te doen: géén `default` toevoegen; dat zou die bescherming juist weghalen. (memory:
nacht_audit_2026_06_14)

**V1-auth: overige confirm-route- en Supabase-valkuilen**
- `email_change` (Account → e-mail wijzigen) redirect na bevestiging naar `/v1/app/account`, niet naar
  set-password; *Reauthentication* is een 6-cijferige code in de lopende sessie en loopt níet via
  `/v1/auth/confirm`.
- Een toekomstige self-serve signup: controleer dat "Confirm email" aanstaat bij de Email-provider,
  anders verstuurt Supabase de bevestigingsmail nooit.
- Supabase weigert invites naar `@example.com`-adressen — een e2e-test die een invite verstuurt
  faalt daarop in de testomgeving; dat is een env-limiet, geen bug.
(PR #219/#251, memories: v1_auth_email_templates, project_v1_strategy)

**Playwright-e2e: eerste hit op een route kan time-outen door koude compile**
Symptoom: een navigatie-test faalt sporadisch op een time-out, bij herhalen groen.
Oorzaak: de dev-server compileert een route pas bij de eerste request (>5s).
Wat te doen: warm de route op met één `curl` vóór de run, of draai tegen een productie-build.
(memory: controlroom_admin_dashboard_v0)
