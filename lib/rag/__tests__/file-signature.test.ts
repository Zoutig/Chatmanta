import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMagicBytes } from '../file-signature';

test('pdf: correcte %PDF-header → true', () => {
  assert.equal(verifyMagicBytes(Buffer.from('%PDF-1.7\nrest'), 'pdf'), true);
});

test('pdf: verkeerde header (zip) → false', () => {
  assert.equal(verifyMagicBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'pdf'), false);
});

test('docx: PK-zip-header → true', () => {
  assert.equal(verifyMagicBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), 'docx'), true);
});

test('docx: niet-zip (pdf-header) → false', () => {
  assert.equal(verifyMagicBytes(Buffer.from('%PDF'), 'docx'), false);
});

test('txt/md: altijd accepteren (geen signature)', () => {
  assert.equal(verifyMagicBytes(Buffer.from('willekeurige tekst'), 'txt'), true);
  assert.equal(verifyMagicBytes(Buffer.from([0x00, 0x01, 0x02]), 'md'), true);
});

test('te kort → false (geen out-of-bounds)', () => {
  assert.equal(verifyMagicBytes(Buffer.from([0x25]), 'pdf'), false);
  assert.equal(verifyMagicBytes(Buffer.alloc(0), 'docx'), false);
});
