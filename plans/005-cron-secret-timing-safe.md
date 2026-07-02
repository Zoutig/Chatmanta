# Plan 005: Eén timing-safe CRON_SECRET-vergelijking voor alle vijf cron-routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- app/api/v0/cron app/api/v1/cron lib/`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (de nieuwe test wordt door de glob-runner opgepikt; zonder 001 moet je 'm handmatig aan de package.json-lijst toevoegen)
- **Category**: security
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

Vijf cron-routes vergelijken de `Authorization`-header met `CRON_SECRET` via een gewone `!==`-stringvergelijking, die stopt bij het eerste afwijkende teken (timing-side-channel). Het praktische risico is laag (netwerk-jitter, high-entropy secret), maar dezelfde codebase gebruikt voor het embed-token wél netjes `timingSafeEqual` — dit is een triviaal te dichten inconsistentie op vijf plekken, en een gedeelde helper voorkomt dat route zes 'm straks wéér fout doet.

## Current state

- Het patroon (geverifieerd in `app/api/v0/cron/retention/route.ts:20-24`):

```ts
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
```

- Alle vijf de plekken (het `auth !== \`Bearer ${secret}\``-patroon):
  - `app/api/v0/cron/retention/route.ts:22`
  - `app/api/v0/cron/process-crawls/route.ts:18`
  - `app/api/v0/cron/faq-snapshot/route.ts:45`
  - `app/api/v1/cron/process-crawls/route.ts:20`
  - `app/api/v1/cron/faq-snapshot/route.ts:42`
  (Sommige retourneren `NextResponse.json({error:'unauthorized'},{status:401})`, andere mogelijk een kale 401 — behoud per route de bestaande response-shape.)
- Het huis-patroon voor timing-safe vergelijking staat in `lib/v1/widget/embed-token.ts:35-40`:

```ts
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

- Er bestaat geen `lib/security/`-map; dit plan maakt hem aan (neutraal — bruikbaar door V0- én V1-routes; V1 mag niet uit `lib/v0/**` importeren).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Unit-tests| `npm run test:unit` | groen, incl. nieuwe cron-auth-test |

## Scope

**In scope**:
- Nieuw: `lib/security/cron-auth.ts` + `lib/security/__tests__/cron-auth.test.ts`
- De vijf cron-route-files (alléén het auth-blok)

**Out of scope**:
- De embed-token-modules (V0/V1) — die hebben hun eigen safeEqual, laten staan
- Elke andere logica in de cron-routes (dryRun, jobverwerking, responses)
- Vercel-config/vercel.json

## Git workflow

- Branch: `git checkout -b feat/seb/cron-timing-safe`
- Commit: `fix(security): timing-safe CRON_SECRET-vergelijking via gedeelde helper`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Helper

Nieuw `lib/security/cron-auth.ts`:

```ts
// Timing-safe Bearer-vergelijking voor cron-routes. Vervangt het per-route
// `auth !== \`Bearer ${secret}\``-patroon (short-circuit op het eerste teken).
// Zelfde aanpak als safeEqual in lib/v1/widget/embed-token.ts. Fail-closed:
// geen secret of geen header → false.
import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(
  authHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authHeader);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
```

(Geen `server-only`-import: de node:test-suite draait zonder react-server-conditie; de functie leest zelf geen env en is puur.)

**Verify**: `npm run typecheck` exit 0.

### Step 2: Test

Nieuw `lib/security/__tests__/cron-auth.test.ts` (node:test + assert/strict, model: `lib/v1/limits/__tests__/usage-limits.test.ts`). Cases:
1. correct: `isAuthorizedCron('Bearer s3cret', 's3cret')` → true
2. verkeerd secret → false
3. header zonder `Bearer `-prefix → false
4. lege/null header → false
5. `secret === undefined` of `''` → false (fail-closed)
6. header met correct secret maar extra suffix (`Bearer s3cret2`) → false

**Verify**: `npm run test:unit` → nieuwe test draait mee en is groen (vereist plan 001; anders file tijdelijk aan de package.json-lijst toevoegen).

### Step 3: Vijf routes omzetten

Per route: importeer `isAuthorizedCron` uit `@/lib/security/cron-auth` en vervang het auth-blok door:

```ts
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    // behoud de bestaande 401-response-shape van deze route
  }
```

Verwijder de nu-ongebruikte lokale `secret`/`auth`-variabelen. Verander NIETS aan de rest van de route.

**Verify**: `grep -rn 'Bearer \${secret}' app/api` → 0 hits; `npm run typecheck` exit 0; `npm run test:unit` groen.

## Test plan

De helper is puur en volledig unit-getest (Step 2). De routes zelf hoeven geen nieuwe test: hun auth-gedrag (401 zonder/met fout secret) is identiek aan vóór de wijziging; wie het end-to-end wil zien kan lokaal `curl -H "Authorization: Bearer fout" localhost:3000/api/v0/cron/retention?dryRun=1` → 401 draaien (optioneel, vereist dev-server).

## Done criteria

- [ ] `lib/security/cron-auth.ts` + test bestaan; test groen in `npm run test:unit`
- [ ] Alle 5 routes gebruiken `isAuthorizedCron`; grep op het oude patroon → 0 hits
- [ ] `npm run typecheck` exit 0
- [ ] Geen gedragswijziging in response-shapes (diff-review)
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- Een van de vijf routes blijkt een afwijkende auth-structuur te hebben (bv. query-param-secret) die niet op het excerpt lijkt — rapporteer i.p.v. improviseren.
- `server-only`-importfout bij de test — rapporteer (de helper hoort geen server-only te importeren).

## Maintenance notes

- Nieuwe cron-routes: altijd `isAuthorizedCron` gebruiken; reviewer let op het oude template-literal-patroon.
- De cron-pinger (cron-job.org) en Vercel-cron sturen dezelfde `Bearer`-header — geen configwijziging nodig.
