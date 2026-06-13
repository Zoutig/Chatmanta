# PLAN — WP4: Q&A-update vervangt oude kennisbank-info (Niels item 11)

> Optie A (ingest-route) gekozen door Sebastiaan. Dit is RAG-kern + datamodel →
> plan-approval vereist vóór bouw (hard rule). Triage: docs/superpowers/specs/2026-06-12-niels-punchlist-triage.md.

## Probleem (geverifieerd)

Een handmatig geüpdatete Q&A (openingstijden 18:00 → 19:00) wint alleen als de
bezoeker de vraag bijna letterlijk stelt. Drielaags:
1. Handmatige Q&A leeft alléén in `v0_org_settings.qa` jsonb — wordt **nooit ge-embed**,
   dingt dus niet mee in vector-search.
2. De fast-path (`findMatchingManualQA`, rag.ts:1644) matcht op token-Jaccard ≥0.6:
   "wat zijn de openingstijden" matcht (→19:00), "hoe laat sluiten jullie" deelt geen
   tokens → valt erlangs.
3. De RAG-fallback haalt dan de **oude gecrawlde chunk** met 18:00 op.
   (Cache-invalidatie bij Q&A-mutatie is al opgelost in WP3 / PR #178.)

## Optie A — Q&A wordt een echte kennisbron

Hergebruik de bestaande wrappers `ingestText` (rag.ts:3153, source `v0_local` +
metadata) en `deleteDoc` (rag.ts:3225, CASCADE, org-scoped). Quiz-precedent:
quiz-antwoorden gaan al via `ingestText` met `metadata.origin` + een
`setAnswerIngestedDoc`-koppeling.

### Taak 1 — datamodel (geen migratie)
- `ManualQA` (types.ts:126) krijgt `ingestedDocId?: string` — optioneel veld in de
  bestaande `qa`-jsonb, dus **geen migratie** en backward-compat voor bestaande rijen.

### Taak 2 — ingest-wrapper
- `ingestManualQA(orgId, item)` in lib/v0/klantendashboard/server/settings.ts (of een
  klein server-only buurmodule): formatteert de Q&A als tekst
  (`Vraag: …\nAntwoord: …`), roept `ingestText` met `metadata {origin:'manual_qa', qa_id}`,
  geeft de nieuwe `docId` terug. orgId verplicht.

### Taak 3 — CRUD-integratie (settings.ts)
- `upsertQAItem`: failure-veilige volgorde — **ingest-nieuw → settings-update (met nieuwe
  ingestedDocId) → delete-oud** (`deleteDoc(oldDocId)`). Kort duplicaat-venster is beter
  dan een dataverlies-venster. Alleen ingesten als `active` (inactieve Q&A hoort niet in
  retrieval).
- `deleteQAItem`: vóór de settings-write ook `deleteDoc(ingestedDocId)` (AVG-wisrecht —
  content moet echt uit de vector-search verdwijnen).
- `setQAActive`: `true` → ingest (indien nog geen doc); `false` → deleteDoc + ingestedDocId
  wissen. Een uitgezette Q&A mag niet meer opduiken in antwoorden.
- Cache-purge: al aanwezig (WP3) op alle drie de paden.

### Taak 4 — backfill
- `scripts/v0-backfill-manual-qa.mjs` (dry-run default): ingest alle bestaande actieve
  Q&A's zonder `ingestedDocId` en schrijf de id terug. Idempotent.

### Taak 5 — verificatie
- Repro op dev-org: Q&A "openingstijden → 19:00" updaten → vraag "hoe laat sluiten jullie"
  → antwoord noemt 19:00 (niet 18:00). Plus delete-pad: Q&A verwijderen → chunk weg uit
  vector- + hybrid-search + cache leeg.

## De design-fork (jouw beslissing) — de oude crawl-chunk

Optie A láát de oude crawl-chunk (18:00) staan en zet er een verse Q&A-chunk (19:00)
naast. Bij een herformulering haalt vector-search nu beide op → de LLM ziet 18:00 én 19:00.
Of de Q&A wint hangt af van de ranking. Drie niveaus van "supersede":

- **A1 — alleen ingest (lichtst):** Q&A-chunk dingt mee. Kort, focust precies op de vraag →
  rankt meestal boven de diffuse crawl-chunk, maar bij een conflict kan de LLM beide tijden
  zien. Minimaal, scope-trouw.
- **A2 — ingest + prompt-prioriteit:** de system/user-prompt krijgt een regel "een
  handmatige Q&A is gezaghebbender dan gecrawlde website-tekst bij tegenstrijdigheid".
  Geen extra retrieval-werk, lost het conflict deterministisch in het voordeel van de Q&A.
  (Raakt de prompt → eval-cache wissen + smoke.)
- **A3 — ingest + actieve supersede:** bij ingest de top-N meest-gelijkende crawl-chunks
  via embedding-similarity opsporen en de bovenliggende `website_page` markeren/soft-skippen.
  Robuust maar het zwaarst (datamodel + risico op te agressief verbergen). Eigen vervolg-PR.

**Aanbeveling: A2** — ingest + één prompt-regel. Lost Niels' klacht deterministisch op,
blijft binnen Optie A, geen nieuw datamodel, één goedkope eval-smoke.

## Hard rules / risico's
- orgId verplicht op ingest + delete (vector-isolation); geen nieuwe service-role clients
  (alleen ingestText/deleteDoc).
- Geen soft-delete voor docs bouwen (bestaat niet; harde deleteDoc met CASCADE — dode
  embedding-rijen zouden anders de HNSW-index laten groeien).
- redactPii op operator-Q&A? Quiz-antwoorden redacten; operator-Q&A is bedoeld als publiek
  opvraagbaar → **niet** redacten, maar wel: de UI moet duidelijk maken dat Q&A-content via
  de widget publiek opvraagbaar wordt (kleine hint, al grotendeels impliciet).
- A2 raakt de prompt → eval-baseline: cache wissen + hard-eval-smoke vóór merge.

## Effort
M (Taken 1-5). A2 voegt ~3 regels prompt + een smoke toe. A3 zou het L maken.
