# M-C — Cost guardrails + rate-limit (V1)

**Branch:** `feat/seb/v1-guardrails` · **Worktree:** `../chatmanta-v1-guardrails` · **Migratie:** `0009` (schrijven, NIET toepassen).

## Doel
Bescherm de V1-chat-paden tegen kosten-explosie + abuse, en hang de per-org dag-budget-cap op M-A's `query_log.cost_eur`. Drie gates op de chat-paden + een rate-limit op de crawler-actie.

## Scope (Seb's Start-vragen)
- **Per-org dag-budget-cap** op `cost_eur`, default **€1/dag**, **admin-instelbaar** (kolom op `organizations`, editor komt in M-D). Pre-call check → blokkeer.
- **300 gesprekken/maand** hard-block (code-constant). ⚑ V1 heeft géén conversatie/thread-entiteit → tel `query_log`-rijen (= turns) per org per kalendermaand. Dit is dus effectief een **maandelijkse turn/message-cap**, niet distinct-conversations. Flag in de Eindlijst; constant makkelijk te verhogen.
- **Per-org rate-limit** op `askV1` + widget-`/api/v1/chat` (M-B heeft al per-IP) + de crawler-start-actie. Hergebruik V0's Upstash-limiter.

## Hard rules
- V0 ongemoeid (`lib/v0/**` niet editen — wel *importeren* mag in V1-glue, zoals M-B deed). 
- Budget/limits lezen `query_log.cost_eur`/rijen via de **V1-service-role-client** (betrouwbaar, org-expliciet gefilterd) — geen client-input.
- **Fail-open** op budget/monthly DB-fouten (een DB-hapering mag de bot niet platleggen — V0-precedent). Rate-limit heeft z'n eigen in-memory fail-safe (#174).
- `organization_id` overal; geen secrets in `NEXT_PUBLIC_*`.

## Build — file voor file

### A. Migratie `supabase/migrations-v1/0009_v1_org_daily_budget.sql` (schrijven, niet toepassen)
```sql
-- Per-org dag-budget-cap (EUR). Default €1/dag (Seb). Jorion/admin-instelbaar (editor = M-D).
-- De cap sommeert query_log.cost_eur sinds UTC-middernacht (M-A). Backstop tegen
-- kosten-explosie, geen factuur. Kolom op bestaande RLS-tabel → geen nieuwe policy
-- (organizations-writes zijn service-role/owner-gated).
alter table public.organizations
  add column if not exists daily_budget_eur numeric(10,2) not null default 1.0;
comment on column public.organizations.daily_budget_eur is
  'Per-org dag-budget in EUR (cap op query_log.cost_eur sinds UTC-middernacht). Default 1.0. Admin-instelbaar (M-D).';
```

### B. `lib/v1/limits/usage-limits.ts` (nieuw; port van `lib/v0/server/budget.ts`)
Lees `lib/v0/server/budget.ts` voor het bewezen patroon (gepagineerde som, `startOfUtcDayIso`, `isOverBudget`, fail-open→0). V1-versie, client-geïnjecteerd (neem `serviceClient: SupabaseClient` + `orgId`):
- `startOfUtcDayIso(now: Date): string` en `startOfUtcMonthIso(now: Date): string` (UTC-middernacht / 1e vd maand 00:00 UTC). *(Pure — testbaar.)*
- `getOrgDailyBudgetEur(serviceClient, orgId): Promise<number>` — lees `organizations.daily_budget_eur` (fallback 1.0 bij null/fout).
- `getOrgSpendTodayEur(serviceClient, orgId): Promise<number>` — **gepagineerde** som van `query_log.cost_eur` waar `organization_id=orgId and created_at >= startOfUtcDayIso(now)` (PAGE_SIZE 1000, MAX_PAGES 100, order created_at asc — zoals V0, vermijdt de PostgREST 1000-cap). **Fail-open → 0** bij fout.
- `checkOrgDailyBudget(serviceClient, orgId): Promise<{ over: boolean; spentEur: number; capEur: number }>` — `over = spentEur >= capEur` (exact-cap sluit).
- `getOrgConversationsThisMonth(serviceClient, orgId): Promise<number>` — `query_log` head-count (`select('id',{count:'exact',head:true})`) waar `organization_id=orgId and created_at >= startOfUtcMonthIso(now)`. **Fail-open → 0**.
- `MONTHLY_CONVERSATION_LIMIT = 300` (const). `checkOrgMonthlyLimit(serviceClient, orgId): Promise<{ over: boolean; count: number; limit: number }>`.
- Self-check `lib/v1/limits/__tests__/usage-limits.test.ts` (pure helpers): `startOfUtcDayIso`/`startOfUtcMonthIso` correctheid + `isOverBudget`-grens (geef de tijd als arg → deterministisch; geen `Date.now()` in de test-asserts). Voeg toe aan `test:unit`.
> **NB Date:** in productie-code mag `new Date()`; alleen de TEST geeft een vaste datum mee. Maak de helpers daarom `(now: Date)`-parametrisch.

### C. `lib/v1/limits/chat-gates.ts` (nieuw; de gecombineerde pre-pipeline gate)
Eén helper die beide chat-callers delen (DRY):
```ts
export type ChatGateResult =
  | { ok: true }
  | { ok: false; code: 'RATE_LIMITED' | 'BUDGET_EXHAUSTED' | 'MONTHLY_LIMIT'; retryAfterSec?: number; message: string };

export async function checkOrgChatGates(serviceClient, orgId): Promise<ChatGateResult>
```
Volgorde (eerste failure wint):
1. **Per-org rate-limit:** `getOrgRateLimiter().check(\`org:${orgId}\`)` (import uit `@/lib/v0/server/rate-limit` — glue, gate-toegestaan; Upstash + in-memory fail-safe). `!allowed` → `RATE_LIMITED` + `retryAfterSec`.
2. **Maand-cap:** `checkOrgMonthlyLimit` → `over` → `MONTHLY_LIMIT` (message: vriendelijk NL, "maandelijkse limiet bereikt").
3. **Dag-budget:** `checkOrgDailyBudget` → `over` → `BUDGET_EXHAUSTED` (message NL).
`message` = klant-vriendelijke NL-tekst (de widget toont 'm; askV1 mapt naar de UI). 

### D. Wire in `app/v1/app/actions.ts` (`askV1`)
Vóór de `runRagQuery`-loop (na org+chatbot-resolutie): `const gate = await checkOrgChatGates(getV1ServiceRoleClient(), orgId); if (!gate.ok) return { ok:false, error: gate.code };`
- Breid `AskV1Result` uit met `error: ... | 'RATE_LIMITED' | 'BUDGET_EXHAUSTED' | 'MONTHLY_LIMIT'`.
- `app/v1/app/v1-chat.tsx`: map de nieuwe codes naar nette NL-meldingen in de UI.

### E. Wire in `app/api/v1/chat/route.ts` (widget)
Na de bestaande M-B-gates (per-IP rate-limit, embed-token, origin-lock, injection) en ná org+chatbot-resolutie, vóór `runRagQuery`: `const gate = await checkOrgChatGates(serviceClient, organizationId); if (!gate.ok) { emit een NDJSON fallback-event met gate.message (zoals de injection-block via ndjsonOnce); return; }`. (Geen pipeline → niet billable.)
- De per-IP rate-limit van M-B blijft als gate #0; deze gate voegt per-ORG + maand + budget toe.

### F. Crawler-actie rate-limit
Vind de V1 crawl-start-actie (`app/v1/app/kennisbank/actions.ts` — de actie die een crawl/`processing_jobs` start + Firecrawl raakt). Voeg aan het begin (na de membership-check) een **per-org rate-limit** toe: `getOrgRateLimiter().check(\`crawl:${orgId}\`)` (eigen key-prefix zodat chat- en crawl-buckets niet delen) → bij block een nette `ActionResult`-fout (acties sturen geen 429; geef een `{ok:false, error:'RATE_LIMITED', message}`-shape conform de bestaande actie-conventie). *(Firecrawl-credit-budget zelf = buiten scope; dit is puur abuse-rate-limiting van de start-actie.)*

## Verificatie (alles groen; GEEN billable LLM/embedding-calls)
1. `npx tsc --noEmit`
2. `Remove-Item -Recurse -Force .next; npm run build`
3. `npm run test:unit` (incl. de nieuwe usage-limits-test + grep-gate groen).
4. **Non-billable smoke-plan** (de orchestrator draait 'm ná migratie 0009): een service-role-script dat (a) `daily_budget_eur` van de seed-org tijdelijk op 0 zet → `checkOrgDailyBudget` → `over:true`; (b) `checkOrgMonthlyLimit` met de huidige rij-count; (c) reset budget terug. **Geen LLM-call.** *(Implementer: schrijf het script `scripts/v1-test-limits.ts` + `v1:test-limits`; NIET draaien.)*

## ponytail / scope
- Rate-limit: **hergebruik** V0's `getOrgRateLimiter` (geen nieuwe limiter-infra). Budget/monthly: port V0's budget-logica naar EUR + per-org-kolom + maand-count. Geen 80%-warning (V0 heeft 'm ook niet op de enforce-laag; M-D-admin kan spend tonen).
- Geen nieuwe abstracties; de gecombineerde gate is de enige nieuwe helper.

## Commit & PR
Commit per chunk (migratie+limits-module eerst + `tsc`, dan de wiring). Niet pushen, geen PR, migratie 0009 niet toepassen. Rapporteer files, tsc/build/test, de smoke-script-waarden voor de seed-org, en V0-aannames die niet klopten.
