#!/usr/bin/env node
// Pre-push check — detecteert NNNN-collisions tussen deze branch en open PRs.
//
// Voorkomt de 0019-collision die landde in PRs #31, #32, #34 (drie parallelle
// branches die alle drie nummer 0019 claimden zonder dat iemand `gh pr list`
// raadpleegde).
//
// Skipped (exit 0) wanneer:
//   - gh CLI niet geïnstalleerd
//   - gh auth niet geconfigureerd / netwerk faalt
//   - branch heeft geen nieuwe migrations
//   - geen base-ref om tegen te diffen
//
// Block (exit 1) alleen wanneer een echte collision met een ANDERE open PR
// gedetecteerd wordt (eigen open PR wordt uitgesloten via --head matching).
//
// Bypass voor noodgevallen: git push --no-verify

import { execSync } from 'node:child_process';

function runOk(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const MIG_NUMBER_RE = /^supabase\/migrations\/(\d{4})/;

// 1. gh aanwezig?
if (!runOk('gh --version')) process.exit(0);

// 2. Bepaal base-ref (origin/main bij voorkeur).
const baseRef = runOk('git rev-parse --verify origin/main')
  ? 'origin/main'
  : runOk('git rev-parse --verify main')
    ? 'main'
    : null;
if (!baseRef) process.exit(0);

// 3. Nieuwe + renamed migrations in deze branch.
const diff = runOk(
  `git diff --diff-filter=ARM --name-only ${baseRef}...HEAD -- supabase/migrations`,
);
if (!diff) process.exit(0);

const myNumbers = new Set();
for (const path of diff.split('\n')) {
  const m = path.match(MIG_NUMBER_RE);
  if (m) myNumbers.add(m[1]);
}
if (myNumbers.size === 0) process.exit(0);

// 4. Eigen open PR (indien al bestaand) — daarmee niet tegen jezelf checken.
const currentBranch = runOk('git rev-parse --abbrev-ref HEAD');
let selfPrNumber = null;
if (currentBranch && currentBranch !== 'HEAD') {
  const selfRaw = runOk(
    `gh pr list --head ${currentBranch} --state open --json number --jq ".[0].number"`,
  );
  if (selfRaw && /^\d+$/.test(selfRaw)) selfPrNumber = Number(selfRaw);
}

// 5. Alle open PRs + hun files (limiet 50 — ruim, en goedkoop).
const rawPrs = runOk(
  'gh pr list --state open --json number,title,headRefName,files --limit 50',
);
if (!rawPrs) process.exit(0);

let prs;
try {
  prs = JSON.parse(rawPrs);
} catch {
  process.exit(0);
}

const collisions = [];
for (const pr of prs) {
  if (pr.number === selfPrNumber) continue;
  for (const f of pr.files ?? []) {
    const m = (f.path ?? '').match(MIG_NUMBER_RE);
    if (m && myNumbers.has(m[1])) {
      collisions.push({
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        file: f.path,
        num: m[1],
      });
    }
  }
}

if (collisions.length === 0) process.exit(0);

console.error('');
console.error('🚨 [BLOCKED] Migration nummer-collision gedetecteerd');
console.error('');
console.error('Jouw branch voegt migration(s) toe met nummer(s):');
for (const num of [...myNumbers].sort()) console.error(`   ${num}`);
console.error('');
console.error('Maar deze open PR(s) claimen hetzelfde nummer:');
for (const c of collisions) {
  console.error(`   PR #${c.number} (${c.branch}): ${c.file}`);
  console.error(`      "${c.title}"`);
}
console.error('');
console.error('Acties:');
console.error('  - Rename je migration-file(s) naar het volgende vrije nummer.');
console.error('  - Vergeet ook je _migrations tracking-row niet als je al');
console.error('    `npm run migrate` had gedraaid (zie 0019a/0019b patroon).');
console.error('  - Of overleg met de PR-author wie welk nummer krijgt.');
console.error('');
console.error('Bypass alleen voor noodgevallen: git push --no-verify');
console.error('');
process.exit(1);
