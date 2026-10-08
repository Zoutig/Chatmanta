import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_MESSAGE,
  resolveFallbackMessage,
  offTopicRefusal,
  offDomainCodeRefusal,
  containsPlaceholder,
} from '../fixed-texts';

test('fallback: formal krijgt u-vorm, overige tonen je-vorm', () => {
  assert.match(resolveFallbackMessage(undefined, 'formal'), /Stelt u uw vraag/);
  for (const t of ['neutral', 'casual', 'persoonlijk'] as const) assert.equal(resolveFallbackMessage(undefined, t), FALLBACK_MESSAGE);
});
test('fallback: lege of default-override telt als niet aangepast', () => {
  assert.match(resolveFallbackMessage('', 'formal'), /Stelt u/);
  assert.match(resolveFallbackMessage(FALLBACK_MESSAGE, 'formal'), /Stelt u/);
});
test('fallback: eigen klant-tekst wint altijd', () => {
  assert.equal(resolveFallbackMessage('Bel ons even!', 'formal'), 'Bel ons even!');
});
test('off-topic en code-weigering volgen de toon', () => {
  assert.match(offTopicRefusal('daken', 'formal'), /Wat wilt u weten\?$/);
  assert.match(offTopicRefusal('daken', 'neutral'), /Wat wil je weten\?$/);
  assert.match(offDomainCodeRefusal('daken', 'formal'), /kan ik u/);
  assert.doesNotMatch(offDomainCodeRefusal('daken', 'formal'), /\bje\b/);
});
test('placeholder-detectie', () => {
  for (const s of ['De leiding ligt bij <PRIVATE_PERSON>.', 'Bel <PHONE_NUMBER>', '<NAME>']) assert.ok(containsPlaceholder(s), s);
  for (const s of ['Dit is <strong>belangrijk</strong>', 'als a < b en c > d', 'Bel 06-12345678', '<A>', '<br>']) assert.equal(containsPlaceholder(s), false, s);
});
