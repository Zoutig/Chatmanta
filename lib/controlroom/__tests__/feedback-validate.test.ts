import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFeedbackForm, assertValidAttachment } from '@/lib/controlroom/feedback-validate';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const valid = {
  type: 'bug',
  urgency: 'high',
  description: 'De chatbot geeft een verkeerd antwoord op openingstijden.',
  name: 'Jan Jansen',
  email: 'jan@firma.nl',
  privacy: 'on',
};

test('parseFeedbackForm accepteert geldige input en normaliseert velden', () => {
  const out = parseFeedbackForm(form({ ...valid, name: '  Jan  ', email: 'jan@firma.nl', chatId: '', question: ' Wat? ' }));
  assert.equal(out.type, 'bug');
  assert.equal(out.urgency, 'high');
  assert.equal(out.submitterName, 'Jan'); // getrimd
  assert.equal(out.submitterEmail, 'jan@firma.nl');
  assert.equal(out.chatId, null); // leeg → null
  assert.equal(out.question, 'Wat?');
  assert.equal(out.privacyAccepted, true);
});

test('parseFeedbackForm weigert een onbekend type', () => {
  assert.throws(() => parseFeedbackForm(form({ ...valid, type: 'spam' })), /geldig type/i);
});

test('parseFeedbackForm accepteert het type "anders"', () => {
  const out = parseFeedbackForm(form({ ...valid, type: 'anders' }));
  assert.equal(out.type, 'anders');
});

test('parseFeedbackForm weigert een onbekende urgentie', () => {
  assert.throws(() => parseFeedbackForm(form({ ...valid, urgency: 'meteen' })), /urgentie/i);
});

test('parseFeedbackForm weigert een te korte beschrijving', () => {
  assert.throws(() => parseFeedbackForm(form({ ...valid, description: 'kort' })), /minstens/i);
});

test('parseFeedbackForm weigert een te lange beschrijving', () => {
  assert.throws(
    () => parseFeedbackForm(form({ ...valid, description: 'x'.repeat(8001) })),
    /maximaal/i,
  );
});

test('parseFeedbackForm weigert een ontbrekende naam', () => {
  const fd = form({ ...valid });
  fd.delete('name');
  assert.throws(() => parseFeedbackForm(fd), /naam/i);
});

test('parseFeedbackForm weigert een lege naam', () => {
  assert.throws(() => parseFeedbackForm(form({ ...valid, name: '   ' })), /naam/i);
});

test('parseFeedbackForm weigert een ontbrekend e-mailadres', () => {
  const fd = form({ ...valid });
  fd.delete('email');
  assert.throws(() => parseFeedbackForm(fd), /e-mailadres/i);
});

test('parseFeedbackForm weigert een ongeldig e-mailadres', () => {
  assert.throws(() => parseFeedbackForm(form({ ...valid, email: 'geen-email' })), /e-mailadres/i);
});

test('parseFeedbackForm weigert wanneer de privacy-checkbox niet aan staat', () => {
  const fd = form(valid);
  fd.delete('privacy');
  assert.throws(() => parseFeedbackForm(fd), /privacyverklaring/i);
});

// assertValidAttachment — duck-typed File (size/name/type) om geen 10MB te alloceren.
function fakeFile(size: number, name: string, type: string): File {
  return { size, name, type } as unknown as File;
}

test('assertValidAttachment accepteert een geldig klein bestand', () => {
  assert.doesNotThrow(() => assertValidAttachment(fakeFile(1024, 'screenshot.png', 'image/png')));
  assert.doesNotThrow(() => assertValidAttachment(fakeFile(2048, 'rapport.pdf', 'application/pdf')));
});

test('assertValidAttachment weigert een te groot bestand', () => {
  assert.throws(() => assertValidAttachment(fakeFile(11 * 1024 * 1024, 'groot.png', 'image/png')), /10 MB/);
});

test('assertValidAttachment weigert een verkeerd bestandstype', () => {
  assert.throws(() => assertValidAttachment(fakeFile(1024, 'virus.exe', 'application/octet-stream')), /toegestaan/i);
  assert.throws(() => assertValidAttachment(fakeFile(1024, 'data.csv', 'text/csv')), /toegestaan/i);
});
