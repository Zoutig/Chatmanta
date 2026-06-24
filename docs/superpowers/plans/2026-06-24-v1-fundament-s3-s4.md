# V1 Fundament §3 + §4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a second Supabase project (V1-prod), split the Supabase client factories per-database with a CI-enforced grep-gate, and prove auth end-to-end (login → membership-check → protected page) against the V1 project.

**Architecture:** Asymmetric split — the V0 service-role factory stays on its current path (zero churn for ~20 importers); the V1-bound clients (anon/session/browser + a new V1 service-role factory) move under `lib/supabase/v1/`. The existing `proxy.ts` (Next.js 16 middleware-equivalent) gets a `/v1`-branch that runs Supabase session-refresh and skips the V0 demo-gate. Built as two PRs (PR-3 = §3, PR-4 = §4) with a checkpoint between.

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr@^0.10.3`, `@supabase/supabase-js@^2.105`, Supabase (Postgres + Auth + pgvector), `node:test` + tsx unit tests, Playwright e2e, Supabase MCP for project creation + migration apply (dev-machine pooler block).

**Spec:** `docs/superpowers/specs/2026-06-24-v1-fundament-s3-s4-design.md`

---

## File Structure

**PR-3 (§3):**
- Modify `lib/supabase/service-role.ts` — env reads → `V0_SUPABASE_URL` + `V0_SUPABASE_SERVICE_ROLE_KEY` (this is now explicitly the **V0** factory).
- Create `lib/supabase/v1/service-role.ts` — V1 service-role factory (`getV1ServiceRoleClient()`).
- Create `lib/supabase/v1/server.ts` — V1 anon/session client (moved from `lib/supabase/server.ts`).
- Create `lib/supabase/v1/client.ts` — V1 browser client (moved from `lib/supabase/client.ts`).
- Delete `lib/supabase/server.ts`, `lib/supabase/client.ts`.
- Modify `lib/supabase/admin.ts` — `getJorionAdminClient`/`getOrgScopedAdminClient` → V1 factory; `getSystemJobClient` stays V0.
- Modify `lib/auth.ts` — import V1 server client.
- Modify `lib/supabase/__tests__/no-adhoc-service-client.test.ts` — encode V0/V1 boundary.
- Modify `lib/v0/server/startup-assert.ts` + its test — require the new env vars.
- Modify `scripts/migrate.mjs` — generalize to `MIGRATE_DIR` + `MIGRATE_DB_URL`.
- Modify `package.json` — add `migrate:v1`, `migrate:v1:status`.
- Create `supabase/migrations-v1/0001_core_tenancy.sql` — curated baseline.
- Modify `.github/workflows/build.yml` — add `test:unit` step + rename build env.

**PR-4 (§4):**
- Create `lib/supabase/v1/middleware.ts` — `updateSession(req)` Supabase token-refresh helper.
- Modify `proxy.ts` — `/v1`-branch (session-refresh, skip V0 gate).
- Modify `lib/auth.ts` — `requireAuth()` redirects to `/v1/login` (not the V0 `/login`).
- Create `app/v1/login/page.tsx` + `app/v1/login/login-form.tsx` — V1 login (Supabase Auth).
- Create `app/v1/app/page.tsx` — protected page behind `requireOrgMember`.
- Create `tests/v1/auth.spec.ts` — e2e happy + deny + unauth.
- Modify `playwright.config.ts` — a `v1` project that does NOT load the V0 storage state.

---

## PART A — PR-3 (§3): second project + factory split + grep-gate

### Task A1: Pre-flight + create V1-prod project (gated ops)

**Files:** `.env.local` (worktree, gitignored — not committed)

- [ ] **Step 1: Install deps in the worktree**

Run: `npm ci`
Expected: completes; `node_modules/` present (Turbopack-dev needs a real install per worktree).

- [ ] **Step 2: STOP — get explicit go from Sebastiaan before creating the external project.** Creating a Supabase project is an external resource action.

- [ ] **Step 3: Create the V1-prod project via Supabase MCP**

Use MCP `mcp__plugin_supabase_supabase__create_project` with `name: "ChatManta V1-prod"`, `region: "eu-west-1"`, the existing `organization_id` (from `list_organizations`). Free tier → call `confirm_cost` first if prompted (cost = $0). Capture: project `ref`, project URL, anon key (`get_publishable_keys`), service-role key (Supabase dashboard → Settings → API), and the pooler `DATABASE_URL` (Settings → Database → Connection string, URI mode).

- [ ] **Step 4: Add new env vars to `.env.local` (worktree) — keep the old ones for now**

Add (do NOT remove the existing `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` yet — removed in Task A8):
```
V0_SUPABASE_URL=<existing NEXT_PUBLIC_SUPABASE_URL value>
V0_SUPABASE_SERVICE_ROLE_KEY=<existing SUPABASE_SERVICE_ROLE_KEY value>
NEXT_PUBLIC_V1_SUPABASE_URL=<V1 project URL>
NEXT_PUBLIC_V1_SUPABASE_ANON_KEY=<V1 anon key>
V1_SUPABASE_SERVICE_ROLE_KEY=<V1 service-role key>
V1_DATABASE_URL=<V1 pooler connection string>
```

- [ ] **Step 5: Commit nothing yet** (env is gitignored). Proceed to A2.

---

### Task A2: Generalize the migration runner

**Files:**
- Modify: `scripts/migrate.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Parameterize dir + connection in `scripts/migrate.mjs`**

Replace the `const url = process.env.DATABASE_URL;` block (lines 24-29) and the `migrationsDir` line (37):
```js
const url = process.env.MIGRATE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('✗ MIGRATE_DB_URL/DATABASE_URL ontbreekt in env.');
  console.error('  Voeg toe aan .env.local — zie Supabase dashboard → Database → Connection string.');
  process.exit(1);
}
```
and
```js
const migrationsDir = resolve(process.env.MIGRATE_DIR || 'supabase/migrations');
```
This keeps V0 (`npm run migrate`) byte-for-byte identical (both env vars default to the old values) and lets a V1 invocation override both.

- [ ] **Step 2: Add V1 scripts to `package.json`** (after the existing `migrate:bootstrap` line)
```json
    "migrate:v1": "node --env-file=.env.local scripts/migrate.mjs",
    "migrate:v1:status": "node --env-file=.env.local scripts/migrate.mjs status",
```
> Note: the per-target override is supplied at call time via env, e.g. `MIGRATE_DIR=supabase/migrations-v1 MIGRATE_DB_URL=$V1_DATABASE_URL npm run migrate:v1`. On Windows PowerShell use `$env:MIGRATE_DIR='supabase/migrations-v1'; $env:MIGRATE_DB_URL=$env:V1_DATABASE_URL; npm run migrate:v1`. (The actual apply happens via MCP in A3 because of the dev-machine pooler block; these scripts are the source-of-truth path for when the network allows.)

- [ ] **Step 3: Verify V0 path unchanged**

Run: `npm run migrate:status`
Expected: same applied/pending list as before (V0 ledger), no errors. (If the dev-machine pooler block bites, status times out — that is the known issue, not a regression; note it and continue.)

- [ ] **Step 4: Commit**
```bash
git add scripts/migrate.mjs package.json
git commit -m "feat(migrate): generaliseer runner naar MIGRATE_DIR + MIGRATE_DB_URL (V1-stroom)"
```

---

### Task A3: V1 baseline migration (curated) + apply via MCP

**Files:**
- Create: `supabase/migrations-v1/0001_core_tenancy.sql`

- [ ] **Step 1: Copy the core-tenancy baseline into the V1 stream**

Create `supabase/migrations-v1/0001_core_tenancy.sql` as a byte-for-byte copy of `supabase/migrations/0001_core_tenancy.sql` (organizations + users + organization_members + RLS + the `handle_new_auth_user` trigger). It references `auth.users`, which exists in every Supabase project.

- [ ] **Step 2: Apply to the V1 project via MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the V1 project `ref`, `name: "0001_core_tenancy"`, and the SQL body. Then insert the ledger row so a future runner won't re-apply it: `mcp__plugin_supabase_supabase__execute_sql` →
```sql
create table if not exists public._migrations (id text primary key, applied_at timestamptz not null default now());
insert into public._migrations(id) values ('0001_core_tenancy') on conflict do nothing;
```

- [ ] **Step 3: Verify the V1 schema**

Use `mcp__plugin_supabase_supabase__list_tables` (V1 ref). Expected: `organizations`, `users`, `organization_members` present with RLS enabled. Use `mcp__plugin_supabase_supabase__get_advisors` (type `security`) — expected: no RLS-disabled findings on the three tables.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations-v1/0001_core_tenancy.sql
git commit -m "feat(v1): gecureerde baseline 0001_core_tenancy in V1-migratiestroom"
```

---

### Task A4: Extend the grep-gate (failing test first)

**Files:**
- Modify: `lib/supabase/__tests__/no-adhoc-service-client.test.ts`

- [ ] **Step 1: Rewrite the test to encode the V0/V1 boundary**

Replace the body of the file (keep the header comment intact, update it) with the existing service-role walk PLUS the boundary checks. Full new content for the test section (after the imports + `walk()` helper, which stay):
```ts
// V0 = de bestaande factory; V1 = de nieuwe namespaced factories.
const V0_NEEDLE = 'V0_SUPABASE_SERVICE_ROLE_' + 'KEY';
const V1_NEEDLE = 'V1_SUPABASE_SERVICE_ROLE_' + 'KEY';

const V0_SERVICE_ROLE = join('lib', 'supabase', 'service-role.ts');
const V1_SERVICE_ROLE = join('lib', 'supabase', 'v1', 'service-role.ts');

const V0_KEY_ALLOWED = new Set([V0_SERVICE_ROLE]);
const V1_KEY_ALLOWED = new Set([V1_SERVICE_ROLE]);

function allFiles(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  for (const root of ['lib', 'app']) {
    for (const file of walk(join(repoRoot, root))) {
      out.push({ rel: relative(repoRoot, file), src: readFileSync(file, 'utf8') });
    }
  }
  return out;
}

// Red→green-driver: faalt zolang de V0-factory de KALE legacy-key leest (vóór A5),
// slaagt zodra hij de V0-geprefixte naam gebruikt. Dit is de test die A4 rood maakt.
test('V0-factory leest de V0-geprefixte service-role-key', () => {
  const src = readFileSync(join(repoRoot, 'lib', 'supabase', 'service-role.ts'), 'utf8');
  assert.ok(
    src.includes('V0_SUPABASE_SERVICE_ROLE_' + 'KEY'),
    'lib/supabase/service-role.ts moet V0_SUPABASE_SERVICE_ROLE_KEY lezen (V0/V1-split)',
  );
});

test('V0 service-role key alleen in de V0-factory', () => {
  const offenders = allFiles()
    .filter((f) => !V0_KEY_ALLOWED.has(f.rel) && f.src.includes(V0_NEEDLE) && f.src.includes('createClient'))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V0 service-role-key buiten lib/supabase/service-role.ts:\n${offenders.join('\n')}`);
});

test('V1 service-role key alleen in de V1-factory', () => {
  const offenders = allFiles()
    .filter((f) => !V1_KEY_ALLOWED.has(f.rel) && f.src.includes(V1_NEEDLE) && f.src.includes('createClient'))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V1 service-role-key buiten lib/supabase/v1/service-role.ts:\n${offenders.join('\n')}`);
});

test('lib/v0 (+ commandcenter/controlroom) importeert geen V1-clients', () => {
  const v1Import = /from ['"]@\/lib\/supabase\/v1\//;
  const offenders = allFiles()
    .filter((f) => /^lib[\\/](v0|commandcenter|controlroom)[\\/]/.test(f.rel) && v1Import.test(f.src))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V0-code importeert een V1-client:\n${offenders.join('\n')}`);
});

test('V1-auth-laag importeert niet de V0 service-role-factory', () => {
  const v0Import = /from ['"]@\/lib\/supabase\/service-role['"]/;
  // lib/auth.ts is V1; admin.ts mag wél (getSystemJobClient blijft V0) → uitgezonderd.
  const offenders = allFiles()
    .filter((f) => f.rel === join('lib', 'auth.ts') && v0Import.test(f.src))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], `V1-auth importeert de V0 service-role-factory:\n${offenders.join('\n')}`);
});
```
Also delete the old single `test('SUPABASE_SERVICE_ROLE_KEY ...')` block and its `NEEDLE`/`ALLOWED` constants (superseded by the two key-tests above).

- [ ] **Step 2: Run → expect FAIL**

Run: `node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts`
Expected: FAIL on `V0-factory leest de V0-geprefixte service-role-key` — `service-role.ts` still reads the bare `SUPABASE_SERVICE_ROLE_KEY`. (The boundary-guard tests pass trivially now; they start guarding once the split exists — that is their job.)

- [ ] **Step 3: Commit the failing test**
```bash
git add lib/supabase/__tests__/no-adhoc-service-client.test.ts
git commit -m "test(supabase): grep-gate dwingt V0/V1-factory-scheiding af (faalt tot split)"
```

---

### Task A5: Factory split (make the gate pass)

**Files:**
- Modify: `lib/supabase/service-role.ts`
- Create: `lib/supabase/v1/service-role.ts`, `lib/supabase/v1/server.ts`, `lib/supabase/v1/client.ts`
- Delete: `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Modify: `lib/supabase/admin.ts`, `lib/auth.ts`, `app/admindashboard/instellingen/page.tsx`

- [ ] **Step 1: Point the V0 factory at `V0_*`**

In `lib/supabase/service-role.ts`, change the env reads (lines 34-35) to:
```js
  const url = process.env.V0_SUPABASE_URL;
  const key = process.env.V0_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'V0 service-role client requires V0_SUPABASE_URL and V0_SUPABASE_SERVICE_ROLE_KEY',
    );
  }
```
Update the top comment to say "the V0 service-role factory".

- [ ] **Step 2: Create `lib/supabase/v1/service-role.ts`**
```ts
// V1-prod service-role factory — bypasses RLS, reads V1_* env. Zelfde vorm als
// de V0-factory (lib/supabase/service-role.ts) maar tegen het V1-project. Zero
// dependency op @/lib/auth (zie service-role.ts voor het waarom).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _cached: SupabaseClient | null = null;

export function getV1ServiceRoleClient(): SupabaseClient {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
  const key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'V1 service-role client requires NEXT_PUBLIC_V1_SUPABASE_URL and V1_SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _cached;
}
```

- [ ] **Step 3: Create `lib/supabase/v1/server.ts`** (moved from `lib/supabase/server.ts`, env → V1)
```ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// V1 anon/session client (cookie-based, RLS-bound) tegen het V1-project.
// Verplaatst van lib/supabase/server.ts (PR-2-vorm) → V1-namespace (kickoff §3).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies — proxy.ts refresh handles it.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Create `lib/supabase/v1/client.ts`** (moved from `lib/supabase/client.ts`, env → V1)
```ts
import { createBrowserClient } from '@supabase/ssr';

// V1 browser client voor Client Components ("use client"), RLS-bound.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Delete the old anon/browser clients**
```bash
git rm lib/supabase/server.ts lib/supabase/client.ts
```

- [ ] **Step 6: Repoint `lib/auth.ts`** — change line 2 from `@/lib/supabase/server` to `@/lib/supabase/v1/server`.

- [ ] **Step 7: Repoint `lib/supabase/admin.ts`** — `getJorionAdminClient` + `getOrgScopedAdminClient` return the V1 factory; `getSystemJobClient` stays V0. Change the import (line 21) to import both factories, and update the two V1-auth-gated wrappers:
```ts
import { getServiceRoleClient } from './service-role';            // V0
import { getV1ServiceRoleClient } from './v1/service-role';        // V1
```
In `getJorionAdminClient`: `return getV1ServiceRoleClient();`
In `getOrgScopedAdminClient`: `return getV1ServiceRoleClient();`
Leave `getSystemJobClient` returning `getServiceRoleClient()` (V0). Update the file's doc comment to record the deliberate mix (§2-nuance of the spec).

- [ ] **Step 7b: Update the admin service-role presence-check**

`app/admindashboard/instellingen/page.tsx` reads the bare `SUPABASE_SERVICE_ROLE_KEY` for a "is it configured?" boolean (recon: line ~38). Change that read to `V0_SUPABASE_SERVICE_ROLE_KEY` so the indicator stays correct after the cutover removes the old var. (No `createClient` here — purely a presence check.)

- [ ] **Step 8: Run the grep-gate → expect PASS**

Run: `node --import tsx --test lib/supabase/__tests__/no-adhoc-service-client.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Any remaining importer of the deleted `@/lib/supabase/server`/`client` surfaces here — the recon found only `lib/auth.ts` imported `server.ts` and nothing imported `client.ts`; fix any stragglers by pointing them at `@/lib/supabase/v1/*`.)

- [ ] **Step 10: Commit**
```bash
git add lib/supabase lib/auth.ts app/admindashboard/instellingen/page.tsx
git commit -m "refactor(supabase): V0/V1-factory-split — V0 service-role op pad, V1-clients onder lib/supabase/v1"
```

---

### Task A6: Extend the startup-assert for the new env vars

**Files:**
- Modify: `lib/v0/server/startup-assert.ts`
- Modify: `lib/v0/server/__tests__/startup-assert.test.ts`

- [ ] **Step 1: Add a failing test case**

In `lib/v0/server/__tests__/startup-assert.test.ts`, add (mirroring the existing `checkProductionEnv` cases):
```ts
test('checkProductionEnv faalt als V0/V1 Supabase-vars ontbreken', () => {
  const base = {
    EMBED_TOKEN_SECRET: 'x'.repeat(16),
  };
  const { ok, errors } = checkProductionEnv(base);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('V0_SUPABASE_URL')));
  assert.ok(errors.some((e) => e.includes('NEXT_PUBLIC_V1_SUPABASE_URL')));
});

test('checkProductionEnv ok met alle Supabase-vars + embed-secret', () => {
  const { ok } = checkProductionEnv({
    EMBED_TOKEN_SECRET: 'x'.repeat(16),
    V0_SUPABASE_URL: 'https://v0.supabase.co',
    V0_SUPABASE_SERVICE_ROLE_KEY: 'k',
    NEXT_PUBLIC_V1_SUPABASE_URL: 'https://v1.supabase.co',
    NEXT_PUBLIC_V1_SUPABASE_ANON_KEY: 'a',
    V1_SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
  assert.equal(ok, true);
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --import tsx --test lib/v0/server/__tests__/startup-assert.test.ts`
Expected: FAIL (new vars not yet checked).

- [ ] **Step 3: Extend `checkProductionEnv`** — add, before `return { ok: ... }`:
```ts
  const required = [
    'V0_SUPABASE_URL',
    'V0_SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_V1_SUPABASE_URL',
    'NEXT_PUBLIC_V1_SUPABASE_ANON_KEY',
    'V1_SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const name of required) {
    if (!env[name]) {
      errors.push(`${name} ontbreekt — vereist sinds de V0/V1-namespace-split (kickoff §3).`);
    }
  }
```

- [ ] **Step 4: Run → expect PASS**

Run: `node --import tsx --test lib/v0/server/__tests__/startup-assert.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/v0/server/startup-assert.ts lib/v0/server/__tests__/startup-assert.test.ts
git commit -m "feat(startup-assert): vereis V0/V1 Supabase-env fail-loud (cutover-vangrail)"
```

---

### Task A7: Wire the grep-gate into CI + rename build env

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add a unit-test step before build + rename the build env**

In `.github/workflows/build.yml`, add after the Typecheck step:
```yaml
      - name: Unit tests (incl. service-role grep-gate)
        run: npm run test:unit
```
and change the `Build` step's `env:` block to:
```yaml
        env:
          V0_SUPABASE_URL: ${{ secrets.V0_SUPABASE_URL }}
          V0_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.V0_SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_V1_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_V1_SUPABASE_URL }}
          NEXT_PUBLIC_V1_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY }}
```
(The V1 service-role key is not needed at build — no SSG path uses it. The V1 anon/url ARE needed because the `/v1/login` client bundle inlines `NEXT_PUBLIC_V1_*`.)

- [ ] **Step 2: Add the GitHub secrets** (ops)

In the repo's GitHub → Settings → Secrets: add `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY` (mirror the values). Leave the old secrets in place until A8 confirms green.

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/build.yml
git commit -m "ci: draai test:unit (grep-gate) + V0/V1 build-env"
```

---

### Task A8: Vercel env cutover (ops, safe order) + local verify

**Files:** none (Vercel dashboard + local build)

- [ ] **Step 1: Add new vars on Vercel (do NOT remove old yet)** — Production + Preview: `V0_SUPABASE_URL`, `V0_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_V1_SUPABASE_URL`, `NEXT_PUBLIC_V1_SUPABASE_ANON_KEY`, `V1_SUPABASE_SERVICE_ROLE_KEY`. (Env changes only take effect after a redeploy — see memory `vercel_deployment`.)

- [ ] **Step 2: Clean local build to verify the rename end-to-end**

Run (PowerShell): `Remove-Item -Recurse -Force .next; npm run build`
Expected: build succeeds reading the new vars. (Windows: always clear `.next` before a verification build — memory `windows_next_build_dirty_next_crash`.)

- [ ] **Step 3: Smoke the V0 surfaces** (dev server on a free port)

Run: `npx next dev -p 3005` then load `/home`, the klantendashboard, trigger a budget-checked chat, and a crawler action. Expected: all read/write against the V0 project as before (no regressions from the env rename).

- [ ] **Step 4: After PR-3 is merged + Vercel redeploy is green, remove the OLD vars** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) from Vercel + GitHub secrets + local `.env.local`. (This is the final cutover; do it only once green.)

---

### Task A9: PR-3 verification + open the PR

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run test:unit && (Remove-Item -Recurse -Force .next; npm run build)`
Expected: all green; grep-gate green.

- [ ] **Step 2: Confirm branch + push**
```bash
git rev-parse --abbrev-ref HEAD   # expect feat/seb/v1-fundament-s3
git push -u origin feat/seb/v1-fundament-s3
```

- [ ] **Step 3: Open PR-3** with `gh pr create` using the template. Title: `feat(v1): fundament §3 — 2e Supabase-project + namespace-split + grep-gate (PR-3)`. In the body, note: V0 behaviour unchanged, grep-gate now green in CI, V1 project + baseline live, env cutover steps + the old-var removal as a post-merge action.

- [ ] **Step 4: CHECKPOINT — do NOT start PR-4 until:** PR-3 merged · Vercel prod redeploy green · V0 verified working against V0 project · grep-gate green in CI · old env vars removed.

---

## PART B — PR-4 (§4): auth end-to-end

> Branch from the merged `main` (which now includes PR-3). Reuse this worktree or a fresh one; `npm ci` + copy `.env.local` (now with V1 vars).

### Task B1: V1 auth e2e test (failing first)

**Files:**
- Create: `tests/v1/auth.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add a `v1` Playwright project that does NOT load the V0 storage state**

In `playwright.config.ts`, add a project entry (alongside the existing ones) whose `use` does **not** set `storageState: 'tests/.auth-state.json'` (V1 tests authenticate themselves):
```ts
    {
      name: 'v1',
      testMatch: /v1\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },  // no V0 storageState
    },
```
Also load `.env.local` into `process.env` at the top of `playwright.config.ts` so the V1 test can read `V1_SEED_*` (the repo has no `dotenv` dep — reuse the same minimal parser as `tests/global-setup.ts`):
```ts
import * as fs from 'node:fs';
for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : [])) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq < 0) continue;
  const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}
```

- [ ] **Step 2: Write the e2e test** `tests/v1/auth.spec.ts`
```ts
import { test, expect } from '@playwright/test';

// Seeded in B2: member@example.com is a member of V1_SEED_ORG_ID; outsider@example.com is not.
const MEMBER = { email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW! };
const OUTSIDER = { email: 'outsider@example.com', password: process.env.V1_SEED_OUTSIDER_PW! };

test('unauthenticated → redirect naar /v1/login', async ({ page }) => {
  await page.goto('/v1/app');
  await expect(page).toHaveURL(/\/v1\/login/);
});

test('member logt in → ziet beschermde pagina', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', MEMBER.email);
  await page.fill('input[name="password"]', MEMBER.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/v1\/app/);
  await expect(page.getByText(/ingelogd/i)).toBeVisible();
});

test('niet-lid wordt geweigerd', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', OUTSIDER.email);
  await page.fill('input[name="password"]', OUTSIDER.password);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/geen toegang|not a member|geweigerd/i)).toBeVisible();
});
```

- [ ] **Step 3: Run → expect FAIL**

Run: `npx playwright test --project=v1`
Expected: FAIL — `/v1/login` + `/v1/app` don't exist yet.

- [ ] **Step 4: Commit**
```bash
git add tests/v1/auth.spec.ts playwright.config.ts
git commit -m "test(v1): e2e auth happy+deny+unauth (faalt tot §4-routes bestaan)"
```

---

### Task B2: Seed V1 (auth users + org + memberships) via MCP

**Files:** `.env.local` (worktree, V1_SEED_* — not committed)

- [ ] **Step 1: Create two auth users in the V1 project**

Via Supabase MCP `execute_sql` against the V1 ref is NOT how you create auth users — use the Supabase dashboard (Authentication → Add user, with email + password, "auto-confirm"), or the Admin API. Create `member@example.com` and `outsider@example.com` with known passwords. The `handle_new_auth_user` trigger auto-creates their `public.users` rows.

- [ ] **Step 2: Create one org + one membership** (MCP `execute_sql`, V1 ref)
```sql
insert into public.organizations (name, slug) values ('Seed Org', 'seed-org')
  returning id;  -- note the id → V1_SEED_ORG_ID
insert into public.organization_members (organization_id, user_id, role)
  select o.id, u.id, 'owner'
  from public.organizations o, public.users u
  where o.slug = 'seed-org' and u.email = 'member@example.com';
```
(Do NOT add a membership for `outsider@example.com` — that is the deny-path.)

- [ ] **Step 3: Record seed values in `.env.local`** (worktree):
```
V1_SEED_ORG_ID=<org id from step 2>
V1_SEED_MEMBER_PW=<member password>
V1_SEED_OUTSIDER_PW=<outsider password>
```

---

### Task B3: Supabase session-refresh in proxy.ts (V1 branch)

**Files:**
- Create: `lib/supabase/v1/middleware.ts`
- Modify: `proxy.ts`

- [ ] **Step 1: Create the `updateSession` helper** `lib/supabase/v1/middleware.ts`
```ts
// Supabase SSR sessie-refresh voor V1-routes, aangeroepen vanuit proxy.ts.
// Canoniek @supabase/ssr-middlewarepatroon: geen code tussen createServerClient
// en getUser() (anders breekt de token-refresh). Verifieer tegen de
// geïnstalleerde @supabase/ssr (^0.10) bij implementatie.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(req: NextRequest): Promise<NextResponse> {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return res;
}
```

- [ ] **Step 2: Branch in `proxy.ts`** — at the top of `proxy()`, before the V0 cookie check:
```ts
import { updateSession } from '@/lib/supabase/v1/middleware';
// ...
export async function proxy(req: NextRequest) {
  // V1-routes: Supabase sessie-refresh, NIET de V0-demo-gate.
  if (req.nextUrl.pathname.startsWith('/v1')) {
    return updateSession(req);
  }
  // ... bestaande V0-gate ongewijzigd ...
}
```
Make `proxy` `async`. The matcher already runs on `/v1` (it is not in the exclusion list), so no `config.matcher` change is needed.

- [ ] **Step 3: Verify V0 gate intact + V1 reachable without demo cookie**

Run: `npx next dev -p 3005`. In a clean (no-cookie) browser: `/home` → redirects to `/login` (V0 gate intact); `/v1/login` → renders WITHOUT the demo-password redirect. Expected: both true.

- [ ] **Step 4: Commit**
```bash
git add lib/supabase/v1/middleware.ts proxy.ts
git commit -m "feat(v1): proxy V1-branch — Supabase sessie-refresh, V0-demo-gate uitgezonderd"
```

---

### Task B4: V1 login page

**Files:**
- Create: `app/v1/login/page.tsx`, `app/v1/login/login-form.tsx`

- [ ] **Step 1: Server page** `app/v1/login/page.tsx`
```tsx
import { V1LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default function V1LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: '10vh auto', fontFamily: 'system-ui' }}>
      <h1>V1 — Inloggen</h1>
      <V1LoginForm />
    </main>
  );
}
```

- [ ] **Step 2: Client form** `app/v1/login/login-form.tsx`
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/v1/client';

export function V1LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required />
      <input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wachtwoord" required />
      <button type="submit">Inloggen</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add app/v1/login
git commit -m "feat(v1): /v1/login — Supabase Auth login-pagina"
```

---

### Task B5: V1 protected page + requireAuth redirect fix

**Files:**
- Modify: `lib/auth.ts`
- Create: `app/v1/app/page.tsx`

- [ ] **Step 1: Point `requireAuth` redirect at the V1 login**

In `lib/auth.ts`, change `if (!user) redirect('/login');` (line 21) to `if (!user) redirect('/v1/login');` and update the doc comment ("Redirects to /v1/login if not authenticated"). (Safe: `lib/auth.ts` is the V1 auth layer with no other callers; the V0 demo `/login` is unrelated.)

- [ ] **Step 2: Protected page** `app/v1/app/page.tsx`
```tsx
import { redirect } from 'next/navigation';
import { requireAuth, requireOrgMember } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';

export const dynamic = 'force-dynamic';

export default async function V1AppPage() {
  const user = await requireAuth();           // → /v1/login als geen sessie
  const orgId = process.env.V1_SEED_ORG_ID!;  // fundament-proof; later: route-param/echte org-resolutie
  try {
    await requireOrgMember(orgId);
  } catch (e) {
    if (e instanceof AppError && e.code === 'AUTH_FORBIDDEN') {
      return <main style={{ maxWidth: 480, margin: '10vh auto' }}><h1>Geen toegang</h1><p>Je bent geen lid van deze organisatie.</p></main>;
    }
    throw e;
  }
  return (
    <main style={{ maxWidth: 480, margin: '10vh auto' }}>
      <h1>V1 — beschermde pagina</h1>
      <p>Ingelogd als {user.email}. Je bent lid van de organisatie.</p>
    </main>
  );
}
```
> Verify `AppError`'s code field name/shape in `lib/errors/app-error.ts` during implementation; adjust the `e.code === 'AUTH_FORBIDDEN'` check to match (the dormant `requireOrgMember` throws `new AppError('AUTH_FORBIDDEN', …)`).

- [ ] **Step 3: Commit**
```bash
git add lib/auth.ts app/v1/app
git commit -m "feat(v1): /v1/app beschermde pagina + requireAuth → /v1/login"
```

---

### Task B6: Run e2e green + verify + open PR-4

- [ ] **Step 1: Run the V1 e2e against a dev server**

Run: `npx next dev -p 3000` (separate shell), then `npx playwright test --project=v1`
Expected: all 3 tests PASS (unauth→redirect, member→protected, outsider→denied).

- [ ] **Step 2: Manual browser walk-through** — confirm member sees the page, outsider denied, logout/clean cookie → redirect to `/v1/login`.

- [ ] **Step 3: Full gate**

Run: `npm run typecheck && npm run test:unit && (Remove-Item -Recurse -Force .next; npm run build)`
Expected: green (incl. the unchanged grep-gate).

- [ ] **Step 4: Push + open PR-4**
```bash
git rev-parse --abbrev-ref HEAD
git push
```
Open PR-4 with `gh pr create`. Title: `feat(v1): fundament §4 — auth e2e bewezen (login → membership → beschermde pagina) (PR-4)`.

---

## Definition of Done (round)

- [ ] PR-3 + PR-4 merged.
- [ ] V1-prod project exists with `0001_core_tenancy`; V0 runs unchanged against its own project.
- [ ] Two namespaced factories + a green grep/CI-gate guarding the V0/V1 split.
- [ ] Auth e2e proven (happy + deny + unauth).
- [ ] Short status note in `docs/` + memory update ([[project_v1_strategy]]).
- [ ] Old (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) env vars removed from Vercel + GitHub + `.env.local` after green.

## Verification summary (end-to-end)

1. `npm run typecheck` — clean.
2. `npm run test:unit` — grep-gate (V0/V1 boundary) + startup-assert green.
3. `Remove-Item -Recurse -Force .next; npm run build` — builds with renamed env.
4. MCP `list_tables`/`get_advisors` on the V1 ref — core_tenancy present, RLS on.
5. `npx playwright test --project=v1` — auth happy + deny + unauth green.
6. Manual: V0 surfaces unchanged against V0 project; `/v1/login` reachable without demo cookie; `/home` still gated.
