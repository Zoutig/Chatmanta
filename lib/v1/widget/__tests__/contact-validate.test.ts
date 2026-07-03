// Gedrag-bevriezende tests voor validateContactBody — de accept/reject-beslissingen
// die vroeger inline in app/api/v1/contact-request/route.ts stonden (stap 6+7).
// Pure functie → geen Next/DB. Run:
//   node --import tsx --test lib/v1/widget/__tests__/contact-validate.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateContactBody, NAME_MAX, SUBJECT_MAX, MESSAGE_MAX } from '../contact-validate';

// Geldige "voorkeur = e-mail"-basis; per test velden overschrijven.
function emailBody(over: Record<string, unknown> = {}) {
  return { name: 'Jan', preferredContact: 'email', email: 'jan@example.com', consentGiven: true, ...over };
}
function callBody(over: Record<string, unknown> = {}) {
  return { name: 'Jan', preferredContact: 'call', phone: '+31 6 12345678', consentGiven: true, ...over };
}

test('happy path e-mail → ok, phone null, org onbekend', () => {
  const v = validateContactBody(emailBody());
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.value.name, 'Jan');
  assert.equal(v.value.preferredContact, 'email');
  assert.equal(v.value.email, 'jan@example.com');
  assert.equal(v.value.phone, null);
});

test('happy path bellen → ok, email null', () => {
  const v = validateContactBody(callBody());
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.value.preferredContact, 'call');
  assert.equal(v.value.phone, '+31 6 12345678');
  assert.equal(v.value.email, null);
});

test('honeypot gevuld → reason honeypot (ook met verder geldige body)', () => {
  const v = validateContactBody(emailBody({ company_url: 'http://spam.example' }));
  assert.deepEqual(v, { ok: false, reason: 'honeypot' });
});

test('consent ontbreekt / false / string "true" → invalid', () => {
  assert.deepEqual(validateContactBody(emailBody({ consentGiven: undefined })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(emailBody({ consentGiven: false })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(emailBody({ consentGiven: 'true' })), { ok: false, reason: 'invalid' });
});

test('naam leeg of > NAME_MAX → invalid', () => {
  assert.deepEqual(validateContactBody(emailBody({ name: '   ' })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(emailBody({ name: 'x'.repeat(NAME_MAX + 1) })), { ok: false, reason: 'invalid' });
});

test('preferredContact ontbreekt of onbekend → invalid', () => {
  assert.deepEqual(validateContactBody(emailBody({ preferredContact: undefined })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(emailBody({ preferredContact: 'sms' })), { ok: false, reason: 'invalid' });
});

test('preferred=call zonder / met ongeldig telefoonnummer → invalid', () => {
  assert.deepEqual(validateContactBody(callBody({ phone: undefined })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(callBody({ phone: 'abc' })), { ok: false, reason: 'invalid' });
});

test('preferred=email zonder / met ongeldig e-mailadres → invalid', () => {
  assert.deepEqual(validateContactBody(emailBody({ email: undefined })), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateContactBody(emailBody({ email: 'geen-mail' })), { ok: false, reason: 'invalid' });
});

test('ongeldig NIET-voorkeursveld → weggefilterd op null, submit slaagt', () => {
  // preferred=email, geldige e-mail, maar een ongeldig telefoonnummer meegegeven.
  const ve = validateContactBody(emailBody({ phone: 'abc' }));
  assert.equal(ve.ok, true);
  if (ve.ok) assert.equal(ve.value.phone, null);
  // Spiegelbeeld: preferred=call, geldige telefoon, ongeldige e-mail.
  const vc = validateContactBody(callBody({ email: 'geen-mail' }));
  assert.equal(vc.ok, true);
  if (vc.ok) assert.equal(vc.value.email, null);
});

test('subject/message langer dan max → afgekapt, niet geweigerd', () => {
  const v = validateContactBody(
    emailBody({ subject: 's'.repeat(SUBJECT_MAX + 50), message: 'm'.repeat(MESSAGE_MAX + 50) }),
  );
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.value.subject?.length, SUBJECT_MAX);
  assert.equal(v.value.message?.length, MESSAGE_MAX);
});

test('org/organizationId in de body wordt genegeerd (nooit uit de body)', () => {
  const v = validateContactBody(emailBody({ organizationId: 'evil-org', org: 'evil', chatbotId: 'x' }));
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.deepEqual(
    Object.keys(v.value).sort(),
    ['email', 'message', 'name', 'phone', 'preferredContact', 'subject'],
  );
});
