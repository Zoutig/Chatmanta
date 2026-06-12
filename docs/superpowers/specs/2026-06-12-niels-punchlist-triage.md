# Niels-punchlist triage — grounded spec (intake 2026-06-12)

> Bron: mondelinge/chat-punchlist van Niels (10 items, genummerd 1-4, 8-12) + aantekeningen
> Sebastiaan. Intake-critique gedraaid via Workflow `intake-niels-punchlist` (6 recon-diagnoses,
> overlap-radar, 6 lenzen, judge — 15 agents). Dit doc is de SPEC-input voor de vervolg-builds.

## Intake-preamble

**Niels-diff (samengevat):** Niels meldde 10 losse observaties zonder repro-stappen/org/omgeving.
De triage classificeert: 3 bevestigde bugs (1, 10-cache, 11), 1 te-diagnosticeren bug (9),
1 config/ops-issue (4), 2 UX-verbeteringen (2, 12), 1 feature (3), 1 V1-bound item (8).
Twee van Niels' "bugs" zijn (deels) by-design: item 8 (UI zegt eerlijk "volgt in V1") en
item 10-taal (autodetect spiegelt de bezoeker; alleen nl/en wordt gedetecteerd).

**Overlap-verdicts (radar):** géén dubbel-bouw-risico's behalve item 10 → **STOP op herbouw**:
de settings-pipeline is wél end-to-end aangesloten (PR #155/#166); de echte boosdoener is de
answer_cache die settings-wijzigingen overleeft. Item 3 heropent expliciet Fase 1-beslissing #4
("klant-zichtbare terugkoppeling blijft verborgen", docs/FEEDBACKSYSTEEM_PLAN.md) — productbesluit
vereist. Item 8 overlapt de V1-kickoff-spec (2026-06-09) — kern is V1 Phase 1-werk.

**Scope-verdicts:** alles V0-compatibel behalve item 8 (kern = V1; dun V0-contactveld optioneel)
en de taal-keuze in item 10 (5 talen = de facto uitbreiding voorbij standard-tier nl/en —
expliciete scope-beslissing).

**Kosten & effort:** geen enkel item introduceert structurele LLM-kosten. Totaal effort over
alle pakketten: ~4-6 werkdagen verspreid; quick wins (WP1/WP2/WP5) samen <1 dag.

---

## Per-item diagnose (codebase-gegrond)

### 1. Quiz start niet bij crawl-only kennisbank — **bug-fix, S**
Gate in `triggerQuizAnalysisAction` (app/actions/controlroom.ts:335-338) telt via `listDocs`
alleen de `documents`-tabel; de crawler schrijft chunks aan `website_pages` zonder documents-rij
(lib/v0/crawler/processCrawl.ts:97-147) → crawl-only org = "Kennisbank is leeg".
**Tweede laag:** `fetchSample` (lib/controlroom/server/quiz-analysis.ts:112-135) sampelt óók
alleen via listDocs — gate-only fix start een quiz die niets samplet (vol generatie-tarief voor
branchelos giswerk). **Fix:** gate via bestaande `hasAnySource`-compositie
(lib/v0/klantendashboard/server/metrics.ts:88) + fetchSample direct uit `document_chunks` per
org mét included/deleted_at-filter (patroon 0046_v0_hybrid_keyword_or.sql:64). Samen shippen.

### 2. "Gebruikte bronnen" druk → inklap-knop — **small-ux, S**
Geen bug; altijd-open aside in app/klantendashboard/gesprekken/[id]/page.tsx (aggregatie :45-50,
slice(0,10) :220). Verergeraars: geen dedupe (multi-turn = dubbele bronnen), stille truncatie.
Identieke sectie in admindashboard gesprek-detail. **Fix:** gedeeld client-component
`SourcesCard` met toggle (desktop open, ≤760px dicht), dedupe + count + "+N meer"; beide
dashboards testen (gedeelde klant.css, PR #146-les). Geen admin-only data naar klant-kant lekken.

### 3. Reply-mail naar klant vanuit feedback — **feature, S — productbesluit vereist**
Bouwstenen liggen er: `admin_feedback.submitter_email` verplicht sinds PR #160 (+
privacy_accepted_at), sendEmail/Resend-laag, events-patroon. Geen dependency op item 8
(gebruik submitter_email, niet de mock-account-mail). **Maar:** klant-zichtbare terugkoppeling
was expliciete Fase 1-out-of-scope-beslissing #4 — eerst bekrachtigen. **Ontwerp:** reply-builder
+ `sendFeedbackReplyEmailAction` + checkbox "stuur naar klant" (nooit default-aan), gate op
submitter_email + privacy_accepted_at, confirm-stap met getoond adres, rate-limit, event-log
(kind 'comment', body ≤4000), SendEmailResult zichtbaar (niet stil-slikken). Geen LLM-drafts in
V0 (hallucination-risico in klant-facing kanaal).

### 4. Em-dashes in mail + Niels krijgt geen notificatie — **config-fix, XS**
**4A:** hardcoded '—' in lib/notifications/feedback-email.ts (:50-52, :83, :94, :105). Copy
herschrijven zónder em-dash (entity-escapen lost niks op; plain-text-variant rendert entities
niet). **4B:** lokaal staat `FEEDBACK_NOTIFY_EMAIL=s.olyslag@gmail.com` (.env.local:44), maar
memory zegt dat Vercel-prod op 2026-05-31 naar Niels is omgezet + e2e geverifieerd → klacht
botst daarmee. **Eerst verifiëren:** actuele Vercel-env (FEEDBACK_NOTIFY_EMAIL + RESEND_FROM —
default in email.ts is nog .nl → stil-geslikte 403) + Resend-dashboard-logs; daarna pas omzetten
+ redeploy + echte prod-testmelding. Vraag aan Niels: wélk adres + spam-check.

### 8. Bedrijfsnaam/accountnaam/e-mail niet aanpasbaar — **v1-bound, defer (advies)**
Bewust mock: KNOWN_ORGS (lib/v0/server/active-org.ts:42-70) + getMockAccountInfo; UI zegt
"Wijzigen volgt in V1" (account/page.tsx:210). Echte account-identiteit = exact V1 Phase 1
(Supabase Auth + organization_members). V0-bouwen = wegwerpwerk + sandbox-risico (iedereen met
demo-wachtwoord kan elke org's mail-kanaal kapen) + nodigt uit tot echte klantdata in sandbox
(hard rule). **Optioneel dun V0-deel** (alleen na expliciet akkoord): contactpersoon+e-mail als
nieuw jsonb-block in v0_org_settings (= nieuwe kolom = migratie ~0048, eerst /check-migration),
gelabeld als demo-data, nooit bron voor uitgaande mail. Default: deferren.

### 9. Feedback met bijlage faalt volledig — **bug-fix, S — diagnose eerst**
Root cause ONBEWEZEN. "Faalt volledig" spreekt het soft-fail-design tegen (upload-fout hoort als
internal_note te landen terwijl de melding wél opslaat, actions.ts:237-252) → fout zit vóór het
vangnet. **Hoofdverdachte:** Vercel's harde ~4,5MB request-body-cap die
`serverActions.bodySizeLimit` (12MB) negeert — UI belooft 10MB. **Volgorde:** (1) repro
klein/groot bestand, (2) internal_notes van gefaalde meldingen lezen, (3) migrate:status prod +
bucket-check (`feedback-attachments`, aangemaakt in 0043:105-107), (4) env-keys. Fix verwacht:
client-side size/type-precheck + expliciete faal-melding aan indiener; bijvangst: magic-byte
check + bucket file_size_limit/allowed_mime_types. Access-model niet versoepelen.

### 10. "Niks onder instellingen werkt" — **bug-fix, M — STOP op herbouw**
Wiring is gezond (tone ✅, flags ✅, fallbackMessage ✅). **Co-root-cause die alles verklaart:**
answer_cache is gekeyed op (org, bot-versie, vraag-embedding) zónder tone/taal/lengte
(rag.ts:540-597) en `saveChatbotSettingsAction` invalideert nooit → Niels' logische test
(instelling wijzigen → zelfde vraag herhalen) serveert het oude antwoord. Exact het
PR #149-precedent. **Taal-nuance:** `detectLanguage` kent alleen nl|en|mixed|unknown
(hard-eval-checks.ts:201-210) — es/de/fr wordt niet gedetecteerd; bij primaryLanguage='es' +
autodetect UIT vuurt de directive wél al (rag.ts:2323-2326). Niels' Spaans-repro is waarschijnlijk
cache óf autodetect-AAN + NL-vraag (= by-design spiegelen). **answerLength werkt vrijwel zeker
al** (buildSystemPrompt past lengthMap toe, lib/v0/style.ts:81-115). **Fix-volgorde:**
(1) herbruikbare org-scoped cache-purge-wrapper + aanroep in saveChatbotSettings — hoogste
leverage van de hele punch-list, randvoorwaarde voor item 11; (2) repro met gewiste cache vóór
verdere bouw; (3) taal = scope-besluit: detector uitbreiden naar 5 talen (verplaats detectLanguage
naar eigen module — PR #163-eval consumeert hem ook) óf UI terugsnoeien naar nl/en; (4)
UI-eerlijkheid: help-tekst + stale "Save is mock-only"-comment weg (instellingen/page.tsx:4).
Bij promptwijziging: org-cache wissen + smoke-eval.

### 11. Q&A-update vervangt oude info niet — **rag-werk, M — eigen pakket, plan-eerst**
Drielaags, alle geverifieerd: (a) handmatige Q&A leeft alléén in v0_org_settings.qa jsonb
(upsertQAItem, settings.ts:195-208) — wordt nooit ge-embed/geingest, dingt niet mee in
vector-search; (b) fast-path matcht op token-Jaccard ≥0.6 (manual-qa.ts:99-118): "wat zijn de
openingstijden" matcht (→19:00), "hoe laat sluiten jullie" deelt geen tokens → RAG-fallback vindt
de oude crawl-chunk (18:00); (c) answer_cache kan pre-update antwoorden blijven serveren.
Contrast: quiz-antwoorden gaan wél via ingestText. **Opties voor het plan:**
- **A (ingest-route):** `ingestManualQA` via bestaand ingestText (metadata
  `{origin:'manual_qa', qa_id}`, quiz-precedent), `ingestedDocId` in qa-jsonb, vervangen via
  harde deleteDoc (CASCADE; géén soft-delete bouwen — bestaat niet voor docs, dode
  embedding-rijen groeien onbegrensd), failure-ordering ingest-nieuw → settings-update →
  delete-oud, delete-pad completeren (AVG-wisrecht) + backfill.
- **B (lichter):** findMatchingManualQA semantisch (vector-fallback naast Jaccard), geen
  duplicate chunks.
- Beide lossen de stale crawl-chunk niet vanzelf op → supersede via embedding-similarity
  (hergebruik berekende vector, ~$0, deterministisch — géén LLM-judge) of accepteren dat de
  verse Q&A-chunk meedingt.
In alle gevallen: cache-purge bij Q&A-mutaties (wrapper uit WP3) + eerlijke UI-hint. Must-fix:
orgId verplicht (NIET het DEV_ORG_ID-default-anti-patroon van lookupCachedAnswer kopiëren),
alleen bestaande wrappers (SA-5), besluit over redactPii op operator-Q&A.

### 12. Hoe wordt "behulpzaamheid" berekend? — **uitleg/tooltip, S**
`computeSuccessRate` (conversations.ts:206-275): % threads deze kalendermaand waarvan laatste
antwoord géén fallback was én geen duim-omlaag (set-unie). Getoond zonder tooltip
(metric-strip.tsx:34-40). **Valkuil:** admindashboard toont onder vergelijkbaar label een ÁNDER
getal (downPct zónder fallback-check, bot-performance.ts:189/216). **Fix:** herbruikbaar
`InfoTip`-component (touch + keyboard, geen kale title-attr; MetricStrip is server →
CSS-only/mini-client) + copy in klanttaal + admin-label disambiguëren. Formule-harmonisatie
apart parkeren (minimaal-eerst). Herbruikbaar op meerdere overzicht-kaarten (Sebastiaans wens).

---

## Werkpakketten + route-advies

| WP | Items | Route | Effort | Gate |
|----|-------|-------|--------|------|
| WP1 mail-hygiëne + delivery-verificatie | 4A+4B | config-only + automerge | XS | geen (verificatie eerst) |
| WP2 bijlage-diagnose & fix | 9 | direct (na diagnose) | S | geen |
| WP3 cache-invalidatie + instellingen | 10 | ship-feature | M | taal-scope-besluit |
| WP4 Q&A supersede | 11 | ship-feature (plan-eerst) | M | plan-goedkeuring (datamodel) |
| WP5 quiz crawl-gate + sample | 1 | direct (automerge) | S | geen |
| WP6 bronnen-collapse + InfoTip | 2+12 | ship-feature (licht) | S | geen |
| WP7 feedback-reply naar klant | 3 | ship-feature | S | productbesluit Fase 1-#4 |
| WP8 account-editbaarheid | 8 | **defer → V1** | — | alleen bij expliciet akkoord dun V0-deel |

**Volgorde-advies:** WP1 → WP2/WP5 (parallel, quick wins) → WP3 (fundament) → WP4 (hangt op
WP3-wrapper) → WP6 → WP7 (na productbesluit + WP1-verificatie). WP8 deferren.

## Open vragen (→ Sebastiaan, deels door te spelen naar Niels)

1. **WP7/item 3:** Fase 1-beslissing #4 heropenen — klant-zichtbare reply-mail ja/nee?
   Eventueel allowlist op de 3 named testklanten als vangnet?
2. **WP3/item 10:** taal — 5 talen ondersteunen (scope-uitbreiding) of UI terugsnoeien naar
   nl/en? En: stond autodetect aan tijdens Niels' Spaans-test?
3. **WP4/item 11:** optie A (ingest) vs B (semantische fast-path) vs beide; actief
   supersede-mechanisme of accepteren dat de Q&A-chunk meedingt?
4. **WP8/item 8:** dun V0-contactveld nu, of alles naar V1?
5. **Voor Niels:** welk mailadres = "persoonlijke chatmanta-mail" (+ spam-check)? Hoe groot was
   de bijlage en wat zag je precies? Stelde je ná de instellingen-wijziging dezelfde vraag
   opnieuw? Wil je bij behulpzaamheid uitleg of een ander getal?

## Pitch-scorecard (input voor NIELS_PITCH_TEMPLATE.md)

9/9 items diagnosticeerbaar, maar 3 (4B, 9, 10) vereisen een extra rondje terug door ontbrekende:
repro-stappen, org+omgeving+tijdstip, screenshots/letterlijke foutmeldingen, artefact-details
(bestandsgrootte, exact mailadres), en verwachting ("wat zou voor jou de oplossing zijn?").
Grootste enkele winst: de cache-disambiguatievraag ("stelde je dezelfde vraag opnieuw?")
standaard bij elk bot-gedrag-item. Item 11 was de positieve uitzondering (letterlijke vragen +
antwoorden erbij) — dat hoort de norm te zijn. → Template aangemaakt: `docs/NIELS_PITCH_TEMPLATE.md`.
