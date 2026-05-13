#!/usr/bin/env node
// SessionStart hook: laat de agent zien wat er sinds vorige sessie gebeurd is.
// Doet GEEN auto-pull (zou ongevraagd mergeconflicten kunnen veroorzaken).

import { execSync } from 'node:child_process';

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

safe('git fetch origin --quiet');

const branch = safe('git rev-parse --abbrev-ref HEAD') || 'unknown';
const cwd = process.cwd();
const behind = parseInt(safe('git rev-list --count HEAD..origin/main') || '0', 10);
const ahead = parseInt(safe('git rev-list --count origin/main..HEAD') || '0', 10);
const recent = safe('git log HEAD..origin/main --oneline').split('\n').filter(Boolean).slice(0, 10).join('\n');
const status = safe('git status --short');

// V2: detecteer parallelle worktrees op dezelfde repo. Lijst is "<path> <sha> [branch]"
// per regel; het eerste pad is altijd de main working tree (= deze sessie of een andere).
const worktrees = safe('git worktree list --porcelain')
  .split('\n\n')
  .map((block) => {
    const lines = block.split('\n');
    const path = (lines.find((l) => l.startsWith('worktree ')) || '').replace('worktree ', '');
    const br = (lines.find((l) => l.startsWith('branch ')) || '').replace('branch refs/heads/', '');
    return path ? { path, branch: br || '(detached)' } : null;
  })
  .filter(Boolean);
// Normaliseer paden: git worktree gebruikt forward slashes op Windows, cwd backslashes.
const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
const cwdNorm = norm(cwd);
const otherWorktrees = worktrees.filter((w) => norm(w.path) !== cwdNorm);

let prs = [];
try {
  prs = JSON.parse(safe('gh pr list --state open --limit 5 --json number,title,headRefName,author') || '[]');
} catch { /* gh not available or not authed */ }

// Visuele prominent banner — zorgt dat ik niet over de branch heen lees.
const parts = [
  '┌─ Werkcontext bij sessie-start (auto-fetched, geen pull) ─',
  `│  Branch:   ${branch}`,
  `│  Workdir:  ${cwd}`,
  '└─',
  '',
];

// Versterkte instructie aan Claude: vóór codewijzigingen altijd bevestigen.
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
  parts.push('Open PRs (van jou of teamgenoot):');
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
