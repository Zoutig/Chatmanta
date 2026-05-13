#!/usr/bin/env node
// SessionStart hook: laat de agent zien wat er sinds vorige sessie gebeurd is.
// - git fetch draait async op de achtergrond (blokkeert sessiestart niet)
// - resultaten van fetch + gh worden 5 min gecached in .claude/.cache/

import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FETCH_TTL_MS = 5 * 60 * 1000;
const PR_TTL_MS = 5 * 60 * 1000;

function safe(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const root = safe('git rev-parse --show-toplevel');
if (!root) { console.log('{}'); process.exit(0); }
process.chdir(root);

const cacheDir = join(root, '.claude', '.cache');
const cacheFile = join(cacheDir, 'session-start.json');
if (!existsSync(cacheDir)) {
  try { mkdirSync(cacheDir, { recursive: true }); } catch {}
}

function readCache() {
  try { return JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { return {}; }
}
function writeCache(data) {
  try { writeFileSync(cacheFile, JSON.stringify(data)); } catch {}
}
function isFresh(ts, ttl) {
  return typeof ts === 'number' && (Date.now() - ts) < ttl;
}
function ageLabel(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}

const cache = readCache();
let fetchLabel;

// git fetch — async spawn als de cache stale is, anders skip
if (isFresh(cache.fetchedAt, FETCH_TTL_MS)) {
  fetchLabel = `origin gefetched ${ageLabel(cache.fetchedAt)} geleden (cached)`;
} else {
  // Timestamp NU schrijven zorgt dat parallelle sessies niet allemaal een fetch starten
  cache.fetchedAt = Date.now();
  writeCache(cache);
  try {
    const child = spawn('git', ['fetch', 'origin', '--quiet'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    fetchLabel = 'origin fetch loopt async op de achtergrond';
  } catch {
    fetchLabel = 'fetch overgeslagen (kon git niet starten)';
  }
}

// Lokale git-calls (geen netwerk, snel)
const branch = safe('git rev-parse --abbrev-ref HEAD') || 'unknown';
const cwd = process.cwd();
const behind = parseInt(safe('git rev-list --count HEAD..origin/main') || '0', 10);
const ahead = parseInt(safe('git rev-list --count origin/main..HEAD') || '0', 10);
const recent = safe('git log HEAD..origin/main --oneline').split('\n').filter(Boolean).slice(0, 10).join('\n');
const status = safe('git status --short');

// Worktrees
const worktrees = safe('git worktree list --porcelain')
  .split('\n\n')
  .map((block) => {
    const lines = block.split('\n');
    const path = (lines.find((l) => l.startsWith('worktree ')) || '').replace('worktree ', '');
    const br = (lines.find((l) => l.startsWith('branch ')) || '').replace('branch refs/heads/', '');
    return path ? { path, branch: br || '(detached)' } : null;
  })
  .filter(Boolean);
const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
const cwdNorm = norm(cwd);
const otherWorktrees = worktrees.filter((w) => norm(w.path) !== cwdNorm);

// gh pr list — sync call alleen als cache stale is
let prs = [];
let prsLabel = '';
if (isFresh(cache.prsAt, PR_TTL_MS) && Array.isArray(cache.prs)) {
  prs = cache.prs;
  prsLabel = ` (cached, ${ageLabel(cache.prsAt)} oud)`;
} else {
  try {
    const raw = safe('gh pr list --state open --limit 5 --json number,title,headRefName,author');
    if (raw) {
      prs = JSON.parse(raw);
      cache.prs = prs;
      cache.prsAt = Date.now();
      writeCache(cache);
    }
  } catch { /* gh not available or not authed */ }
}

// Banner
const parts = [
  '┌─ Werkcontext bij sessie-start ─',
  `│  Branch:   ${branch}`,
  `│  Workdir:  ${cwd}`,
  `│  Fetch:    ${fetchLabel}`,
  '└─',
  '',
];

parts.push('⚠  VOOR JE EERSTE CODE-WIJZIGING IN DEZE SESSIE:');
parts.push('   Bevestig kort met de gebruiker:');
parts.push(`     1. Is "${branch}" de juiste branch, of moet er een feature-branch komen?`);
parts.push('     2. Draait er een andere CC-sessie op deze directory?');
parts.push('        → Zo ja: gebruik git worktree om conflicten te voorkomen');
parts.push("        → Skill: 'using-git-worktrees' / Tool: EnterWorktree");
parts.push('   Sla deze check NIET over — parallelle sessies in dezelfde working tree');
parts.push('   leiden tot verloren edits, branch-shifts en rebase-conflicten.');
parts.push('');

if (otherWorktrees.length > 0) {
  parts.push(`ℹ  ${otherWorktrees.length} andere worktree(s) op deze repo:`);
  for (const w of otherWorktrees) {
    parts.push(`     - ${w.path}  [${w.branch}]`);
  }
  parts.push('');
}

parts.push('Git-state details:');

if (behind > 0) {
  parts.push(`- Je loopt ${behind} commit(s) achter op origin/main`);
  if (recent) {
    parts.push('- Recente commits op origin/main:');
    recent.split('\n').forEach(l => parts.push(`    ${l}`));
  }
  parts.push('- Suggestie: vraag de gebruiker of git pull veilig is voor je begint');
}

if (ahead > 0 && branch === 'main') {
  parts.push(`- LET OP: je hebt ${ahead} lokale commit(s) op main die nog niet gepushed zijn`);
  parts.push('- Direct pushen blokkeert de pre-push hook. Maak een feature branch:');
  parts.push('    git checkout -b feat/<naam>/<beschrijving>');
}

if (status) {
  parts.push('- Uncommitted wijzigingen:');
  status.split('\n').slice(0, 10).forEach(l => parts.push(`    ${l}`));
}

if (behind === 0 && ahead === 0 && !status) {
  parts.push('- Schone state, up-to-date met origin/main');
}

if (prs.length > 0) {
  parts.push('');
  parts.push(`Open PRs (van jou of teamgenoot)${prsLabel}:`);
  prs.forEach(pr => {
    const author = (pr.author && pr.author.login) || '?';
    parts.push(`  #${pr.number} [${pr.headRefName}] ${pr.title} (door @${author})`);
  });
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: parts.join('\n'),
  },
}));
