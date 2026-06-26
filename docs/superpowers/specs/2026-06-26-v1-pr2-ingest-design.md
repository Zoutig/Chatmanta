# V1 PR-2 — Ingest naar V1 (client-geïnjecteerde `ingestDocument` + CLI) — Design

**Datum:** 2026-06-26
**Status:** Ontwerp — goedgekeurd door Sebastiaan in de brainstorm; wacht op spec-review vóór `writing-plans`.
**Beslisser:** Sebastiaan (solo).
**Branch / worktree:** `feat/seb/v1-pr2` · `C:\Users\solys\Documents\Code\chatmanta-v1-pr2`
**Vervolg op:** PR-1a (#212, kernel-graduatie) + PR-1b (#213, V1-retrieval-pad). Tweede slice van de big-ship-mijlpaal "kernel-graduatie + V1-RAG achter auth" (spec `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` §7 PR-2).

---

## 0. Samenvatting in gewone taal

V1 kan nu wél een vraag beantwoorden (PR-1b), maar alleen over chunks die we via een seed-script hebben neergezet. PR-2 geeft een V1-org een **echt pad om eigen documenten in te laden**: een admin draait een CLI (`npm run v1:ingest --org <org> --file <doc>`), die het document parseert (PDF/DOCX/TXT), in **parent- + child-chunks** knipt, embeddt en in de V1-database schrijft (via de V1-hoofdsleutel/service-role) — gestempeld met de juiste org + chatbot. Daarna is dat document bevraagbaar via het bestaande `/v1/app`-pad.

---

## 1. Vastgelegde beslissingen (brainstorm 2026-06-26)

| # | Beslissing | Keuze | Waarom |
|---|---|---|---|
| 1 | **Ingest-surface** | **CLI/script-pad** (`npm run v1:ingest`), géén upload-UI. | Spec-DoD zegt "(admin/seed-)pad"; bewijst de DoD minimaal; UI uitgesteld. |
| 2 | **Bestandsformaten** | **TXT/MD + PDF + DOCX** door `extractDocText` te hergebruiken (verplaatst naar neutraal). | Echte klantdocs zijn PDFs; de parser bestaat al (pdf-parse/mammoth) → goedkoop hergebruik. |
| 3 | **Architectuur** | **Approach 1:** nieuwe neutrale, client-geïnjecteerde `lib/rag/ingest.ts` (`ingestDocument(client, input)`), gegeneraliseerd uit de seed-script-parent-logica. | Consolideert bestaande duplicatie (3 kopieën), consistent met de PR-1a read-graduatie, V0 ongewijzigd. Verworpen: een `withParents`-vlag op V0's `ingestText` (V0-flat ≠ V1-parents, raakt het V0-prod-pad) en een V1-only ingest (laat de duplicatie staan). |
| 4 | **Chatbot-resolutie** | Ingest **resolveert-of-maakt-aan** de enige chatbot van de org (één-per-org-automatisch). | Spec §6: auto-create is **seed/ingest-only**, nooit op het lees-pad. |
| 5 | **Idempotentie** | **Append-only** (elke run voegt een document toe). `--replace`/dedup uitgesteld. | Minimaal; een handmatige admin-CLI. `ponytail:` ceiling, opwaardeerpad = dedup-op-filename later. |
| 6 | **Migratie** | **Geen `0003`.** 0002's tabellen (documents/parent_chunks/document_chunks met `chatbot_id`) dekken ingest al. | Kleinste oppervlak; geverifieerd tegen 0002. |

---

## 2. Doel & niet-doel

**Doel:** een neutrale, client-geïnjecteerde `ingestDocument` + een V1-CLI waarmee een V1-org **eigen documenten (TXT/PDF/DOCX) inlaadt** — parent+child-chunks, org+chatbot-gestempeld, via de V1-service-role — en daarop bevraagd kan worden via het bestaande `/v1/app`-pad. V0-ingest blijft byte-identiek.

**Bewust buiten scope (latere mijlpalen):** upload-UI · document-lijst/verwijder-pad in V1 · crawler→V1 (`website_pages` bestaat niet in V1 — PR-3) · `--replace`/dedup · V0-seed-scripts dedupliceren op de nieuwe functie (alleen `v1-seed-chunks.ts` refactort nu) · `answer_cache` (V1 heeft die niet) · `callLLM`/Anthropic (eigen mijlpaal).

---

## 3. Architectuur

### 3.1 Uitgangssituatie (recon 2026-06-26, tegen main na PR-1b)

- **V0 `ingestText`** (`lib/v0/server/rag.ts:206`) schrijft **FLAT** `document_chunks` (chunk 2000/200), **géén parents, géén `chatbot_id`**, en roept `purgeAnswerCache` aan. Productie-V0 maakt nooit parents — die bestaan alléén via de seed-scripts.
- **Parent/child-logica** leeft gedupliceerd in `scripts/v0-seed-orgs.ts`, `scripts/v0-reingest-parents.ts` en `scripts/v1-seed-chunks.ts` (parent 3200/400, child 800/100, children per-parent gechunkt zodat `parent_index` eenduidig is).
- **`extractDocText`** (`lib/v0/server/doc-parse.ts`) = puur `buffer → text` (pdf-parse v2 / mammoth / utf-8), `ALLOWED_DOC_EXT = ['pdf','docx','txt','md']`. Geen V0-koppeling behalve z'n locatie.
- **`embedTexts`** (`lib/rag/embeddings.ts`, `server-only`) — al neutraal, al gebruikt door `v1-seed-chunks.ts`.
- **V1-tabellen (0002)** ondersteunen ingest al: `documents`/`parent_chunks`/`document_chunks` met `organization_id`+`chatbot_id NOT NULL`, `documents.source CHECK in ('upload','v0_local')`.

### 3.2 File-structuur

**Nieuw (neutraal, importeert niets uit `lib/v0/**`):**
- `lib/rag/ingest.ts` — `ingestDocument(client, input)` + de gedeelde parent/child-chunker (`chunkParentsAndChildren`). `import 'server-only'`.
- `lib/rag/doc-parse.ts` — **verplaatst** van `lib/v0/server/doc-parse.ts`: `extractDocText`, `ALLOWED_DOC_EXT`, de error-types. `import 'server-only'`.
- `lib/rag/__tests__/ingest-chunker.test.ts` — unit-test voor de pure chunker.
- `scripts/v1-ingest.ts` — de CLI.
- `scripts/v1-test-ingest.ts` — deterministisch DoD-bewijs (ingest → query → grounded-assert).

**Gewijzigd:**
- `lib/v0/server/doc-parse.ts` — wordt een **re-export shim** (`export * from '@/lib/rag/doc-parse';`) zodat alle V0-callers (`adminUploadDocAction` etc.) byte-identiek blijven.
- `scripts/v1-seed-chunks.ts` — refactort z'n inline parent/child-kopie weg en roept `ingestDocument` aan (kill 1 van de 3 duplicaten). De org-wipe (idempotentie) blijft in de seed.
- `package.json` — `v1:ingest` + `v1:test-ingest` (react-server+tsx-pattern, zoals `v0:seed-orgs`).

**Ongewijzigd (bewust):** V0 `ingestText`/`ingestCrawlResults` (flat, prod-pad) · V0-seed-scripts · alle `lib/v0/**` gedrag · de V1-DB (geen migratie).

### 3.3 Grep-gate

`lib/rag/ingest.ts` + `lib/rag/doc-parse.ts` vallen onder de bestaande neutraliteits-gate (`no-adhoc-service-client.test.ts`): geen import uit `lib/v0/**`, geen service-role-factory direct (client wordt geïnjecteerd). `extractDocText` importeert alleen `pdf-parse`/`mammoth` → blijft groen.

---

## 4. De `ingestDocument`-interface

```ts
// lib/rag/ingest.ts — neutraal, client-geïnjecteerd
export type IngestInput = {
  organizationId: string;   // verplicht, op elke rij
  chatbotId: string;        // verplicht, op elke rij
  filename: string;
  text: string;
  source?: 'upload' | 'v0_local';            // default 'upload'
  metadata?: Record<string, unknown>;
};
export type IngestResult = {
  documentId: string; parents: number; chunks: number; embedTokens: number; costUsd: number;
};
export async function ingestDocument(client: SupabaseClient, input: IngestInput): Promise<IngestResult>;
```

**Schrijft** (alles `organization_id`+`chatbot_id`-gestempeld):
1. `documents`-rij — `status:'processing'`, `source`, `metadata:{ chars, parent_count, chunk_count, ...input.metadata }`; aan het eind → `status:'ready'` (of `'failed'` bij fout).
2. Per parent (chunker 3200/400): een `parent_chunks`-rij met `parent_index`.
3. Children per parent (800/100): `document_chunks` met `embedding`, `parent_chunk_id`, `metadata:{ chunk_index, parent_index }`.

**Embeddt** via `embedTexts` (gebatcht over alle children). **Geen `purgeAnswerCache`** (V1 heeft geen `answer_cache`). Gedeelde chunker `chunkParentsAndChildren(text)` vervangt de 3 inline-kopieën (één bron-van-waarheid, met trimming/lege-slice-drop).

---

## 5. CLI-flow (`scripts/v1-ingest.ts`, V1-service-role)

`node … --conditions=react-server --import tsx scripts/v1-ingest.ts --org <slug|id> --file <pad> [--name <label>]`

1. `getV1ServiceRoleClient()`.
2. **Org resolveren** — by slug óf id (de seed-orgs hebben slugs `seed-org`/`seed-org-b`).
3. **Chatbot resolveren-of-aanmaken** — `getOrgChatbot(client, orgId)`; geen → INSERT één `chatbots`-rij (één-per-org). (Spec §6: ingest mág auto-createn.)
4. **Bestand lezen** → `extractDocText(buffer, ext)` (ext uit het pad; valideer tegen `ALLOWED_DOC_EXT`).
5. `ingestDocument(client, { organizationId, chatbotId, filename, text, source:'upload' })`.
6. Log `{ documentId, parents, chunks, costUsd }`.

---

## 6. Idempotentie & foutafhandeling

- **Append-only** — elke run voegt een nieuw `documents` + chunks toe. Re-run = duplicaat (aanvaard voor een handmatige CLI; `--replace`/dedup uitgesteld). `ingestDocument` zelf voegt alleen toe; de seed-script behoudt z'n eigen org-wipe.
- Onleesbaar bestand / niet-toegestane extensie → CLI faalt luid (exit 1).
- **Lege geëxtraheerde tekst** (gescande PDF zonder tekstlaag) → `AppError('INGEST_READ_FAILED')` (spiegelt V0).
- Embed-/schrijf-fout → `documents.status='failed'` + throw (spiegelt V0). Een mislukte run laat een `'failed'`-rij achter; re-run voegt een nieuwe toe (aanvaard voor CLI).

---

## 7. Testen / Definition of Done-bewijs

1. **Unit-test** (`lib/rag/__tests__/ingest-chunker.test.ts`): de pure `chunkParentsAndChildren` — parent-grenzen, `parent_index`-toekenning, child→parent-mapping, lege-input-rand.
2. **Integratie-bewijs** (`scripts/v1-test-ingest.ts`, deterministisch, gate-run, spiegelt `v1:test-org-isolation`): ingest een doc met een uniek feit in de seed-org → draai `runRagQuery` (via de juiste client) → assert dat het antwoord/de sources gegrond zijn in dat feit. Bewijst de DoD ("een V1-org laadt eigen doc → bevraagbaar").
3. **Bestaande gate:** typecheck + `test:unit` (grep-gate blijft groen — `lib/rag/ingest.ts`/`doc-parse.ts` importeren niets uit `lib/v0`) + clean build.

**DoD PR-2:** een V1-org kan via `npm run v1:ingest` eigen documentinhoud (TXT/PDF/DOCX) inladen (parents+children, org+chatbot-gestempeld, via V1-service-role) en daarop een gegrond antwoord krijgen; V0-ingest aantoonbaar ongewijzigd; grep-gate + typecheck + test:unit + build groen.

---

## 8. Te verifiëren tijdens de bouw (geen aanname)

1. **`doc-parse.ts`-verplaatsing** breekt geen V0-caller (re-export shim) — typecheck + build groen; `adminUploadDocAction` ongewijzigd.
2. **`extractDocText` onder `--conditions=react-server`** (pdf-parse v2 dynamische import) werkt vanuit het tsx-CLI-pad (net als `embedTexts`).
3. **`v1-seed-chunks.ts`-refactor** levert identieke seed-data (parents+children) — `v1:test-org-isolation` blijft 3/3.
4. **Grep-gate** vangt een per ongeluk `lib/v0`-import vanuit de nieuwe `lib/rag/`-modules.
5. **Geen migratie nodig** — bevestig dat ingest tegen 0002 schrijft zonder schema-wijziging.

---

## 9. Risico's / caveats

1. **Echte klantdata-structuren** — ingest schrijft via de V1-service-role (RLS-bypass) met expliciete org+chatbot; de read-isolatie (RLS + RPC-predicaten) is al bewezen in PR-1b. Append-only voorkomt per ongeluk data-verlies.
2. **`doc-parse`-verplaatsing** raakt een V0-prod-pad indirect (re-export) → build + een V0-upload-smoke verifiëren.
3. **PDF-parsing** (pdf-parse v2) kan op rare PDFs lege tekst geven → de `INGEST_READ_FAILED`-gate vangt dat luid.
4. **Append-only duplicaten** bij re-ingest — bewust; dedup is een latere lever.

---

## 10. Definition of Done — PR-2

1. `lib/rag/ingestDocument(client, input)` bestaat, neutraal, client-geïnjecteerd, parent+child, org+chatbot verplicht.
2. `lib/rag/doc-parse.ts` (verplaatst) + V0 re-export shim; V0-callers ongewijzigd.
3. `npm run v1:ingest` laadt een TXT/PDF/DOCX-document in voor een V1-org (auto-create chatbot).
4. `scripts/v1-test-ingest.ts` bewijst: ingest → gegrond antwoord.
5. `v1-seed-chunks.ts` gebruikt `ingestDocument` (1 duplicaat weg); `v1:test-org-isolation` blijft 3/3.
6. V0-ingest byte-identiek; grep-gate + typecheck + test:unit + clean build groen.
7. Statusnotitie + memory-update ([[project_v1_strategy]]).

Daarna: **PR-3** (crawler + `answer_cache` naar V1 — let op de cache-key-landmijn: `chatbot_id` aan de key).
