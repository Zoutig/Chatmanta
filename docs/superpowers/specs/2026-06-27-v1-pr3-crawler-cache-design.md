# V1 PR-3 — Full website crawler + answer_cache → V1 (DRAFT design for plan-review)

Last slice of the kernel-graduation + V1-RAG milestone. Model: **pages-as-documents**. V1 project ref `tfijdnxqdvwzwgxdioqo`, migrations in `supabase/migrations-v1/`, applied via Supabase MCP `apply_migration` + manual `public._migrations` ledger row. Next number = **0003**.

## Pinned decisions (Sebastiaan, this session)
1. **Page-model:** keep `knowledge_sources` as grouping/dedup/status table; crawled page = a `documents` row. Add to `documents`: `knowledge_source_id uuid FK CASCADE`, `included boolean NOT NULL DEFAULT true`, `content_hash text`. Put `source_url`/`source_title` in `documents.metadata`. Widen `documents.source` CHECK to add `'website'`. Re-crawl = claim-gated `DELETE documents WHERE knowledge_source_id=X` (CASCADE → parent_chunks + document_chunks).
2. **Cron:** real V1 cron route `/api/v1/cron/process-crawls` (GET + Bearer `CRON_SECRET`, `getV1ServiceRoleClient()`), driven by an external pinger (mirrors V0). Plus the client-tick action as primary in-session path.
3. **Dashboard:** re-home to `app/v1/app/kennisbank/`, member-scoped via `requireOrgMember(orgId)`; org + single active chatbot resolved from the session via one shared helper (reused from `askV1`).
4. **Split:** three sequential sub-PRs (3a schema → 3b backend → 3c UI), each its own review-loop + merge. 3a before 3b before 3c.

## Folded decision (Q4, hard-rule-forced) — RPC + flags
- Under pages-as-documents there is **NO `website_pages` table to JOIN**. The V1 RPC stays document-centric. `match_chunks_with_parents` is **dropped+recreated** to: surface `source_url = d.metadata->>'source_url'`, `source_title = d.metadata->>'source_title'`, add `and d.included` to the filter, keep `p_chatbot_id`, keep `d.deleted_at is null`, keep `security invoker` + `search_path = public, extensions, pg_temp`, keep the defense-in-depth org+chatbot re-assert in JOINs.
- `answer_cache` gains `chatbot_id` (table + `lookup_cached_answer` RPC + the injected-client engine helpers). Cache key → `(org, chatbot_id, bot_version, embedding cos-sim ≥ 0.93)`.
- **Flag-flip ordering (correctness gate):** land schema + RPC + chatbot-scoped cache first, prove org/chatbot isolation, THEN flip `cacheEnabled:true` (end of 3a, after cache isolation proven) and `sourceLinksEnabled:true` (after 3b, once website docs carry source_url). **Defer `hybridSearch`** (not in goal; V1 lacks `match_chunks_hybrid`; engine fails closed — keep false).

## Scope correction vs gap-finder: FAQ pre-cache NOT ported
V0's `answer_cache` is dual-role (semantic cache + FAQ pre-cache delivery store via `faq-snapshot.ts`). **V1 has no FAQ feature** (no `klant_faq_snapshot`, no FAQ cron/judge). Porting the FAQ feature is out of scope for PR-3 (crawler + cache). So **V1 `answer_cache` is engine-only**; `faq-snapshot.ts` stays V0-only. The "double-role landmine" is handled by *not introducing* the second role in V1. Note for the future: when FAQ is ported to V1, its writers must respect the chatbot_id key.

---

## Milestone 3a — Schema + RPC + cache  `[independent]`
Branch `feat/seb/v1-pr3a`. One migration `0003_v1_website_cache.sql` carrying **all** PR-3 schema (so 3b/3c need no migration).

**Migration 0003 contents (RLS in-file on every table; org_id + chatbot_id NOT NULL; service-role mutations only, SELECT policy mirroring `0001_core_tenancy`):**
- `knowledge_sources` — port V0 0032/0037: `id, organization_id NOT NULL FK, chatbot_id NOT NULL FK chatbots, type DEFAULT 'website' CHECK(website), name, root_url, normalized_host, status CHECK(pending|crawling|ready|failed), disabled_at, metadata jsonb, created_at, updated_at, deleted_at`. Index `(org) WHERE deleted_at IS NULL`; UNIQUE partial `(organization_id, chatbot_id, normalized_host) WHERE type='website' AND deleted_at IS NULL AND normalized_host IS NOT NULL` (note: uniqueness now scoped per-chatbot too).
- `processing_jobs` — port V0 0032: `id, organization_id NOT NULL, chatbot_id NOT NULL FK, job_type CHECK(crawl_website|process_document|reprocess_source|delete_source), target_type CHECK(document|knowledge_source|website_page), target_id uuid, status CHECK(pending|processing|completed|failed), external_job_id, attempts INT DEFAULT 0, error_message, started_at, finished_at, created_at, updated_at`. Filtered index `(status) WHERE status IN ('pending','processing')`.
- `crawl_events` — port V0 0036: append-only diagnostics. **VERIFY the live 0036 `event_type` CHECK** (does it include `'ingest'`?) before writing the V1 CHECK so it matches the code union.
- `firecrawl_credit_log` — port V0 0040: `id, organization_id NULLABLE, operation CHECK(map|sitemap|scrape|screenshot), credits INT, created_at`. **No RLS** (account-broad internal tooling) — matches V0.
- `answer_cache` — port V0 0004 **+ chatbot_id**: `id, organization_id NOT NULL FK, chatbot_id NOT NULL FK chatbots, bot_version, question, question_embedding vector(1536), response_json jsonb, hit_count, created_at, last_hit_at`. HNSW idx on embedding; composite idx `(organization_id, chatbot_id, bot_version)`. RLS SELECT via org membership.
- `documents` ALTERs: `ADD COLUMN knowledge_source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE`, `ADD COLUMN included boolean NOT NULL DEFAULT true`, `ADD COLUMN content_hash text`; **widen** `source` CHECK to `('upload','v0_local','website')`. Index `documents (knowledge_source_id) WHERE knowledge_source_id IS NOT NULL`.
- **RPC drop+recreate** `match_chunks_with_parents` (see folded decision): + `source_url`, `source_title` from `d.metadata`, + `and d.included` filter. RETURNS shape change is the reason for drop+recreate.

**Cache code (lib/rag, injected-client):**
- `lookupCachedAnswer`/`writeCachedAnswer` (`lib/rag/run-rag-query.ts:434-494`) gain `chatbotId` param; thread into the RPC call + insert. Engine already passes an injected client + has `input.chatbotId`.
- `lookup_cached_answer` RPC gains `p_chatbot_id`.
- `app/v1/app/rag-config.ts`: at end of 3a flip `cacheEnabled:true`; `app/v1/app/actions.ts` `askV1` drop the hardcoded `disableCache:true`.

**DoD 3a:** migration applied to V1-prod via MCP + ledger row + `get_advisors` clean; document Q&A still works under RLS; cache lookup/write is chatbot-scoped — a test proves chatbot A never serves chatbot B's cached answer even on identical question+bot_version; isolation e2e still green; typecheck/test:unit/build green.

---

## Milestone 3b — Crawler backend  `[depends-on: 3a]`
Branch `feat/seb/v1-pr3b` (from main after 3a merges). No migration.

- **Copy near-verbatim** (provider/auth-neutral): `firecrawl.ts` (keep `maxAge=0`, autoPaginate-only-on-completed, dual-source map+sitemap, `MAX_CRAWL_PAGES=50`), `validateCrawlUrl.ts` (two-stage SSRF), `normalizeHost.ts`, `credit-log.ts`, `crawlEvents.ts` → into a V1 crawler module (`lib/v1/crawler/` or shared `lib/rag/crawler/` — decide; keep `lib/rag` free of `next/*`).
- **Orchestration** `processCrawlJobs` — port preserving the DB-native atomic claim (`UPDATE … WHERE … status IN ('pending','processing') … .select('id')`), `wonClaim` asymmetry, wall-clock timeout (`MAX_CRAWL_DURATION_MS`), finalize-retry. Inject `getV1ServiceRoleClient()`; add chatbot scoping.
- **Website ingest** — generalize `lib/rag/ingest.ts` `ingestDocument` to accept a website source: per crawled page create a `documents` row (`source='website'`, `knowledge_source_id`, `content_hash`, `metadata.source_url`/`source_title`) + parent/child chunks via `chunkParentsAndChildren` (reuse the shared chunker — has the break-guard). Per-page error isolation preserved. Re-crawl = claim-gated delete `documents WHERE knowledge_source_id` (CASCADE). `purgeAnswerCache(orgId, chatbotId)` (injected client) after ingest + on mutating actions.
- **Server actions** — port `discoverPagesAction`, `startSelectedCrawlAction`, `deleteWebsiteSourceAction`, `refreshWebsiteSources`, `tickCrawlIngestAction`, `setPageIncludedAction` (toggles `documents.included` + purge), `retryPageAction`, `scrapeSinglePageAction` into V1 actions: replace `getActiveOrgFromCookies()` with `requireOrgMember(orgId)`; add `chatbotId` (single active chatbot via the shared helper); mutations service-role after membership; reads via RLS session-client; keep `tickCrawlIngestAction` un-rate-limited; keep two-stage SSRF.
- **Cron route** `app/api/v1/cron/process-crawls/route.ts` — GET + Bearer `CRON_SECRET` → `getV1ServiceRoleClient()` → load open jobs → `processCrawlJobs`. (External pinger = manual ops step, like V0; document it.)
- **Flip** `sourceLinksEnabled:true` once website docs carry `source_url`.

**DoD 3b:** a seed-org crawl (small real site or fixture) ingests as pages-as-documents and is retrievable with a clickable `source_url`; SSRF tests green; atomic-claim behavior preserved (no double-ingest under concurrent ticks); isolation holds (org/chatbot); typecheck/test:unit/build green.

---

## Milestone 3c — Dashboard UI + wiring  `[depends-on: 3b]`
Branch `feat/seb/v1-pr3c` (from main after 3b merges). No migration.

- Re-home `app/klantendashboard/kennisbank/` server page + `website-tab.tsx`, `page-selection.tsx`, `managed-pages.tsx`, `crawl-diagnostics.tsx` to `app/v1/app/kennisbank/`. Components copy-paste with the V1 action imports swapped.
- `getWebsiteSources` → reads via RLS session-client, filtered org **and** chatbot.
- 4s client-tick poll loop preserved (calls V1 `tickCrawlIngestAction`).
- Member-scoped page (requireOrgMember); UI cap stays `MAX_CRAWL_PAGES`.

**DoD 3c:** discover → select → crawl → manage (include toggle, retry, content modal) round-trips in `app/v1/app/kennisbank`; light+dark+mobile verified; typecheck/test:unit/build green.

---

## Out of scope (explicit NOT-doing)
- FAQ pre-cache port (separate feature; V1 cache stays engine-only).
- `match_chunks_hybrid` / `hybridSearch` (stays false).
- V1 admin/cross-org dashboard tier; per-user multi-org `[org]` routing.
- Document upload UI in V1 (3c is crawler-only).
- Per-org Firecrawl keys (account-broad key, as V0).

## Risks / verify-no-assume
- First real third-party content structures in V1-prod → RLS exact; per-PR review (chatmanta-reviewer + /code-review).
- MCP migration on the real V1 DB → heads-up to Seb before `apply_migration`; advisors clean after.
- `crawl_events` CHECK `'ingest'` mismatch — verify live 0036.
- `CRON_SECRET` + `FIRECRAWL_API_KEY` present in worktree `.env.local` and on Vercel V1 — verify (Firecrawl is billable; no live crawl without Seb's OK).
- Keep `lib/rag` free of `next/*` / `server-only` chains (grep-gate); run `audit:retrieval` + build at extraction.
- Generalizing `ingestDocument` must not regress V0/V1 document ingest (PR-2) — keep document path behavior identical.

---

## Plan-review adjudication (round 1, 3 lenses) — FOLDED FIXES

**Must-fix (accepted, correctness/hard-rules):**
1. **Cache writes need service-role, not the session-client.** `askV1` injects the RLS session-client; `answer_cache` is SELECT-only RLS → `writeCachedAnswer` + `last_hit_at` UPDATE are silently RLS-denied (fire-and-forget) → cache never populates, `cacheEnabled:true` becomes a failing-insert no-op, and the isolation DoD passes *vacuously*. Fix: engine input gains `serviceClient?: SupabaseClient`; cache INSERT + `last_hit_at` UPDATE use it (V1 = `getV1ServiceRoleClient()`, V0 = its existing service-role client); the lookup RPC stays on the session-client (security-invoker SELECT is RLS-allowed). Keeps `answer_cache` mutations service-role (matches the stated RLS). **DoD add: prove a cache row is actually written (count>0) before asserting chatbot-scoping.** (query_log logging, when ported later, will reuse the same `serviceClient`.)
2. **`lookup_cached_answer` RPC** recreate with `where organization_id=p_organization_id and chatbot_id=p_chatbot_id and bot_version=...`, `security invoker`, `set search_path = public, extensions, pg_temp` (V0's `public, pg_temp` breaks: `vector` lives in `extensions` in V1).
3. **RPC drop must target the V1 4-arg signature:** `drop function if exists public.match_chunks_with_parents(uuid, uuid, vector(1536), int);` (V0 was 3-arg; copying V0's drop is a no-op → CREATE fails on return-type change or leaves a stale overload).
4. **Failed/excluded pages need a home (else managed-pages + retry regress).** `ingestDocument` throws on empty children, so excluded/failed pages get no row. Fix: widen `documents.status` CHECK to add `'excluded'`; crawler creates a `documents` row for EVERY page outcome — crawled → `ingestDocument`; failed/excluded → direct insert (status `failed`/`excluded`, `included=false`, no chunks, error text in `metadata.error`, `metadata.source_url`). No new `error_message` column (reuse metadata).
5. **Dashboard data-layer is a rewrite, not an import-swap.** Under pages-as-documents page identity = a `documents` row. `getWebsiteSources` reads `documents WHERE source='website'` (+org+chatbot, not `website_pages`); `setPageIncludedAction` toggles `documents.included` by doc id; retry/re-ingest deletes `documents WHERE knowledge_source_id=X AND metadata->>'source_url'=url`. Call out as real 3b/3c work.
6. **Cron must read + stamp `chatbot_id`.** `processing_jobs.chatbot_id NOT NULL`; cron `OpenJob` select includes `chatbot_id`; thread through `processCrawlJobs` → ingest; stamp every `documents`/`parent_chunks`/`document_chunks` row; assert non-null, never default. Cron isolation rests on per-job stamping, not endpoint auth.
7. **SA-1 object-level scoping on every client-ID mutation.** `requireOrgMember(orgId)` proves membership, not row ownership. On the service-role path each `setPageIncludedAction`/`retryPageAction`/`deleteWebsiteSourceAction` keeps `.eq('organization_id', orgId).eq('chatbot_id', chatbotId)` (mirrors V0's `.eq('organization_id')`). Add a DoD line proving a cross-org ID attempt is rejected.
8. **`crawl_events` gets `chatbot_id NOT NULL`** (customer data referencing chatbot-scoped entities; only `firecrawl_credit_log` is RLS/scope-exempt).

**Scope trims (accepted):**
9. **Drop `content_hash`** — write-only in V0, never read; fresh V1 ingest simply omits it. Re-add when an incremental-diff re-crawl is actually built.
10. **Narrow `processing_jobs` CHECKs** — `job_type CHECK(crawl_website)`, `target_type CHECK(knowledge_source)`; drop `'website_page'` (names a table that doesn't exist under pages-as-documents). Widen when async doc-processing ships.
11. **Drop `source_title` from the RPC RETURNS** — engine reads only `source_url`. Add `source_url` only.
12. **Drop `scrapeSinglePageAction` + `single-page-import.tsx`** from PR-3 (no UI consumer; secondary one-off import). Keep `retryPageAction` (core to managed-pages).
13. **Cron is not a 3b DoD gate** — 3b DoD (ingest + atomic-claim + retrievable) is met by the client-tick path; build the cron route but don't hinge done-ness on it.

**Rebuttals (kept despite scope flags, with reason):**
- **Keep `firecrawl_credit_log`** — captures billable Firecrawl cost telemetry that can't be backfilled; verbatim port; cheap append-only. (op CHECK is an addition vs V0's no-CHECK 0040, but matches the code union — keep.)
- **Keep `knowledge_sources.disabled_at` + `type`** — port-compatibility (ported queries reference them); zero-cost columns; removing them means editing ported code.
- **Keep `chatbot_id` in the `normalized_host` unique index** — correct for the multi-chatbot future, harmless now (one active chatbot per org).

**Resolved verifies:** live 0036 `crawl_events.event_type` CHECK = `(start|poll|ingest|complete|fail)` — keep that union (superset harmless). Provenance: `disabled_at`=0039, `included`/`error_message`=0035 (doc said 0032/0037).

**Confirmed correct (verified against code):** re-crawl `DELETE documents WHERE knowledge_source_id` CASCADEs to BOTH parent_chunks + document_chunks; uploaded docs (knowledge_source_id NULL) untouched; atomic-claim is on the `processing_jobs` row (independent of pages-as-documents); `security invoker` + extensions search_path + defense-in-depth org/chatbot JOIN re-assert; `min_similarity:0`-then-TS-filter @ 0.93; FAQ-not-ported is safe (only `faq-snapshot.ts` writes answer_cache, V0-only); `ingestDocument` generalization is low-risk + additive provided new fields are optional with defaults (`included NOT NULL DEFAULT true` keeps PR-2 uploads retrievable under the new `and d.included` filter).

**Plan-review scaled to 1 round** (design converged + fixes are clear, verified corrections) — the Phase-5a code-review loop is the implementation-level net.
