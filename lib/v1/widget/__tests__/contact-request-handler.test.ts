// Run: node --import tsx --test lib/v1/widget/__tests__/contact-request-handler.test.ts
// Route-logica van POST /api/v1/contact-request met gemockte deps: geen database,
// geen Redis, geen mail. Token-check en org-lookup zijn nep maar volgen de echte
// regels (token hoort bij precies één slug; org komt uit de slug, niet uit de body).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleV1ContactRequest,
  type ContactNotifyArgs,
  type ContactRequestDeps,
  type ContactRequestRow,
} from '../contact-request-handler';

const ORG_A = { id: 'org-a-id', name: 'Testklant A', slug: 'testklant-a' };
const ORG_B = { id: 'org-b-id', name: 'Testklant B', slug: 'testklant-b' };
const ORGS = [ORG_A, ORG_B];

// Nep-token: "tok:<slug>" is alleen geldig voor die slug.
const tokenFor = (slug: string) => `tok:${slug}`;

const VALID = {
  name: 'Jan Jansen',
  email: 'jan@example.com',
  phone: null,
  preferredContact: 'email',
  subject: 'Wat kost een offerte?',
  message: 'Graag terugmailen.',
  consentGiven: true,
  company_url: '',
};

function makeDeps(over: { enabled?: boolean; ipAllowed?: boolean; orgAllowed?: boolean; insertError?: boolean; sameOrigin?: boolean } = {}) {
  const inserted: ContactRequestRow[] = [];
  const notified: ContactNotifyArgs[] = [];
  const logs: string[] = [];
  const settingsReadFor: string[] = [];
  const deps: ContactRequestDeps = {
    ipLimiter: {
      async check() {
        return over.ipAllowed === false ? { allowed: false, retryAfterSec: 7 } : { allowed: true, retryAfterSec: 0 };
      },
    },
    orgLimiter: {
      async check() {
        return over.orgAllowed === false ? { allowed: false, retryAfterSec: 9 } : { allowed: true, retryAfterSec: 0 };
      },
    },
    clientIp: () => '203.0.113.1',
    sameOrigin: () => over.sameOrigin !== false,
    verifyToken: (token, slug) => token === tokenFor(slug),
    findOrg: async (slug) => {
      const o = ORGS.find((x) => x.slug === slug);
      return o ? { id: o.id, name: o.name } : null;
    },
    getChatbot: async (orgId) => ({ id: `bot-of-${orgId}` }),
    getSettings: async (chatbotId) => {
      settingsReadFor.push(chatbotId);
      return { contactRequestsEnabled: over.enabled ?? true, notificationEmail: 'meldingen@example.com' };
    },
    insert: async (row) => {
      if (over.insertError) return { error: { code: '23514', message: 'check violation' } };
      inserted.push(row);
      return { error: null };
    },
    scheduleNotify: (args) => {
      notified.push(args);
    },
    logError: (msg, detail) => logs.push(`${msg} ${detail ?? ''}`),
  };
  return { deps, inserted, notified, logs, settingsReadFor };
}

function req(body: unknown, opts: { slug?: string | null; token?: string | null } = {}) {
  const slug = opts.slug === undefined ? ORG_A.slug : opts.slug;
  const url = slug === null ? 'https://www.chatmanta.nl/api/v1/contact-request' : `https://www.chatmanta.nl/api/v1/contact-request?org=${slug}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts.token === undefined ? (slug ? tokenFor(slug) : null) : opts.token;
  if (token) headers['x-chatmanta-embed'] = token;
  return new Request(url, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('happy path: 201, één rij met org+chatbot uit de token-slug, notificatie ingepland', async () => {
  const { deps, inserted, notified } = makeDeps();
  const r = await handleV1ContactRequest(req(VALID), deps);
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].organization_id, ORG_A.id);
  assert.equal(inserted[0].chatbot_id, `bot-of-${ORG_A.id}`);
  assert.equal(inserted[0].consent_given, true);
  assert.equal(inserted[0].status, 'new');
  assert.equal(inserted[0].subject, 'Wat kost een offerte?');
  assert.equal(notified.length, 1);
  assert.equal(notified[0].organizationId, ORG_A.id);
  assert.equal(notified[0].orgName, ORG_A.name);
  assert.equal(notified[0].notificationEmail, 'meldingen@example.com');
});

test('flag uit → 403, geen rij, geen mail', async () => {
  const { deps, inserted, notified } = makeDeps({ enabled: false });
  const r = await handleV1ContactRequest(req(VALID), deps);
  assert.equal(r.status, 403);
  assert.equal(inserted.length, 0);
  assert.equal(notified.length, 0);
});

test('settings-read faalt → fail-closed 403', async () => {
  const { deps, inserted } = makeDeps();
  deps.getSettings = async () => {
    throw new Error('db weg');
  };
  assert.equal((await handleV1ContactRequest(req(VALID), deps)).status, 403);
  assert.equal(inserted.length, 0);
});

test('token van org A gebruikt voor slug van org B → 401, org B wordt niet geraakt', async () => {
  const { deps, inserted, settingsReadFor } = makeDeps();
  const r = await handleV1ContactRequest(req(VALID, { slug: ORG_B.slug, token: tokenFor(ORG_A.slug) }), deps);
  assert.equal(r.status, 401);
  assert.equal(inserted.length, 0);
  assert.equal(settingsReadFor.length, 0);
});

test('geen token, geen slug of verkeerde origin → 401', async () => {
  const { deps, inserted } = makeDeps();
  assert.equal((await handleV1ContactRequest(req(VALID, { token: null }), deps)).status, 401);
  assert.equal((await handleV1ContactRequest(req(VALID, { slug: null, token: tokenFor(ORG_A.slug) }), deps)).status, 401);
  const cross = makeDeps({ sameOrigin: false });
  assert.equal((await handleV1ContactRequest(req(VALID), cross.deps)).status, 401);
  assert.equal(inserted.length + cross.inserted.length, 0);
});

test('onbekende (of verwijderde) org met geldig token → 401', async () => {
  const { deps, inserted } = makeDeps();
  assert.equal((await handleV1ContactRequest(req(VALID, { slug: 'bestaat-niet' }), deps)).status, 401);
  assert.equal(inserted.length, 0);
});

test('org-id in de body wordt genegeerd: de rij hoort bij de token-org', async () => {
  const { deps, inserted } = makeDeps();
  const r = await handleV1ContactRequest(
    req({ ...VALID, organization_id: ORG_B.id, organizationId: ORG_B.id, chatbot_id: 'bot-of-org-b-id' }),
    deps,
  );
  assert.equal(r.status, 201);
  assert.equal(inserted[0].organization_id, ORG_A.id);
  assert.equal(inserted[0].chatbot_id, `bot-of-${ORG_A.id}`);
});

test('zonder consent (ontbrekend, false of "true"-string) → 400, geen rij', async () => {
  const { deps, inserted, notified } = makeDeps();
  const { consentGiven: _omit, ...noConsent } = VALID;
  void _omit;
  for (const body of [noConsent, { ...VALID, consentGiven: false }, { ...VALID, consentGiven: 'true' }]) {
    assert.equal((await handleV1ContactRequest(req(body), deps)).status, 400);
  }
  assert.equal(inserted.length, 0);
  assert.equal(notified.length, 0);
});

test('honeypot gevuld → stil 200 {ok:true}, geen rij, geen mail', async () => {
  const { deps, inserted, notified } = makeDeps();
  const r = await handleV1ContactRequest(req({ ...VALID, company_url: 'https://spam.example' }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(inserted.length, 0);
  assert.equal(notified.length, 0);
});

test('kapotte JSON → 400', async () => {
  const { deps, inserted } = makeDeps();
  assert.equal((await handleV1ContactRequest(req('{kapot'), deps)).status, 400);
  assert.equal(inserted.length, 0);
});

test('rate-limits → 429 met Retry-After, vóór enige DB-read', async () => {
  const ip = makeDeps({ ipAllowed: false });
  let orgLookups = 0;
  ip.deps.findOrg = async () => {
    orgLookups++;
    return null;
  };
  const r1 = await handleV1ContactRequest(req(VALID), ip.deps);
  assert.equal(r1.status, 429);
  assert.equal(r1.headers?.['Retry-After'], '7');
  assert.equal(orgLookups, 0);

  const org = makeDeps({ orgAllowed: false });
  const r2 = await handleV1ContactRequest(req(VALID), org.deps);
  assert.equal(r2.status, 429);
  assert.equal(r2.headers?.['Retry-After'], '9');
  assert.equal(org.inserted.length, 0);
});

test('geen chatbot (of fout bij ophalen) → 404', async () => {
  const { deps } = makeDeps();
  deps.getChatbot = async () => null;
  assert.equal((await handleV1ContactRequest(req(VALID), deps)).status, 404);
  deps.getChatbot = async () => {
    throw new Error('db weg');
  };
  assert.equal((await handleV1ContactRequest(req(VALID), deps)).status, 404);
});

test('insert-fout → 500, geen mail, log zonder PII', async () => {
  const { deps, notified, logs } = makeDeps({ insertError: true });
  const r = await handleV1ContactRequest(req(VALID), deps);
  assert.equal(r.status, 500);
  assert.equal(notified.length, 0);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('jan@example.com'));
  assert.ok(!logs[0].includes('Jan Jansen'));
});
