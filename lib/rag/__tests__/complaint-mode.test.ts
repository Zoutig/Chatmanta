import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isComplaint } from '../complaint-mode';
test('klachten herkend', () => {
  for (const q of ['Ik wil een klacht indienen over jullie monteur.', 'Na de reparatie lekt het dak weer, wie betaalt de schade die jullie hebben veroorzaakt?', 'Ik ben echt ontevreden over de behandeling', 'Jullie zijn onbereikbaar, al drie keer gebeld']) assert.ok(isComplaint([q]), q);
});
test('gewone vragen niet', () => {
  for (const q of ['Wat kost een dakinspectie?', 'Mijn dak is beschadigd na de storm. Kunnen jullie de garantie bekijken?', 'Dekt de verzekering stormschade aan een plat dak?', 'Hoe lang duurt een behandeling?', 'Wie is de eigenaar?']) assert.equal(isComplaint([q]), false, q);
});
