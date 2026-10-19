// Run: node --import tsx --test lib/notifications/__tests__/v1-contact-notify-failure.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyContactNotify } from '../v1-contact-notify-failure';

test('verzonden → geen melding', () => {
  assert.equal(classifyContactNotify({ ok: true, id: 'x' }, true), null);
  assert.equal(classifyContactNotify({ ok: true, id: null }, false), null);
});

test('geen meldingsadres → warning; onverwachte fout → error', () => {
  assert.deepEqual(classifyContactNotify('no_address', false), {
    code: 'V1_CONTACT_NOTIFY_NO_ADDRESS',
    reason: 'no_address',
    level: 'warning',
  });
  assert.deepEqual(classifyContactNotify('unexpected', true), {
    code: 'V1_CONTACT_NOTIFY_FAILED',
    reason: 'unexpected',
    level: 'error',
  });
});

test('overgeslagen (geen API-key) → alleen in productie melden', () => {
  const skipped = { ok: false as const, skipped: true as const, reason: 'no_api_key' };
  assert.equal(classifyContactNotify(skipped, false), null);
  assert.deepEqual(classifyContactNotify(skipped, true), {
    code: 'V1_CONTACT_NOTIFY_SKIPPED',
    reason: 'skipped_no_api_key',
    level: 'warning',
  });
});

test('Resend-fout → alleen de statuscode, nooit de detailtekst (kan e-mailadressen bevatten)', () => {
  const r = classifyContactNotify(
    { ok: false, skipped: false, error: 'resend 422: Invalid `to` field: bezoeker@example.com' },
    true,
  );
  assert.deepEqual(r, { code: 'V1_CONTACT_NOTIFY_FAILED', reason: 'resend_422', level: 'error' });
  assert.ok(!JSON.stringify(r).includes('@'));
});

test('timeout en overige netwerkfouten → vaste reden', () => {
  assert.equal(
    classifyContactNotify({ ok: false, skipped: false, error: 'The operation was aborted due to timeout' }, true)?.reason,
    'timeout',
  );
  const other = classifyContactNotify({ ok: false, skipped: false, error: 'fetch failed for jan@example.com' }, true);
  assert.equal(other?.reason, 'send_error');
  assert.ok(!JSON.stringify(other).includes('@'));
});

test('een vrije skipped-reden wordt een veilig token', () => {
  const r = classifyContactNotify({ ok: false, skipped: true, reason: 'Geen key voor a@b.nl!' }, true);
  assert.match(r?.reason ?? '', /^skipped_[a-z0-9_]+$/);
  assert.ok(!(r?.reason ?? '').includes('@'));
});
