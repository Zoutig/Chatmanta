// Unit-test voor de upload-padcontrole (security-audit 2026-10, #9).
// Run: node --import tsx --test lib/v1/documents/__tests__/upload-path.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isOwnUploadPath } from '../upload-path';

const ORG = '11111111-1111-4111-8111-111111111111';
const BOT = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG = '33333333-3333-4333-8333-333333333333';
const FILE_UUID = '44444444-4444-4444-8444-444444444444';

test('server-gegenereerd pad wordt geaccepteerd', () => {
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/${FILE_UUID}-prijslijst_2026.pdf`, ORG, BOT), true);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/${FILE_UUID}-a..b.pdf`, ORG, BOT), true);
});

test('../ naar een andere org wordt geweigerd', () => {
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/../../${OTHER_ORG}/x/${FILE_UUID}-a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/../../../v1-feedback-attachments/${ORG}/a.png`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/${FILE_UUID}-a.pdf/../../x`, ORG, BOT), false);
});

test('URL-gecodeerde traversal (%2e%2e) en backslashes worden geweigerd', () => {
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/%2e%2e/%2e%2e/${OTHER_ORG}/${FILE_UUID}-a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/${FILE_UUID}-%2e%2e%2fa.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/..\\..\\${FILE_UUID}-a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/${FILE_UUID}-a\\..\\b.pdf`, ORG, BOT), false);
});

test('ander formaat (geen uuid, extra map, andere chatbot, leeg) wordt geweigerd', () => {
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${BOT}/sub/${FILE_UUID}-a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath(`${ORG}/${OTHER_ORG}/${FILE_UUID}-a.pdf`, ORG, BOT), false);
  assert.equal(isOwnUploadPath('', ORG, BOT), false);
  assert.equal(isOwnUploadPath(undefined, ORG, BOT), false);
});
