# M-A — Telemetrie-fundament (logQuery-port + IP-hashing + cost_eur)

**Branch:** `feat/seb/v1-telemetry` · **Worktree:** `../chatmanta-v1-telemetry` · **Migratie:** `0007` (schrijven, NIET toepassen — de orchestrator past toe via MCP).

## Doel
De V1 RAG-pad schrijft nu **0 rijen** naar `query_log`. Port `logQuery` als een **neutrale, client-geïnjecteerde** module zodat `askV1` elke afgeronde query logt — fundament voor de budget-cap (M-C) en admin-telemetrie (M-D). Voeg `cost_eur` (EUR-billing-keuze van Seb) + `ip_hash` (AVG, §1.5 #14) toe.

## Hard rules (niet schenden)
- `lib/rag/**` mag **NIETS** uit `lib/v0/**` importeren en **geen service-role-factory** (`getV1ServiceRoleClient`/`getServiceRoleClient`). De client wordt geïnjecteerd. De grep-gate (`lib/supabase/__tests__/no-adhoc-service-client.test.ts`, draait in `test:unit`) dwingt dit af.
- `query_log` is service-role-write (SELECT-only RLS). De caller injecteert de V1-service-role-client.
- logQuery is **best-effort: NOOIT throwen** (telemetrie mag het antwoord niet breken).
- Append-only; raak `lib/v0/**` / `app/api/v0/**` / `/v0` niet aan (V0's eigen `logQuery` in `lib/v0/server/log.ts` blijft ongewijzigd).

## Build — file voor file

### 1. Migratie `supabase/migrations-v1/0007_v1_query_log_eur_iphash.sql` (schrijven, niet toepassen)
```sql
-- M-A telemetrie: cost_eur (EUR-billing-cap M-C) + ip_hash (AVG, gepseudonimiseerd).
-- query_log heeft al RLS (SELECT org-members) + service-role-only writes; kolommen
-- toevoegen vereist geen nieuwe policy.
alter table public.query_log
  add column if not exists cost_eur numeric(10,6) not null default 0;
alter table public.query_log
  add column if not exists ip_hash text;
comment on column public.query_log.cost_eur is
  'EUR-kosten = cost_usd * vaste FX (USD_EUR_RATE). Backstop voor de per-org dag-budget-cap (M-C), geen factuur. Echte EUR-rates/live-FX = V2.';
comment on column public.query_log.ip_hash is
  'Gepseudonimiseerde bezoeker-IP (sha256+salt, getrunceerd). NULL voor authed dashboard-chat. AVG: nooit plain IP.';
```
> `numeric(10,6)` matcht `cost_usd`. Geen index nodig (budget-cap filtert op `organization_id, created_at` — bestaande `query_log_org_created_idx`).

### 2. `lib/ai/llm.ts` — voeg `costUsdToEur` toe (onderaan, naast de cost-helpers)
```ts
/**
 * USD→EUR conversie voor query_log.cost_eur. De engine sommeert kosten in USD
 * (costForModelUsd); de EUR-cap (M-C) en EUR-billing willen EUR.
 * ponytail: vaste FX-constante (env-override USD_EUR_RATE). Dit is een
 * budget-backstop, geen factuur. Upgrade-pad (V2): live FX of per-call EUR via
 * MODEL_COSTS — let op: MODEL_COSTS (EUR) spiegelt nu nog de USD-tabel, dus
 * her-summeren geeft GEEN echte EUR tot die tabel echte EUR-rates krijgt.
 */
const USD_EUR_RATE = Number(process.env.USD_EUR_RATE) || 0.92;
export function costUsdToEur(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * USD_EUR_RATE * 1e6) / 1e6; // 6 decimalen, matcht kolom
}
```

### 3. `lib/observability/hash-ip.ts` (nieuw, neutraal)
```ts
import { createHash } from 'node:crypto';
/**
 * Pseudonimiseer een bezoeker-IP voor query_log.ip_hash (AVG: nooit plain IP).
 * sha256(salt + ip), getrunceerd tot 16 hex-chars (genoeg om te dedupliceren,
 * niet omkeerbaar). Salt uit IP_HASH_SALT (ops-env); zonder salt nog steeds
 * gehasht (zwakker tegen rainbow-tables) → flag voor de Eindlijst.
 * Authed paden (askV1) hebben geen onvertrouwd IP → geven null door.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== 'string' || ip.trim().length === 0) return null;
  const salt = process.env.IP_HASH_SALT ?? '';
  return createHash('sha256').update(salt + ip.trim()).digest('hex').slice(0, 16);
}
```
Self-check (ponytail): `lib/observability/__tests__/hash-ip.test.ts` — `assert(hashIp(null) === null)`, `assert(hashIp('1.2.3.4')!.length === 16)`, `assert(hashIp('1.2.3.4') === hashIp('1.2.3.4'))` (deterministisch), `assert(hashIp('1.2.3.4') !== hashIp('1.2.3.5'))`. Voeg toe aan de `test:unit`-lijst in `package.json`.

### 4. `lib/rag/log-query.ts` (nieuw, neutraal, client-geïnjecteerd)
Port van `lib/v0/server/log.ts` `logQuery`, met deze verschillen:
- **Eerste param = geïnjecteerde client** (`serviceClient: SupabaseClient`), GEEN factory-import.
- **`chatbotId` verplicht** (V1 `query_log.chatbot_id` is NOT NULL).
- **`ipHash?: string | null`** → schrijft `ip_hash`.
- **`cost_eur`** = `costUsdToEur(response.totalCostUsd)` (import uit `@/lib/ai/llm`).
- **GEEN `claim_verifications`-insert** — die tabel bestaat NIET in V1 (migr 0002 maakte alleen chatbots/documents/parent_chunks/document_chunks/query_log). `claim_confidence` (aggregate-kolom) blijft wél geschreven. Laat de hele `claims`/`cvRows`-blok weg.
- **GEEN `DEV_ORG_ID`-fallback** (bestaat niet in lib/rag); `organizationId` verplicht.
- Imports: `redactPii` uit `@/lib/observability/redact`, `costUsdToEur` uit `@/lib/ai/llm`, types `ChatResponse`/`HydeModeRequest`/`HydeModeResolved` uit `@/lib/rag/run-rag-query` (verifieer het export-pad; `ChatResponse` staat op regel ~1038). `import 'server-only'` mag (caller is server). **Let op:** `server-only` maakt 'm niet importeerbaar in `node --test` — dat is OK, deze module wordt niet los unit-getest (de helpers in #2/#3 wél).

**Signatuur:**
```ts
export type HydeMeta = { requested: HydeModeRequest; actual: HydeModeResolved | null };
export async function logRagQuery(
  client: SupabaseClient,
  args: {
    question: string;
    response: ChatResponse;
    organizationId: string;
    chatbotId: string;
    injection?: { detected: boolean; pattern: string | null };
    hydeMeta?: HydeMeta;
    requestId?: string;
    ipHash?: string | null;
    overrideId?: string;
  },
): Promise<void>
```
Hergebruik de hele veld-afleiding (extras, category, top1Sim, hyde, latency-buckets, hard-fact, gap_kind, adaptive_decision, PII-redactie van question+answer) **1:1 uit V0 `logQuery`** — de `QueryLogRow`-shape is identiek behalve de twee nieuwe kolommen (`cost_eur`, `ip_hash`) en de toegevoegde `chatbot_id`. Voeg `chatbot_id: args.chatbotId`, `cost_eur: costUsdToEur(response.totalCostUsd)`, `ip_hash: args.ipHash ?? null` toe aan BEIDE branches (smalltalk + answer/fallback). Insert via `client.from('query_log').insert(row)` (geen `.select().single()` nodig zonder claim_verifications — maar mag). Try/catch → `console.error`, return.

> **Tip:** kopieer `lib/v0/server/log.ts` regels 189–376 (de body tot net vóór de insert) letterlijk, vervang `getServiceRoleClient()` door `client`, voeg de 3 velden toe, schrap de claim_verifications-staart (regels ~392–407). Kopieer de helper **volledig** incl. alle `?? null`-defaults (les uit PR-2: kopieer helemaal, niet alleen wat je leest).

### 5. `app/v1/app/actions.ts` — `askV1` logt na de loop
Zie het V0-precedent voor de **event-merge**: `app/api/v0/chat/route.ts` (de loop die `finalResponse` opbouwt + `followups-done`/`metrics-done` merget, ±regel 421–456; en de `after()`→`logQuery`-call ±531–567). Repliceer in `askV1`:

1. Vang naast `final` (de gemapte `{answer,sources,kind}`) ook **`finalResponse: ChatResponse | null`** uit dezelfde terminal events (`answer-done|fallback|smalltalk|replacement` → `finalResponse = ev.response`).
2. **Merge de na-events** in `finalResponse` (anders ondertelt de cost de follow-up-tokens → de M-C budget-cap leest te laag):
   - `followups-done`: als `finalResponse?.kind === 'answer'`: `chatInputTokens += ev.inputTokens`, `chatOutputTokens += ev.outputTokens`, `totalCostUsd += ev.costUsd`. (Repliceer exact wat route.ts doet.)
   - `metrics-done`: als `finalResponse` `extras` heeft: `finalResponse.extras.phaseTimingsMs = ev.phaseTimingsMs`.
3. Na de loop, als `finalResponse` bestaat, **log best-effort** zonder de response te vertragen:
   ```ts
   import { after } from 'next/server';
   import { logRagQuery } from '@/lib/rag/log-query';
   // ...
   after(() => logRagQuery(getV1ServiceRoleClient(), {
     question: question.trim(),
     response: finalResponse!,
     organizationId: orgId,
     chatbotId: chatbot.id,
     ipHash: null, // authed dashboard-chat: geen onvertrouwd bezoeker-IP
   }));
   ```
   `getV1ServiceRoleClient()` is al geïmporteerd. Geen `injection`/`requestId`/`overrideId` (dashboard is authed/getrouwd; M-B's publieke widget-route levert die wél). Als `after()` in deze server-action-context niet ergonomisch blijkt: `await logRagQuery(...)` in een eigen try (never-throws) vlak vóór `return { ok: true, ...final }` — de generator is dan toch al gedraind.

> **Geen gedragswijziging aan het antwoord** — alleen een extra insert. `final`/de return-shape blijft identiek.

## Verificatie (alles moet groen; GEEN billable calls)
1. `npx tsc --noEmit` (in de worktree).
2. `Remove-Item -Recurse -Force .next` dan `npm run build` (Windows native-worker-crash op vervuilde `.next`).
3. `npm run test:unit` — incl. de nieuwe `hash-ip.test.ts` + de grep-gate (`no-adhoc-service-client`) MOET groen blijven (bewijst dat `lib/rag/log-query.ts` geen factory importeert).
4. **Non-billable smoke-script** `scripts/v1-test-log.ts` + npm-script `v1:test-log`: bouwt een **gecanned `ChatResponse`** (kind `'answer'`, vaste tokens/cost, een answer mét een fake e-mail erin om PII-redactie te bewijzen), roept `logRagQuery(getV1ServiceRoleClient(), {question:'test '+<uniek-token>, response, organizationId:<V1_SEED_ORG_ID>, chatbotId:<seed-org chatbot>, ipHash: hashIp('203.0.113.7')})` aan, leest de rij terug en assert: `cost_eur > 0` (≈ cost_usd*0.92), `ip_hash` lengte 16, `question`/`answer` bevatten `[email]` niet de echte mail. **Ruim de testrij daarna op** (`delete ... where question like 'test <token>%'`). **Geen LLM/embedding-call** → niet billable. *(De orchestrator draait dit ná het toepassen van migratie 0007 via MCP — de implementer levert het script + bewijst tsc/build/test:unit.)*

## Commit & PR
Klein committen. **Niet pushen, geen PR** — de orchestrator doet review → migratie-apply → smoke → merge.
