import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectSmalltalk, smalltalkReply } from '../smalltalk-detect';

test('detectSmalltalk — hele-bericht begroeting/bedankje/afscheid', () => {
  for (const s of ['Hoi!', 'hallo', 'Goedemorgen', 'goedenavond 👋', 'Hey daar', 'Dag!']) {
    assert.equal(detectSmalltalk(s), 'greeting', s);
  }
  for (const s of ['Bedankt!', 'dank je wel', 'Dank u wel.', 'Top, bedankt!', 'Bedankt voor de hulp!', 'thanks']) {
    assert.equal(detectSmalltalk(s), 'thanks', s);
  }
  for (const s of ['Doei', 'Tot ziens!', 'Fijne dag nog']) {
    assert.equal(detectSmalltalk(s), 'bye', s);
  }
});

test('detectSmalltalk — vraag met begroeting of inhoud is géén smalltalk', () => {
  for (const s of [
    'Hoi, wat kost een plat dak?',
    'Hallo, zijn jullie op zondag open?',
    'Bedankt, en wat kost de bezorging?',
    'Wat zijn jullie openingstijden?',
    'dag tarief',
    'Hoe gaat het met de bestelling?',
    '',
  ]) {
    assert.equal(detectSmalltalk(s), null, s);
  }
});

test('smalltalkReply — u-vorm bij formal, persona-greeting bij informeel', () => {
  const p = { company: 'Acme', smalltalkGreeting: 'Hoi! Waarmee kan ik je helpen?' };
  assert.equal(smalltalkReply('greeting', 'neutral', p), p.smalltalkGreeting);
  assert.match(smalltalkReply('greeting', 'formal', p), /\bu\b/);
  assert.match(smalltalkReply('thanks', 'formal', p), /\bu\b/);
  assert.doesNotMatch(smalltalkReply('thanks', 'formal', p), /\bje\b/);
});
