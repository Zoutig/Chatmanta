// Draait alle unit-tests: elk bestand onder een __tests__-map in lib/ of app/.
// TWEE passes met verschillende module-condities (panel-review 2026-07-02):
//   pass 1 "react-server": alles BEHALVE files die react-dom/server importeren
//     — modules met `import 'server-only'` (embed-token V0/V1) vereisen deze
//     conditie, en de overige (pure) tests zijn er ongevoelig voor;
//   pass 2 "default": alleen de react-dom/server-files (render-markdown-lite)
//     — react-dom/server GOOIT juist onder de react-server-conditie.
// Faalt óók op .test.-files BUITEN een __tests__-map (nieuwe wezen voorkomen).
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOTS = ['lib', 'app', 'scripts', 'tests'];
const isTest = (p) => /\.test\.(ts|tsx)$/.test(p);
const inTestsDir = (p) => /(^|[\\/])__tests__[\\/]/.test(p);

const serverPass = [];
const domPass = [];
const strays = [];
for (const root of ROOTS) {
  for (const f of readdirSync(root, { recursive: true })) {
    const p = `${root}/${String(f).replaceAll('\\', '/')}`;
    if (!isTest(p)) continue;
    if (!inTestsDir(p)) { strays.push(p); continue; }
    if (/from ['"]react-dom\/server['"]/.test(readFileSync(p, 'utf8'))) domPass.push(p);
    else serverPass.push(p);
  }
}
if (strays.length) {
  console.error('Unit-testfiles buiten een __tests__-map (worden NIET gedraaid):');
  for (const s of strays) console.error(`  - ${s}`);
  process.exit(1);
}
const run = (label, extraArgs, files) => {
  if (!files.length) return 0;
  console.log(`[${label}] ${files.length} test files...`);
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', ...extraArgs, '--test', ...files.sort()],
    { stdio: 'inherit' },
  );
  return r.status ?? 1;
};
// Beide passes draaien altijd; exit non-zero zodra één pass faalt.
const s = run('react-server', ['--conditions=react-server'], serverPass);
const d = run('default', [], domPass);
process.exit(s || d);
