# Plan 006: Dicht de answer-cache stale-write-race met een cache-epoch-guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> ⚠️ **Step 0 is een harde gate**: dit plan voegt een tabel toe aan beide
> databases (datamodel-wijziging). Volgens AGENTS.md moet Sebastiaan zo'n
> wijziging vooraf goedkeuren. Zonder expliciet akkoord: STOP.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- lib/rag/run-rag-query.ts lib/rag/ingest.ts lib/v0/server/rag.ts supabase/migrations supabase/migrations-v1`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.
> **Verwachte drift** (géén STOP): plan 003 wijzigt in ditzelfde bestand regel ~2883
> (`generateFollowUps(original, activeAnswerText, bot)`) — dat ligt buiten de
> excerpt-regio's van dit plan (486-513, 1468-1469, 2921-2943) en is bedoeld.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (goedkeuring Sebastiaan vereist — Step 0)
- **Category**: bug
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

De answer-cache wordt org-breed gepurged bij élke kennisbank-/instellingen-/Q&A-wijziging, omdat de cache-key geen KB-revisie bevat. Maar de cache-**write** aan het einde van een chat-pipeline is fire-and-forget (geen await) en gebruikt retrieval-data van het bégin van de pipeline. Volgorde: retrieval@t0 → klant wijzigt KB + purge@t1 → insert@t2. De insert zet dan een antwoord op basis van de oude KB terug in de zojuist geleegde cache, en dat verouderde antwoord (oude prijs, oude openingstijd) wordt als cache-hit geserveerd tot de vólgende KB-wijziging. Venster: de volledige pipeline-duur (~2-13s) bij elke KB-mutatie, op V0 én V1. De fix: een per-org "epoch" die elke purge ophoogt; de write gaat alleen door als de epoch sinds pipeline-start niet veranderd is. NB (panel-review): dit VERSMALT het race-venster van de volledige pipeline-duur naar één DB-round-trip (re-read → insert); dat restvenster is bewust geaccepteerd — echt sluiten zou de epoch in het insert-predicaat moeten vouwen (zie maintenance-notes).

## Current state

- `lib/rag/run-rag-query.ts:2933-2942` — de fire-and-forget write:

```ts
    writeCachedAnswer(
      cacheWriteClient,
      original,
      cacheEmbedVector,
      chatbotId,
      chatbotScoped,
      bot.version,
      cachedResponse,
      orgId,
    ).catch((err) => console.warn('[cache write] failed:', err instanceof Error ? err.message : err));
```

- `lib/rag/run-rag-query.ts:486-513` — `writeCachedAnswer` insert `organization_id`, optioneel `chatbot_id` (alleen `chatbotScoped`/V1), `bot_version`, `question`, `question_embedding`, `response_json`. Geen revisie/epoch.
- `lib/rag/run-rag-query.ts:1468-1469` — start van het cache-pad: `const cacheActive = bot.cacheEnabled && input.disableCache !== true;` en `const cacheEmbedPromise = cacheActive ? embedTexts([original]) : null;` — hier hoort de parallelle epoch-read bij.
- V0-purge: `lib/v0/server/rag.ts:314-332` — `purgeAnswerCache(organizationId)`: org-brede delete op `answer_cache` via `getServiceRoleClient()`; niet-throwend. Callers: `lib/v0/server/rag.ts:274,296` (ingest/delete), `lib/v0/klantendashboard/server/settings.ts:219,280,301,330`, `lib/v0/crawler/processCrawl.ts:187,210`.
- V1-purge: `lib/rag/ingest.ts:143-156` — `purgeAnswerCache(client, organizationId, chatbotId)`: delete op org+chatbot; callers o.a. `app/v1/app/instellingen`-settings, qa-actions, kennisbank-actions, beide processCrawls.
- Migratiestand: V0 hoogste = `0053_v0_contact_requests.sql`; V1 hoogste = `0016_v1_feedback_tickets.sql`. ⚠️ Check vóór het kiezen van nummers óók open PRs: `ls supabase/migrations | sort | tail -3` én `gh pr list --state open --search "supabase/migrations" --limit 5` (AGENTS.md-afspraak).
- De V1-engine draait retrieval onder een RLS-session-client, maar `cacheWriteClient` is in beide werelden een service-role client (zie de comment in `writeCachedAnswer:487-488`) — de epoch-reads/writes hieronder gebruiken dus overal `cacheWriteClient`/service-role.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Migratie V0 | `npm run migrate`      | past de nieuwe migratie toe (⚠️ kan vanaf deze dev-machine op een pooler-timeout lopen — bekend netwerkprobleem; dan via Sebastiaan/MCP, zie STOP) |
| Migratie V1 | `npm run migrate:v1`   | idem |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit-tests| `npm run test:unit`      | groen               |

## Scope

**In scope**:
- Nieuwe migraties: `supabase/migrations/NNNN_v0_cache_epoch.sql` + `supabase/migrations-v1/NNNN_v1_cache_epoch.sql`
- `lib/rag/run-rag-query.ts` (epoch-read bij start cache-pad + guard in `writeCachedAnswer`)
- `lib/rag/ingest.ts` (V1 `purgeAnswerCache` bumpt epoch)
- `lib/v0/server/rag.ts` (V0 `purgeAnswerCache` bumpt epoch)

**Out of scope**:
- De cache-**lookup** (`lookupCachedAnswer`) — ongewijzigd; de guard zit aan de write-kant
- De `answer_cache`-tabel zelf (geen kolom erbij)
- FAQ-pre-cache (`lib/v0/server/faq-snapshot.ts`) — leest/schrijft via dezelfde primitieve; werkt ongewijzigd door
- Alle purge-callsites — die blijven `purgeAnswerCache` aanroepen; de bump zit ín de purge-functies

## Git workflow

- Branch: `git checkout -b feat/seb/cache-epoch-guard`
- Commits per stap: `feat(cache): epoch-tabel + bump-in-purge (migr NNNN)`, `fix(cache): stale-write-guard via epoch-vergelijking`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 0: Akkoord Sebastiaan (HARDE GATE)

Leg dit ontwerp voor: nieuwe tabel `answer_cache_epoch(organization_id uuid pk, epoch bigint, updated_at)` in beide DB's + SQL-functie `bump_cache_epoch(org)`; purge bumpt de epoch; de engine leest de epoch parallel bij pipeline-start en de write wordt overgeslagen als de epoch intussen veranderd is (fail-closed: bij lees-fout géén write — de cache is volledig regenereerbaar). Alternatief dat is afgewogen en afgevallen: epoch in settings-JSONB (twee verschillende stores voor V0/V1, read-modify-write-race in de bump zelf).

**Verify**: expliciet "akkoord" van Sebastiaan. Zonder akkoord: STOP.

### Step 1: Migraties (identieke inhoud voor V0 en V1)

Kies de nummers volgens de check hierboven. Inhoud (per project):

```sql
-- Cache-epoch: purge bumpt de epoch; de RAG-engine weigert een cache-write
-- waarvan de pipeline vóór de laatste purge begon (stale-write-race, plan 006).
create table if not exists public.answer_cache_epoch (
  organization_id uuid primary key,
  epoch           bigint      not null default 1,
  updated_at      timestamptz not null default now()
);
alter table public.answer_cache_epoch enable row level security;
-- Geen policies: alleen service-role leest/schrijft (RLS-bypass), zelfde
-- houding als public._migrations. Geen org-FK-cascade nodig: rij is puur afgeleide staat.

create or replace function public.bump_cache_epoch(p_organization_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.answer_cache_epoch (organization_id, epoch, updated_at)
  values (p_organization_id, 1, now())
  on conflict (organization_id)
  do update set epoch = public.answer_cache_epoch.epoch + 1, updated_at = now();
$$;
```

(V1-project: check of de RPC-conventie daar `search_path` incl. `extensions` vereist — voor deze functie is `public` genoeg omdat er geen pgvector in zit.)

**Verify**: `npm run migrate` en `npm run migrate:v1` passen toe zonder fout (of via Sebastiaan/MCP bij pooler-timeout); `npm run migrate:status` toont de nieuwe id als applied.

### Step 2: Epoch-helpers in de engine

In `lib/rag/run-rag-query.ts`, naast `writeCachedAnswer`, een read-helper:

```ts
async function readCacheEpoch(client: SupabaseClient, organizationId: string): Promise<number | null> {
  try {
    const { data, error } = await client
      .from('answer_cache_epoch')
      .select('epoch')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) return null;
    return data?.epoch ?? 0; // geen rij = nog nooit gepurged = epoch 0
  } catch {
    return null;
  }
}
```

**Verify**: `npm run typecheck` exit 0.

### Step 3: Parallelle epoch-read bij pipeline-start

Direct naast regel 1469 (`cacheEmbedPromise`):

```ts
  const cacheEpochPromise = cacheActive ? readCacheEpoch(cacheWriteClient, orgId) : null;
```

(Zelfde niet-blokkerende stijl; geen await hier. Denk aan het smalltalk-discard-patroon op regel 1478: voeg daar `if (cacheEpochPromise) void cacheEpochPromise.catch(() => undefined);` NIET toe — de helper kan niet rejecten (alles gevangen), dus discard is onnodig.)

**Verify**: `npm run typecheck` exit 0.

### Step 4: Guard in de write

Wijzig het write-blok (regel ~2921-2943): vóór de `writeCachedAnswer`-aanroep de guard, binnen de bestaande fire-and-forget-stijl:

```ts
  if (bot.cacheEnabled && cacheEmbedVector && input.disableCache !== true) {
    const cachedResponse: ChatResponse = { /* ongewijzigd */ };
    void (async () => {
      const epochAtStart = cacheEpochPromise ? await cacheEpochPromise : null;
      const epochNow = await readCacheEpoch(cacheWriteClient, orgId);
      // Fail-closed: onleesbare epoch of bump tijdens de pipeline → skip write.
      if (epochAtStart === null || epochNow === null || epochNow !== epochAtStart) {
        console.info(`[cache write] skipped: epoch ${epochAtStart} -> ${epochNow} (purge tijdens pipeline)`);
        return;
      }
      await writeCachedAnswer(/* ongewijzigde args */);
    })().catch((err) => console.warn('[cache write] failed:', err instanceof Error ? err.message : err));
  }
```

**Verify**: `npm run typecheck` exit 0; `npm run test:unit` groen.

### Step 5: Bump in beide purge-functies

- `lib/v0/server/rag.ts` `purgeAnswerCache` (regel ~314): ná de geslaagde delete: `await sb.rpc('bump_cache_epoch', { p_organization_id: organizationId });` — binnen de bestaande try/catch (purge blijft niet-throwend).
- `lib/rag/ingest.ts` `purgeAnswerCache` (regel ~143): idem met de meegegeven `client`. NB: de V1-purge is org+chatbot-gescoped maar de epoch is per org — dat over-invalideert hooguit een write van een andere chatbot in hetzelfde org-venster (skip-write, geen dataverlies); documenteer dat in een comment.

**Verify**: `grep -n "bump_cache_epoch" lib/` → 2 hits; typecheck exit 0.

### Step 6: Gedragsbewijs (deterministisch, zonder LLM)

Schrijf een wegwerp-verificatiescript of gebruik psql/MCP: (1) lees epoch van een test-org (0/afwezig), (2) roep `purgeAnswerCache` aan → epoch = 1, (3) nogmaals → 2. Daarna de guard: simuleer door `readCacheEpoch` direct aan te roepen vóór en na een purge en check dat de waarden verschillen. (Volledige pipeline-race deterministisch naspelen vergt een LLM-call — niet nodig; de guard-logica is hiermee bewezen.)

**Verify**: epoch-reeks 0→1→2 zichtbaar; script opgeruimd of onder `scripts/dev/` geparkeerd met duidelijke header.

## Test plan

- Unit: extraheer desgewenst de vergelijkingslogica (`epochAtStart`/`epochNow` → write/skip-besluit) als pure functie met 4 cases (gelijk → write; verschillend → skip; null aan een van beide kanten → skip). Model: `lib/v1/limits/__tests__/usage-limits.test.ts`.
- Integratie: Step 6.
- Regressie: `npm run test:unit` + bestaande e2e blijven groen; cache-hits blijven werken (lookup is onaangeraakt).

## Done criteria

- [ ] Beide migraties applied (ledger toont ze)
- [ ] Purge bumpt epoch (Step 6-bewijs)
- [ ] Write wordt geskipt bij epoch-verschil of onleesbare epoch (unit-test op de besluitfunctie)
- [ ] `npm run typecheck` + `npm run test:unit` groen
- [ ] Geen wijziging aan lookup-pad of `answer_cache`-schema
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- Geen expliciet akkoord van Sebastiaan op Step 0.
- `npm run migrate` haalt de pooler niet (bekende netwerk-block vanaf de dev-machine) — NIET out-of-band SQL draaien zonder de `_migrations`-ledger bij te werken; rapporteer en laat Sebastiaan de MCP-route doen (zie geheugen/AGENTS: ledger-drift is eerder misgegaan).
- Het migratienummer botst met een open PR (check uit Current state).
- `cacheWriteClient` blijkt op een van de paden géén service-role client — rapporteer (de epoch-tabel heeft geen RLS-policies en is dan onleesbaar).

## Maintenance notes

- De extra kosten zijn één lichte pk-select per cache-actieve chatbeurt (parallel met de embed — geen wall-clock-impact) en één select per cache-write. Als dat ooit knelt: epoch meecachen in dezelfde roundtrip als de lookup.
- Rest-race (purge tussen re-read en insert, ~1 round-trip): geaccepteerd. Volledig sluiten kan later door de epoch-vergelijking in het insert-statement zelf te vouwen (`insert ... select ... where (select epoch ...) = $expected`).
- Toekomstige purge-plekken MOETEN via de bestaande `purgeAnswerCache`-functies blijven lopen (daar zit de bump). Reviewer let op directe `answer_cache`-deletes.
- Dit lost de race op, niet de bredere wens van cache-TTL/embed-hergebruik uit de eerdere cache-analyse (zie memory/PR #205-traject) — die blijven aparte afwegingen.
