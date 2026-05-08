<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ChatManta — agent-context

ChatManta is een website-chatbot SaaS van Jorion Solutions. Knowledge-bot voor MKB op basis van RAG over websitecontent + documenten.

## Bron-van-waarheid documenten (autoritatief — raadplegen vóór architectuurkeuzes)

- **Concept Blueprint v4.0** — `c:\Users\solys\Documents\Claude\Projects\Jorion Solutions\Concept_Blueprint_ChatManta.md`
- **Bouwplan v2.0 (8 fases)** — `c:\Users\solys\Documents\Claude\Projects\Jorion Solutions\Bouwplan_Planning_ChatManta_v1.md`

Bij elke architectuurkeuze: lees de relevante sectie. Bij conflict: V1 Minimal Build Scope (blueprint sectie 1.5) heeft voorrang, daarna Security Addendum.

## V1 Minimal Build Scope — bindend

Bouw NOOIT een V2/V3-feature in deze buildronde, ook niet als het "snel" lijkt. Zie blueprint sectie 1.5 voor de volledige expliciet-niet-in-V1 lijst. Belangrijkste verboden in V1:

- Geen publieke `/signup` (invite-only via Jorion-admin)
- Geen Stripe/Mollie payments
- Geen lead capture in widget
- Geen klant-conversation-viewer
- Geen usage-grafieken (alleen tekstuele "X / 300 deze maand")
- Geen pay-as-you-go billing
- Geen klant kan eigen `allowed_domains`/`conversations_per_month_cap`/AI-provider kiezen
- Geen `/api/widget/history` endpoint
- Geen bronvermelding zichtbaar in widget (intern wel opslaan)
- Geen `manual_text` als kennisbron
- Geen multi-user teams binnen één klant-org
- Geen 2FA voor klantaccounts (Jorion-admin wel)

## Stack (bindend in V1)

- Next.js 14+ App Router + TypeScript + shadcn/ui + Tailwind
- Supabase (Postgres + Auth + Storage + pgvector), West Europe region
- Anthropic Claude Haiku 4.5 als enige actieve LLM (OpenAI als technische fallback in `callLLM()`-laag, niet klant-zichtbaar)
- OpenAI text-embedding-3-small (1536 dim)
- Firecrawl (max 50 pagina's per crawl)
- Vercel hosting
- Sentry + UptimeRobot + Upstash Ratelimit + Resend

## Niet-onderhandelbare regels (uit blueprint sectie 3 + Security Addendum)

1. **Multi-tenancy by design** — `organization_id NOT NULL` op élke klantdata-tabel; uitzonderingen alleen `users` en `audit_logs`.
2. **RLS overal** — bij elke `CREATE TABLE`: `ENABLE ROW LEVEL SECURITY` + policies voor SELECT/INSERT/UPDATE/DELETE in dezelfde migration. Niet later toevoegen.
3. **CHECK constraints verplicht** op alle enum/range/format-velden (status, role, type, provider, similarity, primary_color hex, etc.) — TypeScript-validatie alleen is onvoldoende.
4. **Cascade-regels expliciet** — bij elke FK een `ON DELETE` clause volgens blueprint sectie 10. Standaard Postgres `NO ACTION` is verboden.
5. **Service-role key alleen via wrapper** (`lib/supabase/admin.ts` exports `getJorionAdminClient`, `getSystemJobClient`, `getOrgScopedAdminClient`). Geen losse `supabaseAdmin` imports buiten goedgekeurde modules. Zie SA-5.
6. **Object-level access checks** voor alle server actions met client-input IDs — `requireXxxAccess(id)` helper-pattern in `lib/auth/objectAccess.ts`. Zie SA-1.
7. **Vector search filtering** — `vectorSearch(orgId, chatbotId, query, topK)` met `orgId` + `chatbotId` als VERPLICHT (geen optionals) + soft-delete-filter via JOIN op brontabel.
8. **Geen secrets in frontend code** — API-keys uitsluitend in env vars, niet in `NEXT_PUBLIC_*`.
9. **Provider-abstractie voor LLM** — alle aanroepen via `lib/ai/llm.ts` `callLLM`/`streamLLM`.
10. **Anti-hallucinatie boven volledigheid** — strikte system prompt + similarity threshold 0.7 + fallback bij geen relevante chunks. Zie blueprint sectie 16.
11. **Centrale RAG-config** in `lib/rag/config.ts` (`RAG_CONFIG.CHUNK_SIZE`, etc.) — geen hardcoded thresholds verspreid door codebase.
12. **AVG vanaf dag 1** — soft delete met `deleted_at`, retentie-velden, geen plain IPs in DB (alleen hashed in Upstash met TTL 7 dagen).

## Bouwfase-volgorde (Bouwplan)

0. Setup & Foundation (15-20u) — accounts/tools/hello-world Vercel deploy
1. Auth & Multi-tenancy fundament (20-25u)
2. Klanten & Chatbots beheer (20-25u)
3. Document Pipeline (20-25u)
4. RAG Kern (30-35u — zwaarste fase)
5. Website Crawler (15-20u)
6. Widget publieke laag (25-30u)
7. Hardening & Security V1 Core (15-20u)
8. Polish & Go-live (20-25u)

Bouw geen vooruit-werk uit een latere fase. Definition of Done van vorige fase moet afgevinkt zijn vóór volgende fase.

## Belangrijke V1-defaults

- Tier `standard`: 300 conversations/maand (hard-block, geen pay-as-you-go), 20 documenten, 1 chatbot, 50 website-pagina's
- Document upload: PDF/DOCX/TXT/MD max 10MB via signed Supabase Storage URLs (geen Vercel proxy)
- Widget: vanilla launcher + iframe + HMAC session-token (1u TTL) + token in URL-fragment (`#token=...`, niet querystring)
- RAG: chunking 500 tokens / 50 overlap, top-K=5, similarity threshold 0.7
- Background jobs: Vercel `waitUntil()` als trigger + `processing_jobs` tabel als status-laag (geen externe queue in V1)
