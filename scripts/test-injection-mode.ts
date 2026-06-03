// C5 (v0.10) — borg-test voor de injection-block-op-embed veiligheidsbranch.
//
// Het publieke embed-pad (geen demo-cookie) MOET injection altijd blokkeren, ongeacht
// de env-modus (INJECTION_MODE, default log-only). Alleen de cookie-authed admin/test-
// tool volgt de env-modus. Deze test borgt dat een niet-cookie (embed) request altijd
// 'block' krijgt — zodat een latere refactor de bescherming van externe bezoekers niet
// per ongeluk verzwakt.
//
// Run: npm run test:injection
import { resolveInjectionMode } from '../lib/v0/server/injection';

let failed = 0;
function check(name: string, got: string, want: string) {
  if (got !== want) {
    console.error(`✗ ${name}: got ${got}, want ${want}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

// Embed (cookieAuthed=false) → ALTIJD block, ongeacht de env-modus.
check('embed + env log-only → block', resolveInjectionMode(false, 'log-only'), 'block');
check('embed + env block → block', resolveInjectionMode(false, 'block'), 'block');

// Cookie-authed admin/test-tool → volgt de env-modus (tuning niet gehinderd).
check('cookie + env log-only → log-only', resolveInjectionMode(true, 'log-only'), 'log-only');
check('cookie + env block → block', resolveInjectionMode(true, 'block'), 'block');

if (failed > 0) {
  console.error(`\n✗ ${failed} injection-mode test(s) gefaald`);
  process.exit(1);
}
console.log('\n✓ injection-block-op-embed branch geborgd');
