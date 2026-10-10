import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HONEYPOT_FIELD,
  MESSAGES,
  buildLeadConfirmationEmail,
  buildLeadNotificationEmail,
  fallbackMailto,
  normalizeWebsite,
  parseBron,
  parsePakket,
  validateKennismaking,
} from '../kennismaking';
import { handleKennismaking, type KennismakingDeps, type SendResult } from '../kennismaking-handler';

const VALID = {
  naam: 'Anna de Vries',
  bedrijf: 'Fietsenmaker Van Dam',
  website: 'vandam.nl',
  email: 'anna@vandam.nl',
  telefoon: '',
  pakket: 'groei',
  bericht: '',
  toestemming: true,
};

// ---------- Validatie ----------

test('geldige aanvraag → genormaliseerde data, lege optionele velden = null', () => {
  const r = validateKennismaking(VALID);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.website, 'https://vandam.nl');
  assert.equal(r.data.pakket, 'groei');
  assert.equal(r.data.telefoon, null);
  assert.equal(r.data.bericht, null);
  assert.equal(r.data.bron, null);
});

test('lege body → alle verplichte velden met de letterlijke copy-foutteksten', () => {
  const r = validateKennismaking({});
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors.naam, 'Vul je naam in.');
  assert.equal(r.errors.email, 'Vul een geldig e-mailadres in.');
  assert.equal(r.errors.website, 'Vul je website in, bijvoorbeeld bedrijf.nl.');
  assert.equal(r.errors.toestemming, 'Vink aan dat we je gegevens mogen gebruiken om contact op te nemen.');
  assert.equal(r.errors.bedrijf, MESSAGES.bedrijf);
  assert.equal(r.errors.telefoon, undefined);
  assert.equal(r.errors.bericht, undefined);
});

test('toestemming moet strikt true zijn (geen "true"-string)', () => {
  const r = validateKennismaking({ ...VALID, toestemming: 'true' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.toestemming);
});

test('e-mail: ongeldige vormen worden geweigerd', () => {
  for (const email of ['anna', 'anna@', 'anna@vandam', 'an na@vandam.nl', 'a@b.c', '<x>@y.nl', 'jan@bedrijf..nl', 'x@-foo.nl', 'x@foo-.nl', 'jan..de@vries.nl', '.jan@vries.nl']) {
    const r = validateKennismaking({ ...VALID, email });
    assert.equal(r.ok, false, email);
  }
});

test('website: varianten normaliseren, rommel weigeren', () => {
  assert.equal(normalizeWebsite('bedrijf.nl'), 'https://bedrijf.nl');
  assert.equal(normalizeWebsite('https://www.bedrijf.nl/'), 'https://www.bedrijf.nl');
  assert.equal(normalizeWebsite('http://bedrijf.nl/contact'), 'http://bedrijf.nl/contact');
  assert.equal(normalizeWebsite(' Bedrijf.NL '), 'https://bedrijf.nl');
  for (const bad of ['', 'bedrijf', 'javascript:alert(1)', 'ftp://bedrijf.nl', 'bedrijf .nl', 'https://user:pw@bedrijf.nl', 'localhost']) {
    assert.equal(normalizeWebsite(bad), null, bad);
  }
});

test('telefoon optioneel, maar als ingevuld moet het een nummer zijn', () => {
  assert.equal(validateKennismaking({ ...VALID, telefoon: '06 12345678' }).ok, true);
  assert.equal(validateKennismaking({ ...VALID, telefoon: '+31 (0)20-123 4567' }).ok, true);
  const r = validateKennismaking({ ...VALID, telefoon: 'bel me maar' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.telefoon, MESSAGES.telefoon);
});

test('lengtelimieten en regeleinden in éénregelige velden', () => {
  assert.equal(validateKennismaking({ ...VALID, naam: 'a'.repeat(101) }).ok, false);
  assert.equal(validateKennismaking({ ...VALID, bericht: 'x'.repeat(2001) }).ok, false);
  assert.equal(validateKennismaking({ ...VALID, bericht: 'x'.repeat(2000) }).ok, true);
  // Witruimte (incl. newline) wordt samengevouwen: geen header-/opmaakinjectie via naam.
  const r = validateKennismaking({ ...VALID, naam: 'Anna\nBcc: x@y.nl' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.naam.includes('\n'), false);
});

test('?pakket= en ?bron= parsing', () => {
  assert.equal(parsePakket('groei'), 'groei');
  assert.equal(parsePakket('COMPLEET'), 'compleet');
  assert.equal(parsePakket(['start', 'groei']), 'start');
  assert.equal(parsePakket('enterprise'), 'onbekend');
  assert.equal(parsePakket(undefined), 'onbekend');
  assert.equal(parseBron('rekenhulp'), 'rekenhulp');
  assert.equal(parseBron('<script>'), null);
  assert.equal(parseBron(undefined), null);
  // Onbekend pakket in de body is nooit een fout.
  const r = validateKennismaking({ ...VALID, pakket: 'xxl' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.pakket, 'onbekend');
});

test('mailto-fallback heeft het vooringevulde onderwerp', () => {
  assert.equal(fallbackMailto(), 'mailto:info@chatmanta.com?subject=Kennismaking%20ChatManta');
});

// ---------- E-mails ----------

test('notificatie escapet HTML; bevestiging bevat géén vrije tekst behalve de naam', () => {
  const r = validateKennismaking({ ...VALID, naam: 'Anna <b>x</b>', bericht: 'Koop nu <a href="http://spam">hier</a>' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const note = buildLeadNotificationEmail(r.data);
  assert.ok(!note.html.includes('<b>x</b>'));
  assert.ok(note.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(note.text.includes('Koop nu'));
  const conf = buildLeadConfirmationEmail(r.data, { replyTo: 'info@chatmanta.com', demoUrl: 'https://www.chatmanta.nl/voorbeeld' });
  assert.ok(!conf.html.includes('spam') && !conf.text.includes('spam'));
  assert.ok(!conf.html.includes('<b>x</b>'));
});

test('bevestiging noemt een link-achtige naam niet (geen merk-phishing-relay)', () => {
  for (const naam of ['Ga naar evil-site.nl', 'www.x.nl', 'http://x', 'a@b.nl']) {
    const r = validateKennismaking({ ...VALID, naam });
    assert.equal(r.ok, true, naam);
    if (!r.ok) continue;
    const conf = buildLeadConfirmationEmail(r.data, { replyTo: 'info@chatmanta.com', demoUrl: 'https://www.chatmanta.nl/voorbeeld' });
    assert.ok(conf.text.startsWith('Hoi,\n'), naam);
    assert.ok(!conf.html.includes(naam), naam);
  }
  const ok = validateKennismaking(VALID);
  if (ok.ok) {
    const conf = buildLeadConfirmationEmail(ok.data, { replyTo: 'info@chatmanta.com', demoUrl: 'https://www.chatmanta.nl/voorbeeld' });
    assert.ok(conf.text.startsWith('Hoi Anna de Vries,'));
  }
});

// ---------- Handler (Resend + ratelimit gemockt; er gaat nooit een echte mail uit) ----------

type Sent = { to: string; subject: string; replyTo?: string };

function makeDeps(over: Partial<KennismakingDeps> & { sendResults?: SendResult[]; allowed?: boolean } = {}) {
  const sent: Sent[] = [];
  const errors: string[] = [];
  const limiterKeys: string[] = [];
  const results = over.sendResults ?? [];
  const deps: KennismakingDeps = {
    limiter: {
      async check(key) {
        limiterKeys.push(key);
        return over.allowed === false ? { allowed: false, retryAfterSec: 42 } : { allowed: true, retryAfterSec: 0 };
      },
    },
    send: async (msg) => {
      sent.push({ to: msg.to, subject: msg.subject, replyTo: msg.replyTo });
      return results.shift() ?? { ok: true, id: 'test' };
    },
    reportError: (code, detail) => errors.push(`${code}|${detail ?? ''}`),
    leadsTo: 'info@chatmanta.com',
    fromConfigured: true,
    demoUrl: 'https://www.chatmanta.nl/voorbeeld',
    ...over,
  };
  return { deps, sent, errors, limiterKeys };
}

const req = (body: unknown, extra: Partial<{ host: string | null; origin: string | null; bodyText: string }> = {}) => ({
  ipKey: 'lead:abc',
  host: 'www.chatmanta.nl',
  origin: 'https://www.chatmanta.nl',
  bodyText: typeof body === 'string' ? body : JSON.stringify(body),
  ...extra,
});

test('happy path: notificatie naar info@ (Reply-To = aanvrager) + bevestiging naar aanvrager', async () => {
  const { deps, sent, errors } = makeDeps();
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, confirmationSent: true });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, 'info@chatmanta.com');
  assert.equal(sent[0].replyTo, 'anna@vandam.nl');
  assert.equal(sent[1].to, 'anna@vandam.nl');
  assert.equal(sent[1].replyTo, 'info@chatmanta.com');
  assert.deepEqual(errors, []);
});

test('honeypot gevuld → stil 200, geen mail', async () => {
  const { deps, sent } = makeDeps();
  const r = await handleKennismaking(req({ ...VALID, [HONEYPOT_FIELD]: 'http://spam.example' }), deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(sent.length, 0);
});

test('honeypot gaat vóór validatie: bot met lege velden krijgt ook stil 200', async () => {
  const { deps, sent } = makeDeps();
  const r = await handleKennismaking(req({ [HONEYPOT_FIELD]: 'x' }), deps);
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0);
});

test('rate-limit → 429 met Retry-After, geen mail, body wordt niet eens bekeken', async () => {
  const { deps, sent, limiterKeys } = makeDeps({ allowed: false });
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 429);
  assert.deepEqual(r.body, { ok: false, error: 'rate_limit', retryAfterSec: 42 });
  assert.equal(r.headers?.['Retry-After'], '42');
  assert.deepEqual(limiterKeys, ['lead:abc']);
  assert.equal(sent.length, 0);
});

test('validatiefout → 400 met veldfouten, geen mail', async () => {
  const { deps, sent } = makeDeps();
  const r = await handleKennismaking(req({ ...VALID, email: 'nope' }), deps);
  assert.equal(r.status, 400);
  assert.equal(r.body.ok, false);
  if (!r.body.ok && r.body.error === 'validation') assert.equal(r.body.fields.email, MESSAGES.email);
  else assert.fail('verwacht validation');
  assert.equal(sent.length, 0);
});

test('andere origin of geen origin → 403, limiter niet geraakt', async () => {
  for (const origin of ['https://evil.example', null, 'not a url']) {
    const { deps, sent, limiterKeys } = makeDeps();
    const r = await handleKennismaking(req(VALID, { origin }), deps);
    assert.equal(r.status, 403, String(origin));
    assert.equal(sent.length, 0);
    assert.equal(limiterKeys.length, 0);
  }
});

test('kapotte JSON, array-body of te grote body → nette 4xx', async () => {
  const { deps, sent } = makeDeps();
  assert.equal((await handleKennismaking(req('{nope'), deps)).status, 400);
  assert.equal((await handleKennismaking(req('[1,2]'), deps)).status, 400);
  assert.equal((await handleKennismaking(req({ ...VALID, bericht: 'x'.repeat(20_000) }), deps)).status, 413);
  assert.equal(sent.length, 0);
});

test('Resend-fout op de notificatie → 502 send_failed + fout gemeld, geen bevestiging', async () => {
  const { deps, sent, errors } = makeDeps({ sendResults: [{ ok: false, skipped: false, error: 'resend 500: boom' }] });
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 502);
  assert.deepEqual(r.body, { ok: false, error: 'send_failed' });
  assert.equal(sent.length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith('SITE_LEAD_NOTIFY_FAILED'));
});

test('geen RESEND_API_KEY (skipped) telt als fout: de lead mag niet stil verdwijnen', async () => {
  const { deps } = makeDeps({ sendResults: [{ ok: false, skipped: true, reason: 'no_api_key' }] });
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 502);
});

test('RESEND_FROM ontbreekt → fail-closed vóór verzendpoging', async () => {
  const { deps, sent, errors } = makeDeps({ fromConfigured: false });
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 502);
  assert.equal(sent.length, 0);
  assert.ok(errors[0].startsWith('SITE_LEAD_NO_FROM'));
});

test('bevestiging mislukt maar notificatie gelukt → 200 met confirmationSent=false', async () => {
  const { deps, errors } = makeDeps({
    sendResults: [{ ok: true, id: 'n' }, { ok: false, skipped: false, error: 'resend 422' }],
  });
  const r = await handleKennismaking(req(VALID), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, confirmationSent: false });
  assert.ok(errors[0].startsWith('SITE_LEAD_CONFIRM_FAILED'));
});

test('foutmeldingen aan reportError bevatten geen PII uit het formulier', async () => {
  const { deps, errors } = makeDeps({ sendResults: [{ ok: false, skipped: false, error: 'resend 500' }] });
  await handleKennismaking(req(VALID), deps);
  const joined = errors.join(' ');
  for (const pii of [VALID.naam, VALID.email, VALID.bedrijf, 'vandam.nl']) assert.ok(!joined.includes(pii), pii);
});
