# M-E — Observability + AVG-code (V1)

**Branch:** `feat/seb/v1-observability` · **Worktree:** `../chatmanta-v1-obs` · **Migratie:** GEEN (audit_logs bestaat (0004); deletes via bestaande FK-cascades).

## Doel
§1.5 #11 (Sentry) + #13/#14 (admin-2FA + AVG-basis). Drie onafhankelijke stukken: (1) Sentry-wiring (server-side, DSN=ops), (2) admin-AAL2-check in `requireJorionAdmin`, (3) handmatige AVG export- + verwijder-actie via de Jorion-admin. UptimeRobot = puur ops (geen code).

## Hard rules
- V0 ongemoeid (`lib/v0/**`/`app/api/v0/**`/`/v0` niet editen — `instrumentation.ts` + `lib/auth.ts` zijn V1/shared root-files, geen V0). Sentry mag V0-errors óók vangen (harmless).
- AVG-delete/export alleen via `getJorionAdminClient()` ná `requireJorionAdmin()` (cross-org service-role; élke action self-gate). Delete = type-to-confirm (typo-guard) + `audit_logs`-entry.
- Geen secrets in `NEXT_PUBLIC_*`. Sentry-DSN via `SENTRY_DSN` (server env, no-op als leeg → veilig zonder DSN).
- ponytail-minimaal per stuk; geen build-config-invasie.

## 1. Sentry-wiring (`@sentry/node`, server-side)
**Gebruik `@sentry/node`, NIET `@sentry/nextjs`** — vermijdt `withSentryConfig`/next.config-wrapping + client-bundle-risico (Next 16). Server-side capture is de §1.5-kern; browser-SDK + source-maps = follow-up.
- `npm i @sentry/node` (verifieer dat `npm ci`/build groen blijft).
- **`lib/observability/sentry.ts`** (nieuw, `import 'server-only'`): `initSentry()` → `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0, environment: process.env.VERCEL_ENV ?? 'development', beforeSend })`. **Geen DSN → init is een no-op** (Sentry stuurt niets; veilig). `beforeSend(event)` → scrub PII met `redactPii` (`@/lib/observability/redact`) op `event.message` + elke `event.exception.values[].value`. Exporteer ook een dunne `captureServerError(err, ctx?)` helper.
- **`instrumentation.ts`** (edit): in de bestaande `register()` nodejs-branch, ná de assert: `const { initSentry } = await import('./lib/observability/sentry'); initSentry();`. Voeg toe (top-level export): `export async function onRequestError(err, request, context) { const { captureServerError } = await import('./lib/observability/sentry'); captureServerError(err, { request, context }); }` (Next 16 roept dit bij server/route-fouten → vangt de unhandled 500's). Laat de bestaande V0-error-capture-import staan.
- **Raak de sink-seam NIET aan** (`lib/observability/sink.ts`) — die single-sink replace zou V0's DB-capture breken. Sentry vangt onafhankelijk via `onRequestError` + Sentry's eigen global handlers. *(Flag: caught `actionTry`-fouten + browser-SDK + source-map-upload = follow-up.)*
- DSN = ops → Eindlijst.

## 2. Admin-AAL2-check in `requireJorionAdmin` (`lib/auth.ts`)
Ná de bestaande `is_jorion_admin`-check, vóór `return user`, voeg de **idiomatische Supabase step-up** toe:
```ts
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
// Step-up: alleen blokkeren als de admin MFA HEEFT (nextLevel aal2) maar deze sessie
// nog niet aal2 is. Niet-ge-enrollde admins (nextLevel !== 'aal2') laten we door
// (anders breekt het admin-dashboard tot MFA-enrollment = ops). Enrollen activeert de gate.
if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
  throw new AppError('AUTH_FORBIDDEN', { message: '2FA vereist — voltooi de tweede stap.' });
}
```
> Waarom step-up i.p.v. hard-blokkeren-alle-niet-2FA: de test-admin (`member@example.com`) heeft geen MFA → een harde eis zou álle admin-pagina's (M-D) breken tot enrollment. Deze idiomatische check brickt niets en **activeert automatisch zodra Seb MFA enrollt**. Flag in Eindlijst: enroll MFA → gate actief; harde "alle admins verplicht 2FA" = latere env-flag indien gewenst. Voeg een korte unit-test toe alleen als je een pure helper extraheert (de check zelf is DB/SDK-afhankelijk → geen losse test).

## 3. AVG export + verwijder (Jorion-admin)
### 3a. Export — `app/v1/admin/organizations/[id]/export/route.ts` (GET)
`requireJorionAdmin()` → `getJorionAdminClient()` → verzamel de org-data: `organizations`-rij, `organization_members`, `chatbots`, `knowledge_sources`, `documents` (metadata + included; chunk-content optioneel weglaten — te groot/afgeleid), `query_log` (de laatste N of alles — let op de PostgREST-cap; pagineer of cap met een notitie), `processing_jobs`. Return als **JSON-download**: `new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': \`attachment; filename="org-<slug>-export.json"\`, 'Cache-Control': 'no-store' } })`. AVG-portabiliteit; geen PII-redactie hier (de admin exporteert bewust de eigen-klant-data; het is een gegevensverzoek-uitvoer).
### 3b. Verwijder — `deleteOrgDataAction(orgId, confirmText)` in `app/v1/admin/organizations/[id]/actions.ts`
`requireJorionAdmin()` → resolve de org via `getJorionAdminClient()` → **verifieer `confirmText === org.slug`** (typo-guard; anders `fail('INPUT_INVALID', 'Bevestiging komt niet overeen met de org-slug.')`). Dan:
1. Lees de member `user_id`s (vóór de delete) uit `organization_members`.
2. `delete from organizations where id = orgId` → **CASCADE** ruimt `organization_members`/`chatbots`/`documents`/`*_chunks`/`query_log`/`knowledge_sources`/`processing_jobs`/`crawl_events`/`answer_cache` op (FK `on delete cascade`, migr 0001/0002/0003 — verifieer kort dat de cascades er zijn; zo niet, delete de kind-tabellen expliciet).
3. **Best-effort** de auth-users van de members verwijderen via de service-role admin-API (`getV1ServiceRoleClient().auth.admin.deleteUser(userId)`) — V1 = één-org-per-user, dus veilig. Flag de multi-org-edge (als een user ooit meerdere orgs heeft → niet blind deleten). Best-effort: een gefaalde user-delete mag de org-delete niet terugdraaien (log warn).
4. `audit_logs`-entry (tabel uit 0004; gebruik `lib/v1/audit.ts` `writeAuditLog` indien aanwezig — action `'org_deleted'`, actor = de admin, target = orgId).
5. `revalidatePath('/v1/admin/organizations')` + redirect of `ActionResult` (de UI navigeert terug naar de lijst).
### 3c. UI — "Gegevensbeheer (AVG)"-sectie in de deep-dive
Edit `app/v1/admin/organizations/[id]/page.tsx`: voeg een sectie toe met (a) een **Exporteren**-knop (link naar de export-route), en (b) een **danger-zone** "Organisatie + alle data verwijderen" → een client-component (`delete-org-form.tsx`) met een type-to-confirm-input (typ de slug) → `deleteOrgDataAction`. Visueel als danger (rode rand/knop). Toon het resultaat/fout.

## Verificatie (alles groen; GEEN billable calls)
1. `npx tsc --noEmit`
2. `Remove-Item -Recurse -Force .next; npm run build` (let op: `@sentry/node`-import mag de build niet breken; geen client-bundle-lek).
3. `npm run test:unit` (grep-gate + bestaande tests groen).
4. **Non-billable smoke** (orchestrator draait 'm): de delete/export tegen een **wegwerp-org** (admin maakt een test-org → exporteer → verwijder → bevestig weg) — NIET de seed-orgs. Geen Sentry-DSN nodig (no-op). Geen LLM/Firecrawl. *(Implementer schrijft GEEN destructief script tegen seed-data.)*

## Commit & PR
Commit per stuk (Sentry / AAL2 / AVG). Niet pushen, geen PR, geen migratie. Rapporteer: files, tsc/build/test, of `@sentry/node` schoon bouwde (en of `withSentryConfig` echt overgeslagen kon), de AAL2-step-up-logica, en de cascade-verificatie voor de delete (welke FK's cascaden / wat je expliciet moest deleten).
