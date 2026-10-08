import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage } from '../hard-eval-checks';

test('Nederlandse vragen met losse letters/korte woorden blijven nl', () => {
  for (const q of [
    'Is het goedkoper om twee keer pakket A te nemen of één keer pakket B? Dan heb ik allebei 20 lessen toch?',
    'Zit online theorie ook in pakket B?',
    'Mijn dochter is net 16. Mag ik mee bij de proefles?',
    'Hoeveel kost een dakreparatie en wanneer kunt u komen?',
  ]) assert.equal(detectLanguage(q), 'nl', q);
});
test('Engelse vragen blijven en', () => {
  for (const q of ['How much does a new roof cost and when can you come?', 'Do you offer lessons in English?']) assert.equal(detectLanguage(q), 'en', q);
});
