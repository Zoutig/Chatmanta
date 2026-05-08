// Diagnose .env.local zonder waardes te onthullen.
// Print alleen structuur-info: regelnummer, key, waarde-lengte, en flags voor verdachte tekens.
// Run: node scripts/diagnose-env.mjs

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve('.env.local');
if (!existsSync(path)) {
  console.log('.env.local niet gevonden in', process.cwd());
  process.exit(1);
}

const raw = readFileSync(path, 'utf8');
const totalBytes = Buffer.byteLength(raw, 'utf8');
const hasCRLF = raw.includes('\r\n');
const hasLoneCR = /\r(?!\n)/.test(raw);
const hasBOM = raw.charCodeAt(0) === 0xFEFF;

console.log(`File: .env.local (${totalBytes} bytes)`);
console.log(`Newlines: ${hasCRLF ? 'CRLF' : 'LF'}, lone CRs: ${hasLoneCR}, BOM: ${hasBOM}`);
console.log('');

const lines = raw.split(/\r?\n/);
console.log(`Lines: ${lines.length}`);
console.log('');
console.log('Per non-comment line:');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.length === 0) continue;
  if (line.trimStart().startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 0) {
    console.log(`  Line ${i + 1}: NO '=' SIGN — likely a wrapped/broken value, length ${line.length}`);
    continue;
  }
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1);
  const hasLeadingWS = value !== value.trimStart();
  const hasTrailingWS = value !== value.trimEnd();
  const hasQuotes = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  const hasInternalSpace = / /.test(value.trim());
  const hasInternalNewlineInValue = false; // single-line by definition (split on \n)
  const valueLen = value.length;
  const trimmedLen = value.trim().length;
  const flags = [];
  if (hasLeadingWS) flags.push('LEADING_WHITESPACE');
  if (hasTrailingWS) flags.push('TRAILING_WHITESPACE');
  if (hasQuotes) flags.push('WRAPPED_IN_QUOTES');
  if (hasInternalSpace) flags.push('INTERNAL_SPACE');
  console.log(`  Line ${i + 1}: ${key} → value length ${valueLen} (trimmed ${trimmedLen})${flags.length ? ' — flags: ' + flags.join(', ') : ''}`);
}

// Look for orphan lines that don't contain '=' (could be wrapped JWT)
console.log('');
const orphans = lines
  .map((l, i) => ({ line: l, idx: i + 1 }))
  .filter(({ line }) => line.length > 0 && !line.trimStart().startsWith('#') && !line.includes('='));
if (orphans.length > 0) {
  console.log(`⚠ Found ${orphans.length} non-comment lines without '=' — these are likely wrapped fragments of a value:`);
  for (const { idx, line } of orphans) {
    console.log(`    Line ${idx}: length ${line.length} (likely broke off from previous line)`);
  }
} else {
  console.log('✓ No orphan lines found (no wrapped fragments).');
}
