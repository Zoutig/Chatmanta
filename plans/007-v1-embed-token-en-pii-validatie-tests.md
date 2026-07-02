# Plan 007: Testdekking op de V1 PII-poorten — embed-token HMAC + contact-request-validatie

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 628e7df..HEAD -- lib/v1/widget app/api/v1/contact-request`
> Bij drift: vergelijk de "Current state"-excerpts met de live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (pure-functie-extractie op een live PII-route; de tests zijn het vangnet)
- **Depends on**: 001 (glob-runner pikt de nieuwe tests op)
- **Category**: tests
- **Planned at**: commit `628e7df`, 2026-07-02

## Why this matters

`app/api/v1/contact-request` is het eerste V1-pad dat **echte bezoekers-PII** (naam/e-mail/telefoon) opslaat. De twee vangrails ervoor zijn volledig ongetest: (1) de fail-closed HMAC embed-token-gate `lib/v1/widget/embed-token.ts` — nul tests (de V0-variant hééft een assertieset, maar die draait nergens automatisch); (2) de ~40 regels inline validatie in de route-handler (honeypot, harde consent-check, preferred-contact-branch, e-mail/telefoon-regexes, veld-filtering). Een regressie die consent optioneel maakt of de expiry-check sloopt, shipt vandaag groen. Dit plan maakt beide gedragingen unit-getest.

## Current state

- `lib/v1/widget/embed-token.ts` (volledig gelezen 2026-07-02): `createEmbedToken(slug, ttlSec)` en `verifyEmbedToken(token, slug)`; wire-format `base64url(JSON{slug,exp}) "." base64url(HMAC-SHA256)`; timing-safe compare (regel 35-40); fail-closed zonder `EMBED_TOKEN_SECRET` (min 16 chars, regel 19-25); **importeert `'server-only'` op regel 14** — zie de escape hatch in Step 1.
- `scripts/dev/embed-token.test.ts` — assertieset voor de V0-variant (round-trip, verkeerde slug, tampered sig, expiry); na plan 001 verhuisd naar `lib/v0/server/__tests__/embed-token.test.ts`. Gebruik die als structuurmodel.
- `app/api/v1/contact-request/route.ts:104-142` (geverifieerd) — de inline validatie:

```ts
  // 6. Honeypot — gevuld → bot. Stil 200 zonder rij (geen signaal naar de bot).
  if ((str(body.company_url) ?? '').trim().length > 0) { ... }
  // 7. Validatie (hard; de DB-CHECKs zijn de backstop).
  const name = (str(body.name) ?? '').trim();
  if (name.length < 1 || name.length > NAME_MAX) return new NextResponse(null, { status: 400 });
  if (body.consentGiven !== true) return new NextResponse(null, { status: 400 });
  const preferred = str(body.preferredContact);
  if (preferred !== 'call' && preferred !== 'email') return new NextResponse(null, { status: 400 });
  ...
  if (preferred === 'call') { if (!phone || !PHONE_RE.test(phone)) ...400 }
  else { if (!email || !EMAIL_RE.test(email)) ...400 }
  if (phone && !PHONE_RE.test(phone)) phone = null;
  if (email && !EMAIL_RE.test(email)) email = null;
  const subject = subjectRaw ? subjectRaw.trim().slice(0, SUBJECT_MAX) || null : null;
  const message = messageRaw ? messageRaw.trim().slice(0, MESSAGE_MAX) || null : null;
```

- De org komt uitsluitend uit de gesigneerde token-slug (regel 60-76), nooit uit de body — dat contract moet ook in een test vastgelegd worden (op het niveau van de pure functie: de validator accepteert géén org-veld).
- Bestaand testmodel: `lib/v1/limits/__tests__/usage-limits.test.ts` (node:test + assert/strict op pure functies).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Unit-tests| `npm run test:unit` | groen, incl. 2 nieuwe testfiles |
| Build     | `.next/` weg, `npm run build` | exit 0 |

## Scope

**In scope**:
- Nieuw: `lib/v1/widget/__tests__/embed-token.test.ts`
- Nieuw: `lib/v1/widget/contact-validate.ts` (pure validator, geëxtraheerd) + `lib/v1/widget/__tests__/contact-validate.test.ts`
- `app/api/v1/contact-request/route.ts` (alleen: validatie-blok vervangen door aanroep van de validator; constanten mee-verhuizen)

**Out of scope**:
- `lib/v0/server/embed-token.ts` en de V0-contact-request-route — V0-pariteit is een optionele follow-up, geen onderdeel van dit plan
- De insert-/notificatie-/rate-limit-logica van de route (stappen 1-5 en 8+ in de handler)
- Elke gedragswijziging: de extractie moet byte-voor-byte dezelfde accept/reject-beslissingen nemen

## Git workflow

- Branch: `git checkout -b feat/seb/v1-pii-gate-tests`
- Commits: `test(v1): embed-token HMAC-assertieset` en `refactor(v1): contact-validatie als pure functie + tests`
- NIET pushen/PR openen tenzij de operator dat vraagt.

## Steps

### Step 1: Embed-token-test

Nieuw `lib/v1/widget/__tests__/embed-token.test.ts`, gemodelleerd op de V0-assertieset. Zet bovenaan in de testfile `process.env.EMBED_TOKEN_SECRET = 'test-secret-16chars-minimum';` — door ES-import-hoisting draait dat feitelijk ná de import, en dat is prima: `secret()` leest de env per aanroep (regel 19-25), er is dus GEEN dynamic-import-constructie nodig (de V0-modeltest doet exact hetzelfde). Cases:
1. round-trip: `verifyEmbedToken(createEmbedToken('acme'), 'acme')` → true
2. verkeerde slug → false
3. tampered signature (laatste char van het token muteren) → false
4. verlopen token (`createEmbedToken('acme', -10)`) → false
5. lege/onzin-input (`null`, `''`, `'geen-punt'`) → false
6. zonder secret: `delete process.env.EMBED_TOKEN_SECRET` in een subtest → `verifyEmbedToken` → false en `createEmbedToken` → throw; zet de env daarna terug. Werkt zonder module-herimport omdat `secret()` per call leest.

**Conditie-noot**: de module importeert `'server-only'` (regel 14). De runner uit plan 001 draait deze test daarom in de `react-server`-pass — dat is al geregeld, geen hatch nodig. Faalt de import tóch op condities: STOP en rapporteer (dan is de runner-partitie kapot, dat hoort bij plan 001).

**Verify**: `npm run test:unit` → embed-token-tests draaien en zijn groen.

### Step 2: Validator extraheren

Nieuw `lib/v1/widget/contact-validate.ts`: verplaats `NAME_MAX`, `SUBJECT_MAX`, `MESSAGE_MAX`, `PHONE_RE`, `EMAIL_RE`, de `str()`-helper en het hele blok stap 6+7 uit de route naar één pure functie:

```ts
export type ContactValidation =
  | { ok: true; value: { name: string; email: string | null; phone: string | null;
      preferredContact: 'call' | 'email'; subject: string | null; message: string | null } }
  | { ok: false; reason: 'honeypot' }   // route: stil 200
  | { ok: false; reason: 'invalid' };   // route: 400

export function validateContactBody(body: unknown): ContactValidation { ... }
```

Semantiek EXACT gelijk aan het excerpt in Current state (zelfde volgorde, zelfde trims/slices, zelfde wegfilter-regel voor het niet-voorkeursveld). De functie kent géén org/chatbot — die blijven server-bepaald in de route.

**Verify**: `npm run typecheck` exit 0.

### Step 3: Route omzetten

Vervang in `app/api/v1/contact-request/route.ts` het blok 104-142 door:

```ts
  const v = validateContactBody(body);
  if (!v.ok) {
    return v.reason === 'honeypot'
      ? NextResponse.json({ ok: true }, { status: 200 })
      : new NextResponse(null, { status: 400 });
  }
  const { name, email, phone, preferredContact, subject, message } = v.value;
```

en laat de insert (stap 8) de gedestructureerde waarden gebruiken. Geen andere regels aanraken.

**Verify**: `npm run typecheck` exit 0; `npm run build` exit 0.

### Step 4: Validator-tests

Nieuw `lib/v1/widget/__tests__/contact-validate.test.ts`, minimaal deze cases (alle uit het echte gedrag):
- happy path email / happy path call
- honeypot gevuld → `{ok:false, reason:'honeypot'}`
- `consentGiven` ontbreekt / `false` / `'true'` (string!) → invalid
- naam leeg of > NAME_MAX → invalid
- `preferredContact` ontbreekt of iets anders dan call/email → invalid
- preferred=call zonder/met ongeldig telefoonnummer → invalid; preferred=email idem voor e-mail
- ongeldig NIET-voorkeursveld wordt op `null` gefilterd terwijl de submit slaagt
- subject/message langer dan max → getrimd/afgekapt, niet geweigerd
- een `organizationId`/`org` veld in de body wordt genegeerd (bestaat niet in het resultaat) — legt het "org nooit uit de body"-contract vast

**Verify**: `npm run test:unit` groen; beide nieuwe files draaien mee.

## Test plan

Zie Steps 1 en 4 (dit plan ís het testplan). Regressiebewijs voor de route: `npm run build` + diff-review dat stap 6/7 semantisch 1:1 verhuisd is. Optionele e2e (alleen op verzoek operator, vereist dev-server + embed-token): POST met en zonder consent → 201/400.

## Done criteria

- [ ] `lib/v1/widget/__tests__/embed-token.test.ts` groen (≥5 cases)
- [ ] `lib/v1/widget/contact-validate.ts` bestaat; route gebruikt hem; geen inline PHONE_RE/EMAIL_RE/consent-check meer in de handler
- [ ] `lib/v1/widget/__tests__/contact-validate.test.ts` groen (≥10 cases)
- [ ] `npm run typecheck`, `npm run test:unit`, `npm run build` alle groen
- [ ] Diff-review: accept/reject-semantiek ongewijzigd
- [ ] Statusrij in `plans/README.md` bijgewerkt

## STOP conditions

- De route-code wijkt af van het Current-state-excerpt (drift) — vooral als er intussen al een validator of notificatielaag is toegevoegd.
- De `server-only`-escape-hatch breekt andere tests.
- Je betrapt jezelf op een "kleine verbetering" van de validatie-semantiek (bv. strengere e-mailregex) — niet doen; gedrag bevriezen is het doel. Verbeteringen apart voorstellen.

## Maintenance notes

- Toekomstige wijzigingen aan het contactformulier (extra velden) horen in `validateContactBody` + test, niet inline in de route.
- Als V0-pariteit gewenst is: zelfde extractie voor `app/api/v0/contact-request/route.ts`, maar let op gedragsverschillen tussen de twee routes — eerst diffen.
- Direction-bevinding "direction-01" (notificatiemail bij nieuwe leads) raakt deze route; wie dat bouwt profiteert van de dan al geteste validator.
