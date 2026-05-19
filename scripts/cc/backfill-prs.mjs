#!/usr/bin/env node
// Backfill merged GitHub PRs as completed Command Center tasks.
//
// Maps each merged PR to a cc_tasks row with status='Klaar', completedAt=mergedAt,
// classified as roadmapPhase v0 (feat/feature) or Backlog (chore/docs/fix/etc.),
// projectArea inferred from title prefix. Idempotent via `gh-pr-N` label.
//
// Usage:
//   node scripts/cc/backfill-prs.mjs            (write)
//   node scripts/cc/backfill-prs.mjs --dry-run  (preview only)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const REPO = 'Zoutig/Chatmanta';
const LIMIT = 200;

// ---------------------------------------------------------------------------
// .env.local loader (no dotenv-dependency to keep this script lean)
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
function classify(title) {
  const t = title.toLowerCase();
  // phase
  const isFeat = /^feat(ure)?(\(|:)/.test(t);
  const phase = isFeat ? 'v0' : 'Backlog';
  // projectArea via title-prefix mapping
  let area = 'Later / ideeën';
  if (/^feat\(widget/.test(t)) area = 'Widget';
  else if (/^feat\((commandcenter|klant|dashboard)/.test(t)) area = 'Dashboard';
  else if (/^feat\((v0|rag)/.test(t)) area = 'RAG & AI kwaliteit';
  else if (/^feat\(eval/.test(t)) area = 'Evaluaties / testdata';
  else if (/^fix/.test(t)) area = 'Bugs';
  else if (/^chore\((deps|ci|build)/.test(t)) area = 'Deployment / hosting';
  else if (/^docs/.test(t)) area = 'Documentatie';
  else if (isFeat) area = 'Product / UX';
  return { phase, area };
}

// ---------------------------------------------------------------------------
// Fetch PR list
// ---------------------------------------------------------------------------
function fetchMergedPRs() {
  const raw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'merged',
      '--limit',
      String(LIMIT),
      '--json',
      'number,title,mergedAt,body',
    ],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`repo: ${REPO}, limit: ${LIMIT}`);

  const prs = fetchMergedPRs();
  console.log(`fetched: ${prs.length} merged PRs`);

  // Lookup existing labels to dedup
  let existingPRNums = new Set();
  if (!DRY_RUN || true) {
    const { data, error } = await sb
      .from('cc_tasks')
      .select('labels')
      .not('labels', 'is', null);
    if (error) {
      console.error('dedup query failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      for (const l of row.labels ?? []) {
        const m = l.match(/^gh-pr-(\d+)$/);
        if (m) existingPRNums.add(Number(m[1]));
      }
    }
    console.log(`already-imported: ${existingPRNums.size} PRs`);
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const pr of prs) {
    if (existingPRNums.has(pr.number)) {
      console.log(`[SKIP]   #${pr.number} — already imported`);
      skipped++;
      continue;
    }
    const { phase, area } = classify(pr.title);
    const label = `gh-pr-${pr.number}`;
    const truncatedBody = (pr.body ?? '').slice(0, 1000);
    const row = {
      title: pr.title.slice(0, 200),
      description: `Merged PR #${pr.number} op ${pr.mergedAt}\n\n${truncatedBody}`,
      project_area: area,
      roadmap_phase: phase,
      owner: 'Sebastiaan',
      status: 'Klaar',
      priority: 'P2',
      deadline: null,
      impact: 'Middel',
      effort: 'Middel',
      blocker_reason: null,
      next_action: null,
      labels: [label],
    };
    if (DRY_RUN) {
      console.log(`[DRY]    #${pr.number} — ${phase} — ${area} — ${pr.title.slice(0, 60)}`);
      inserted++;
      continue;
    }
    // Insert
    const { data: insData, error: insErr } = await sb
      .from('cc_tasks')
      .insert(row)
      .select('id')
      .single();
    if (insErr) {
      console.error(`[FAIL]   #${pr.number} — ${insErr.message}`);
      failed++;
      continue;
    }
    // Override completed_at + created_at to mergedAt (trigger doesn't fire
    // because status doesn't change in this UPDATE).
    const { error: updErr } = await sb
      .from('cc_tasks')
      .update({ completed_at: pr.mergedAt, created_at: pr.mergedAt })
      .eq('id', insData.id);
    if (updErr) {
      console.error(`[WARN]   #${pr.number} — completedAt override failed: ${updErr.message}`);
    }
    console.log(`[INSERT] #${pr.number} — ${phase} — ${area} — ${pr.title.slice(0, 60)}`);
    inserted++;
  }

  console.log('---');
  console.log(`total:    ${prs.length}`);
  console.log(`inserted: ${inserted}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`skipped:  ${skipped}`);
  console.log(`failed:   ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
