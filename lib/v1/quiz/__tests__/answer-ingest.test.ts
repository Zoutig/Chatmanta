import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answersMissingIngest, INGEST_GRACE_MS, quizIngestInput, sanitizeQuizAnswer } from '../answer-ingest';

test('sanitizeQuizAnswer — zakelijke e-mail, telefoon en website blijven staan', () => {
  const t = 'Bel 020-1234567 of 06 12345678, mail info@voorbeeld.nl of kijk op www.voorbeeld.nl';
  assert.deepEqual(sanitizeQuizAnswer(t), { text: t, redacted: false });
});

test('sanitizeQuizAnswer — IBAN en BSN worden gemaskeerd', () => {
  const r = sanitizeQuizAnswer('Betaal op NL91ABNA0417164300, bsn 123456782');
  assert.equal(r.text, 'Betaal op [iban], bsn [bsn]');
  assert.equal(r.redacted, true);
});

test('sanitizeQuizAnswer — internationaal mobiel nummer is geen BSN', () => {
  const t = 'Bel +31 612345678';
  assert.equal(sanitizeQuizAnswer(t).text, t);
});

test('quizIngestInput — bestandsnaam, tekst en herkomst', () => {
  const r = quizIngestInput(
    { id: 'q1', vraag: 'Hoe bereik ik jullie?', categorie: 'contact', categorieLabel: 'Contactgegevens' },
    'quiz1',
    'Bel 020-1234567',
  );
  assert.equal(r.filename, 'Quiz-antwoord · Contactgegevens');
  assert.equal(r.text, 'Vraag: Hoe bereik ik jullie?\nAntwoord: Bel 020-1234567');
  assert.equal(r.metadata.origin, 'quiz');
  assert.equal(r.metadata.question_id, 'q1');
  const noLabel = quizIngestInput({ id: 'q', vraag: 'v', categorie: 'prijzen', categorieLabel: null }, 'z', 'a');
  assert.equal(noLabel.filename, 'Quiz-antwoord · prijzen');
});

test('answersMissingIngest — alleen ingevulde antwoorden zonder document, met grace-periode', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const old = new Date(now - INGEST_GRACE_MS - 1000).toISOString();
  const fresh = new Date(now - 10_000).toISOString();
  const answers = [
    { id: 'a', antwoord: 'x', ingestedDocumentId: null, createdAt: old },
    { id: 'b', antwoord: 'x', ingestedDocumentId: 'doc', createdAt: old },
    { id: 'c', antwoord: null, ingestedDocumentId: null, createdAt: old }, // overgeslagen vraag
    { id: 'd', antwoord: '  ', ingestedDocumentId: null, createdAt: old },
    { id: 'e', antwoord: 'x', ingestedDocumentId: null, createdAt: fresh },
  ];
  assert.deepEqual(answersMissingIngest(answers, now).map((a) => a.id), ['a']);
  assert.deepEqual(answersMissingIngest(answers).map((a) => a.id), ['a', 'e']);
});
