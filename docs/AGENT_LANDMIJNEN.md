# ChatManta — Agent-landmijnen

_Gedistilleerd uit de opgebouwde sessie-kennis op 2026-07-06 (51 items). Levend document —
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
