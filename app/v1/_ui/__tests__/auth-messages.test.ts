// Run: node --import tsx --test app/v1/_ui/__tests__/auth-messages.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../auth-messages';

test('bekende Supabase-meldingen worden Nederlands', () => {
  assert.equal(authErrorMessage('Invalid login credentials'), 'E-mailadres of wachtwoord klopt niet.');
  assert.equal(
    authErrorMessage('Email not confirmed'),
    'Je e-mailadres is nog niet bevestigd. Kijk in je inbox.',
  );
});

test('rate-limit-varianten', () => {
  assert.equal(
    authErrorMessage('email rate limit exceeded'),
    'Te veel pogingen. Wacht even en probeer het opnieuw.',
  );
  assert.equal(
    authErrorMessage('Too many requests'),
    'Te veel pogingen. Wacht even en probeer het opnieuw.',
  );
});

test('verlopen sessie bij wachtwoord zetten', () => {
  assert.equal(
    authErrorMessage('Auth session missing!'),
    'Je link is verlopen. Vraag een nieuwe link aan.',
  );
});

test('zelfde wachtwoord als het oude', () => {
  assert.equal(
    authErrorMessage('New password should be different from the old password.'),
    'Kies een ander wachtwoord dan je huidige.',
  );
});

test('onbekende melding blijft ongewijzigd', () => {
  assert.equal(authErrorMessage('Iets heel anders'), 'Iets heel anders');
});
