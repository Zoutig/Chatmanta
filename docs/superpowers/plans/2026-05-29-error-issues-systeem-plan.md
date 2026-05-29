# PLAN (milestones) — Centraal fout-/errorsysteem + Copy-for-Claude

Spec: `docs/superpowers/specs/2026-05-29-error-issues-systeem-design.md`. Vier milestones, elk
onafhankelijk verifieerbaar. Typecheck + tests ná elke milestone; klein + vaak committen.

---

## M1 — Schema + pure helpers + never-throw writer

**Deliverables**
- `supabase/migrations/0039_admin_error_groups.sql` — tabel + indexes, hergebruik
  `admin_touch_updated_at()` (géén nieuwe trigger-fn, géén RLS, plain nullable uuid).
- `lib/observability/sink.ts` — `ErrorEvent` (Sentry-superset) + `ErrorSink` + `registerSink`/`getSink`
  (default no-op).
- `lib/observability/fingerprint.ts` — pure `computeFingerprint()` + `normalize()`.
- `lib/observability/redact.ts` — pure `redactPii(text)` (hergebruik pii.ts EMAIL/IBAN/BSN/PHONE-regex).
- `lib/observability/claude-payload.ts` — pure `buildClaudePayload(group) → markdown`.
- `lib/v0/server/error-capture.ts` — `captureError(partial): void` fire-and-forget upsert via
  controlroom `sb()`; `after()` + `Promise.race(~800ms)` + reentrancy-guard; severity-map; cardinality-cap.
- Eslint `no-restricted-imports`: verbied controlroom/error-capture-import vanuit `lib/errors/**`.
- Unit-tests: `tests/observability/{fingerprint,redact,claude-payload}.spec.ts`.

**Acceptance:** `npm run migrate` clean; fingerprint collapses requestId/uuid/number-varianten naar één
hash; `redactPii` maskeert email/telefoon/IBAN/BSN; twee identieke captures → `count=2` (één rij);
capture slikt een geforceerde DB-fout zonder te throwen.

---

## M2 — Server-wiring (no latency, no regressions)

**Deliverables**
- `lib/errors/action.ts` `actionTry` — optionele `meta?:{surface,route,organizationId}`; mint
  `newRequestId()` lazy in de catch; `getSink().capture(...)`; surface requestId in `ActionFail.requestId`
  (backwards-compatible optioneel veld).
- `app/api/v0/chat/route.ts` — capture in de 3 pre-pipeline gates (rate-limit/auth/parse → `info`),
  de stream-catch (~r397, `error`), en de `logQuery`/`commitTurn`/`logBlockedQuery`-catch-sites
  (`warning`), alles via `after()`/niet-awaited.
- `app/api/v0/feedback/route.ts` — één capture-regel in de bestaande outer-catch.
- Expliciete sink-registratie bij boot (`instrumentation.ts` of een gedeelde server-module).

**Acceptance:** server-action-throw → exact één `error`-rij (`surface=dashboard`); tweede identieke
throw → `count=2`; rate-limit → één `info`-rij; succesvolle chat → nul rijen; stream sluit direct
(geen latency); geforceerde RPC-fout → alleen `console.error`, geen broken response.

---

## M3 — Publiek client-ingest + client-reporters

**Deliverables**
- `app/api/v0/client-error/route.ts` — rate-limit FIRST (dedicated `~20/min/IP` + per-org) → body-cap →
  JSON-guard → server-redact → server-org-resolve (KNOWN_ORGS, onbekend→NULL) → server-fingerprint →
  origin fail-open+downgrade-naar-`info` → **altijd 204**.
- `proxy.ts` — voeg `client-error` toe aan de negative-lookahead matcher (uit de password-gate).
- `lib/widget/report-client-error.ts` — `sendBeacon`, geen await, eigen `chm_`-id.
- Widget: error boundary + `window.onerror`/`unhandledrejection` in het embed-iframe.
- Dashboard: `app/error.tsx` reporter-call; `app/global-error.tsx` indien afwezig.

**Acceptance:** dashboard-throw + geforceerde widget-crash → rijen `surface=dashboard`/`widget` met
PII-geredigeerde message; 1MB-body en garbage-JSON → 204 + nul rijen; verdachte origin → `info` +
`originSuspect=true`; endpoint bereikbaar zónder V0-wachtwoordcookie; antwoord altijd 204.

---

## M4 — Issues-tab + Copy-for-Claude + health + retention

**Deliverables**
- `lib/controlroom/server/errors.ts` — `listErrorGroups({severity?,surface?,org?,status?})`,
  `getErrorGroup(id)`, `setErrorGroupStatus(id,status)` (sb(), KNOWN_ORGS-gevalideerd).
- `app/admindashboard/issues/page.tsx` — health-strip + Gelogde-fouten-sectie (default error+warning+
  open, RSC-searchParam-filters) + behouden `buildIssues()` "Afgeleide signalen" (map `critical→error`).
- `app/admindashboard/issues/[groupId]/page.tsx` — detail + `CopyButton(buildClaudePayload(group))`.
- `app/actions/controlroom.ts` — `resolveErrorGroupAction`/`ignoreErrorGroupAction` (`requireV0Auth()` +
  KNOWN_ORGS-validatie + `revalidatePath`).
- `lib/controlroom/server/health.ts`/`signals.ts` — `recentCriticalErrorCount` additief in `OrgSignals`.
- `lib/controlroom/server/retention.ts` — prune-blok voor `admin_error_groups`.
- (optioneel) seed-helper voor demo-fouten t.b.v. UI-test.

**Acceptance:** Issues-tab toont default error+warning+open met kloppende count-badges; detail opent;
Copy-for-Claude levert plak-klaar markdown (stack+requestId+org+commit+geredigeerde input, file:line
zichtbaar); resolve/ignore haalt de rij uit de default-view; org met recente critical → oranje/rood in
de health-strip; `controlroom:retention` dry-run toont kandidaten, `--apply` prunet.

---

## Pre-PR gates (Phase 5)
5a review-loop (`/code-review` high/max ⇄ Codex-MCP, rebuttal, ≤3 rondes) · 5b `Remove-Item .next` +
`next build` + metadata-collisie-check · 5c browser-verify (Issues-tab licht/donker/mobiel) · 5d
eval-gate — **waarschijnlijk skip**: de `lib/v0/`-wijziging is additieve logging die het bot-antwoord
niet verandert (motiveer expliciet bij de gate).
