// Read-only snapshot tool — dumpt latency-percentielen + cost-aggregaten uit
// query_log voor alle (of één) org in een tijdvenster. Geen mutaties, geen
// API-calls naar OpenAI/Anthropic. Bedoeld voor ad-hoc "hoe staat V0 ervoor"
// inspectie zonder eval-run.
//
// Schema-referenties:
//   - query_log              (migration 0003 + 0010 + 0012 + 0014)
//   - organizations          (migration 0001)
//   - MODEL_COSTS_USD        (lib/ai/llm.ts)
//
// CLI:
//   node --env-file=.env.local scripts/v0-snapshot.mjs [--window=7d] [--org=all] [--yes]

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Args parsing — eenvoudig, geen yargs nodig
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) return [m[1], m[2]];
    return [a.replace(/^--/, ''), true];
  }),
);

const WINDOW = args.window ?? '7d';
const ORG = args.org ?? 'all';
const SKIP_CONFIRM = args.yes === true || args.yes === 'true';

if (!['24h', '7d', 'all'].includes(WINDOW)) {
  console.error(`Ongeldig --window: ${WINDOW}. Geldig: 24h | 7d | all`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client — service-role, geen RLS, read-only intent
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sortedAsc[lo]);
  const frac = idx - lo;
  return Math.round(sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac);
}

function sinceIso(window) {
  if (window === '24h') return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (window === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function fmtMs(v) {
  if (v === null || v === undefined) return '   —';
  return `${String(v).padStart(5, ' ')}ms`;
}

function fmtUsd(v) {
  if (v === null || v === undefined) return '    —';
  return `$${v.toFixed(4)}`;
}

function fmtInt(v) {
  if (v === null || v === undefined) return '—';
  return String(v).padStart(5, ' ');
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function host(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function table(rows, columns) {
  if (rows.length === 0) {
    console.log('  (geen data)');
    return;
  }
  const widths = columns.map((c) => Math.max(c.label.length, ...rows.map((r) => String(r[c.key] ?? '').length)));
  const sep = '  ';
  console.log(columns.map((c, i) => c.label.padEnd(widths[i])).join(sep));
  console.log(widths.map((w) => '-'.repeat(w)).join(sep));
  for (const r of rows) {
    console.log(columns.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join(sep));
  }
}

// ---------------------------------------------------------------------------
// Header + sanity-check
// ---------------------------------------------------------------------------
const SINCE = sinceIso(WINDOW);
console.log('='.repeat(72));
console.log('  V0 SNAPSHOT — latency + cost dump (read-only)');
console.log('='.repeat(72));
console.log(`  DB host       : ${host(SUPABASE_URL)}`);
console.log(`  Window        : ${WINDOW}${SINCE ? '  (sinds ' + SINCE.slice(0, 19) + 'Z)' : ''}`);
console.log(`  Org filter    : ${ORG}`);
console.log(`  Tijdstip      : ${new Date().toISOString().slice(0, 19)}Z`);
console.log();

// Pull orgs + total rowcount voor confirm
const { data: allOrgs, error: orgErr } = await sb
  .from('organizations')
  .select('id, slug, name, deleted_at')
  .order('slug');
if (orgErr) {
  console.error(`organizations select faalde: ${orgErr.message}`);
  process.exit(2);
}
const liveOrgs = allOrgs.filter((o) => o.deleted_at === null);

let countQ = sb.from('query_log').select('id', { count: 'exact', head: true });
if (SINCE) countQ = countQ.gte('created_at', SINCE);
const { count: rowCount, error: cntErr } = await countQ;
if (cntErr) {
  console.error(`query_log count faalde: ${cntErr.message}`);
  process.exit(2);
}

console.log(`  Orgs (live)   : ${liveOrgs.length} (${liveOrgs.map((o) => o.slug).join(', ')})`);
console.log(`  Rows in window: ${rowCount}`);
console.log();

if (!SKIP_CONFIRM) {
  console.log('  ⚠ Geen --yes meegegeven. Dit is een DRY-CHECK. Voer opnieuw uit met --yes om');
  console.log('    de volledige tabellen te dumpen.');
  process.exit(0);
}

// Selecteer orgs op basis van --org
const targetOrgs =
  ORG === 'all' ? liveOrgs : liveOrgs.filter((o) => o.slug === ORG);
if (targetOrgs.length === 0) {
  console.error(`Geen orgs match --org=${ORG}. Beschikbaar: ${liveOrgs.map((o) => o.slug).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Per-org × per-versie latency
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  1. LATENCY — per org × bot_version (p50 / p95 / p99 total + per fase)');
console.log('─'.repeat(72));

const latencyRows = [];
for (const org of targetOrgs) {
  let q = sb
    .from('query_log')
    .select('bot_version, embedding_ms, retrieval_ms, rerank_ms, generation_ms, total_ms')
    .eq('organization_id', org.id)
    .not('total_ms', 'is', null);
  if (SINCE) q = q.gte('created_at', SINCE);
  const { data, error } = await q;
  if (error) {
    console.error(`  latency select org=${org.slug}: ${error.message}`);
    continue;
  }
  const byVersion = new Map();
  for (const r of data) {
    const list = byVersion.get(r.bot_version) ?? [];
    list.push(r);
    byVersion.set(r.bot_version, list);
  }
  for (const [version, rows] of [...byVersion.entries()].sort()) {
    const totals = rows.map((r) => r.total_ms).sort((a, b) => a - b);
    const embed = rows.map((r) => r.embedding_ms).filter((n) => n !== null).sort((a, b) => a - b);
    const retr = rows.map((r) => r.retrieval_ms).filter((n) => n !== null).sort((a, b) => a - b);
    const rerank = rows.map((r) => r.rerank_ms).filter((n) => n !== null).sort((a, b) => a - b);
    const gen = rows.map((r) => r.generation_ms).filter((n) => n !== null).sort((a, b) => a - b);
    latencyRows.push({
      org: org.slug,
      version,
      n: rows.length,
      p50t: fmtMs(percentile(totals, 0.5)),
      p95t: fmtMs(percentile(totals, 0.95)),
      p99t: fmtMs(percentile(totals, 0.99)),
      p50e: fmtMs(percentile(embed, 0.5)),
      p50r: fmtMs(percentile(retr, 0.5)),
      p50rr: fmtMs(percentile(rerank, 0.5)),
      p50g: fmtMs(percentile(gen, 0.5)),
    });
  }
}
console.log();
table(latencyRows, [
  { key: 'org', label: 'org' },
  { key: 'version', label: 'version' },
  { key: 'n', label: 'n' },
  { key: 'p50t', label: 'p50 total' },
  { key: 'p95t', label: 'p95 total' },
  { key: 'p99t', label: 'p99 total' },
  { key: 'p50e', label: 'p50 embed' },
  { key: 'p50r', label: 'p50 retr' },
  { key: 'p50rr', label: 'p50 rerank' },
  { key: 'p50g', label: 'p50 gen' },
]);

// ---------------------------------------------------------------------------
// 2. Top-10 slowest queries globaal in window
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  2. TOP-10 SLOWEST QUERIES — globaal in window');
console.log('─'.repeat(72));
{
  let q = sb
    .from('query_log')
    .select('id, question, total_ms, bot_version, organization_id, created_at')
    .not('total_ms', 'is', null)
    .order('total_ms', { ascending: false })
    .limit(10);
  if (SINCE) q = q.gte('created_at', SINCE);
  if (ORG !== 'all') {
    const orgIds = targetOrgs.map((o) => o.id);
    q = q.in('organization_id', orgIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error(`  slowest select: ${error.message}`);
  } else {
    const orgById = new Map(allOrgs.map((o) => [o.id, o.slug]));
    const rows = data.map((r) => ({
      ms: fmtMs(r.total_ms),
      version: r.bot_version,
      org: orgById.get(r.organization_id) ?? '?',
      when: r.created_at.slice(0, 19).replace('T', ' '),
      question: truncate(r.question, 60),
    }));
    console.log();
    table(rows, [
      { key: 'ms', label: 'total' },
      { key: 'version', label: 'version' },
      { key: 'org', label: 'org' },
      { key: 'when', label: 'when (UTC)' },
      { key: 'question', label: 'question' },
    ]);
  }
}

// ---------------------------------------------------------------------------
// 3. Per-org × per-versie cost (window) + all-time naast elkaar
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  3. COST — per org × bot_version (window vs all-time)');
console.log('─'.repeat(72));

async function costPerOrgVersion(org, since) {
  let q = sb
    .from('query_log')
    .select(
      'bot_version, cost_usd, embed_tokens, chat_in_tokens, chat_out_tokens, pre_in_tokens, pre_out_tokens, from_cache',
    )
    .eq('organization_id', org.id);
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q;
  if (error) throw new Error(`cost select ${org.slug}: ${error.message}`);
  const byVersion = new Map();
  for (const r of data) {
    const v = byVersion.get(r.bot_version) ?? {
      n: 0,
      cost: 0,
      embed: 0,
      chatIn: 0,
      chatOut: 0,
      preIn: 0,
      preOut: 0,
      cacheHits: 0,
    };
    v.n += 1;
    v.cost += Number(r.cost_usd) || 0;
    v.embed += r.embed_tokens || 0;
    v.chatIn += r.chat_in_tokens || 0;
    v.chatOut += r.chat_out_tokens || 0;
    v.preIn += r.pre_in_tokens || 0;
    v.preOut += r.pre_out_tokens || 0;
    if (r.from_cache) v.cacheHits += 1;
    byVersion.set(r.bot_version, v);
  }
  return byVersion;
}

const costRows = [];
for (const org of targetOrgs) {
  const windowed = await costPerOrgVersion(org, SINCE);
  const allTime = await costPerOrgVersion(org, null);
  const versions = new Set([...windowed.keys(), ...allTime.keys()]);
  for (const version of [...versions].sort()) {
    const w = windowed.get(version) ?? { n: 0, cost: 0, cacheHits: 0, chatIn: 0, chatOut: 0, embed: 0 };
    const a = allTime.get(version) ?? { n: 0, cost: 0, cacheHits: 0, chatIn: 0, chatOut: 0, embed: 0 };
    const cacheRateW = w.n > 0 ? Math.round((w.cacheHits / w.n) * 100) : null;
    costRows.push({
      org: org.slug,
      version,
      'n (w)': w.n,
      'cost (w)': fmtUsd(w.cost),
      'avg/q (w)': w.n > 0 ? fmtUsd(w.cost / w.n) : '—',
      'cache% (w)': cacheRateW === null ? '—' : `${cacheRateW}%`,
      'chat_in (w)': w.chatIn,
      'chat_out (w)': w.chatOut,
      'n (all)': a.n,
      'cost (all)': fmtUsd(a.cost),
    });
  }
}
console.log();
table(costRows, [
  { key: 'org', label: 'org' },
  { key: 'version', label: 'version' },
  { key: 'n (w)', label: 'n (w)' },
  { key: 'cost (w)', label: 'cost (w)' },
  { key: 'avg/q (w)', label: 'avg/q (w)' },
  { key: 'cache% (w)', label: 'cache (w)' },
  { key: 'chat_in (w)', label: 'in_tok (w)' },
  { key: 'chat_out (w)', label: 'out_tok (w)' },
  { key: 'n (all)', label: 'n (all)' },
  { key: 'cost (all)', label: 'cost (all)' },
]);

// ---------------------------------------------------------------------------
// 4. Per-day cost over 7d (alle orgs samen, alle versies samen)
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  4. PER-DAY COST — laatste 7 dagen, geaggregeerd over orgs/versies');
console.log('─'.repeat(72));
{
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let q = sb
    .from('query_log')
    .select('created_at, cost_usd, from_cache, bot_version')
    .gte('created_at', since7d);
  if (ORG !== 'all') {
    const orgIds = targetOrgs.map((o) => o.id);
    q = q.in('organization_id', orgIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error(`  per-day cost select: ${error.message}`);
  } else {
    const byDay = new Map();
    for (const r of data) {
      const day = r.created_at.slice(0, 10);
      const v = byDay.get(day) ?? { n: 0, cost: 0, cacheHits: 0, versions: new Set() };
      v.n += 1;
      v.cost += Number(r.cost_usd) || 0;
      if (r.from_cache) v.cacheHits += 1;
      v.versions.add(r.bot_version);
      byDay.set(day, v);
    }
    const rows = [...byDay.entries()]
      .sort()
      .map(([day, v]) => ({
        date: day,
        n: v.n,
        cost: fmtUsd(v.cost),
        cacheHits: v.cacheHits,
        cachePct: v.n > 0 ? Math.round((v.cacheHits / v.n) * 100) + '%' : '—',
        versions: [...v.versions].sort().join(','),
      }));
    console.log();
    table(rows, [
      { key: 'date', label: 'date' },
      { key: 'n', label: 'n' },
      { key: 'cost', label: 'cost' },
      { key: 'cacheHits', label: 'cache hits' },
      { key: 'cachePct', label: 'cache%' },
      { key: 'versions', label: 'versions' },
    ]);
  }
}

// ---------------------------------------------------------------------------
// 5. Latency-budget overschrijdingen — v0.5 boven 8s soft-budget
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  5. LATENCY-BUDGET — v0.5 soft (8000ms) overschrijdingen in window');
console.log('─'.repeat(72));
{
  let q = sb
    .from('query_log')
    .select('total_ms, phase_timings_ms, organization_id')
    .eq('bot_version', 'v0.5')
    .not('total_ms', 'is', null);
  if (SINCE) q = q.gte('created_at', SINCE);
  if (ORG !== 'all') {
    const orgIds = targetOrgs.map((o) => o.id);
    q = q.in('organization_id', orgIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error(`  v0.5 budget select: ${error.message}`);
  } else if (data.length === 0) {
    console.log('  (geen v0.5 queries in window)');
  } else {
    const total = data.length;
    const overSoft = data.filter((r) => r.total_ms > 8000).length;
    const overHard = data.filter((r) => r.total_ms > 12000).length;
    const skipReasons = new Map();
    let withSkipField = 0;
    for (const r of data) {
      const pt = r.phase_timings_ms;
      if (pt && typeof pt === 'object' && 'latencyBudgetExceeded' in pt) {
        withSkipField += 1;
        const skipped = pt.latencyBudgetExceeded?.skipped ?? [];
        for (const s of skipped) {
          skipReasons.set(s, (skipReasons.get(s) ?? 0) + 1);
        }
      }
    }
    console.log();
    console.log(`  v0.5 queries (window)       : ${total}`);
    console.log(`  > 8000ms (soft-budget)      : ${overSoft} (${total > 0 ? Math.round((overSoft / total) * 100) : 0}%)`);
    console.log(`  > 12000ms (hard-cap, NOT enforced): ${overHard} (${total > 0 ? Math.round((overHard / total) * 100) : 0}%)`);
    console.log(`  rows met latencyBudgetExceeded in phase_timings_ms: ${withSkipField}`);
    if (skipReasons.size > 0) {
      console.log('  Skipped phases (count):');
      for (const [phase, c] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    - ${phase}: ${c}`);
      }
    } else if (withSkipField === 0) {
      console.log('  (geen latencyBudgetExceeded-field gevonden — of nooit overschreden, of niet gelogd)');
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Cost-tabel ter referentie
// ---------------------------------------------------------------------------
console.log();
console.log('─'.repeat(72));
console.log('  6. MODEL_COSTS_USD — ter referentie (lib/ai/llm.ts:69)');
console.log('─'.repeat(72));
console.log();
const MODEL_COSTS_USD = {
  'claude-haiku-4-5': { input_per_m: 1.0, output_per_m: 5.0 },
  'claude-sonnet-4-6': { input_per_m: 3.0, output_per_m: 15.0 },
  'gpt-4o-mini': { input_per_m: 0.15, output_per_m: 0.6 },
  'gpt-4o': { input_per_m: 2.5, output_per_m: 10.0 },
};
table(
  Object.entries(MODEL_COSTS_USD).map(([model, c]) => ({
    model,
    in: `$${c.input_per_m.toFixed(2)} / 1M`,
    out: `$${c.output_per_m.toFixed(2)} / 1M`,
  })),
  [
    { key: 'model', label: 'model' },
    { key: 'in', label: 'input' },
    { key: 'out', label: 'output' },
  ],
);

console.log();
console.log('='.repeat(72));
console.log('  klaar.');
console.log('='.repeat(72));
