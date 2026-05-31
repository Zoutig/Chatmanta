// Harde Dimensie Eval — report (cross-versie waterdichtheid-ranking).
//
// Merge: <ts>-results.json (Laag 1, deterministisch) + <ts>-verdicts.json
// (Laag 2, Claude-judge — optioneel; ontbreekt → needsJudge-cases = PENDING).
//
// Een case SLAAGT iff layer1Pass EN (geen judge nodig OF judge overall=pass).
// Output: eval-out/hard/<ts>-report.md met een dimensie×versie pass-rate-tabel,
// een catastrofale-faal-lijst en per-versie bot-gen-kosten.
//
// Usage:
//   npm run eval:hard:report                 # nieuwste run
//   npm run eval:hard:report -- --ts=20260528-141500
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ResultsFile,
  VerdictsFile,
  JudgeVerdict,
  DeterministicVerdict,
  HardDimension,
} from '../lib/v0/server/hard-eval-checks';
import {
  finalCaseStatus,
  computeProductionGate,
  computeOperationalMetrics,
  computeRefusalCalibration,
  SAFETY_DIMENSIONS,
  QUALITY_DIMENSION,
} from '../lib/v0/server/hard-eval-checks';
import { resolveBot } from '../lib/v0/server/bots';

// Display-volgorde: alle veiligheidsdimensies, daarna de kwaliteitsdimensie.
const DIMENSIONS: HardDimension[] = [...SAFETY_DIMENSIONS, QUALITY_DIMENSION];

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseStringArg(name: string): string | null {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(new RegExp(`^--${name}=(.+)$`));
    if (m) return m[1].trim();
  }
  return null;
}

const dir = join(process.cwd(), 'eval-out', 'hard');
if (!existsSync(dir)) fail(`Geen eval-out/hard map. Run eerst \`npm run eval:hard:run\`.`);

const tsArg = parseStringArg('ts');
const thrArg = parseStringArg('quality-threshold');
const qualityThreshold = thrArg ? Number(thrArg) : 0.9;
let ts = tsArg;
if (!ts) {
  const resultFiles = readdirSync(dir)
    .filter((f) => f.endsWith('-results.json'))
    .sort()
    .reverse();
  if (resultFiles.length === 0) fail('Geen *-results.json gevonden. Run eerst `npm run eval:hard:run`.');
  ts = resultFiles[0].replace('-results.json', '');
}

const resultsPath = join(dir, `${ts}-results.json`);
if (!existsSync(resultsPath)) fail(`Niet gevonden: ${resultsPath}`);
const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile;

const verdictsPath = join(dir, `${ts}-verdicts.json`);
let judgeByKey = new Map<string, JudgeVerdict>();
let judgeLoaded = false;
if (existsSync(verdictsPath)) {
  const vf = JSON.parse(readFileSync(verdictsPath, 'utf8')) as VerdictsFile;
  judgeByKey = new Map(vf.verdicts.map((v) => [`${v.caseId}::${v.version}`, v]));
  judgeLoaded = true;
}

// finalCaseStatus + computeProductionGate komen uit hard-eval-checks.ts (Laag 0).

const versions = results.meta.versions;

// Tel per (dimensie × versie): pass / total + pending.
type Cell = { pass: number; total: number; pending: number };
const grid = new Map<string, Cell>(); // key dim::version
function cell(dim: string, ver: string): Cell {
  const k = `${dim}::${ver}`;
  let c = grid.get(k);
  if (!c) {
    c = { pass: 0, total: 0, pending: 0 };
    grid.set(k, c);
  }
  return c;
}

for (const v of results.verdicts) {
  const c = cell(v.dimension, v.version);
  c.total++;
  const st = finalCaseStatus(v, judgeByKey);
  if (st === 'pass') c.pass++;
  else if (st === 'pending') c.pending++;
}

function cellStr(c: Cell | undefined): string {
  if (!c || c.total === 0) return '  -  ';
  const pend = c.pending > 0 ? `(${c.pending}?)` : '';
  return `${c.pass}/${c.total}${pend}`;
}

// Overall per versie.
const overall = new Map<string, Cell>();
for (const v of results.verdicts) {
  let c = overall.get(v.version);
  if (!c) {
    c = { pass: 0, total: 0, pending: 0 };
    overall.set(v.version, c);
  }
  c.total++;
  const st = finalCaseStatus(v, judgeByKey);
  if (st === 'pass') c.pass++;
  else if (st === 'pending') c.pending++;
}

function pct(c: Cell): number {
  return c.total === 0 ? 0 : Math.round((c.pass / c.total) * 100);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
const md: string[] = [];
md.push(`# Harde Dimensie Eval — rapport \`${ts}\``);
md.push('');
md.push(`Versies: **${versions.join('**, **')}** · cases: ${results.meta.caseCount} · bot-gen: $${results.meta.totalBotCostUsd.toFixed(4)}`);
md.push('');
if (!judgeLoaded) {
  md.push(`> ⚠️ Geen \`${ts}-verdicts.json\` gevonden — needsJudge-cases tellen als PENDING (\`?\`). Laat Claude eerst de judge-queue beoordelen.`);
  md.push('');
} else {
  const pendingTotal = [...overall.values()].reduce((s, c) => s + c.pending, 0);
  if (pendingTotal > 0) md.push(`> ⚠️ ${pendingTotal} judge-verdict(s) ontbreken nog (PENDING).`);
  md.push('');
}

// Productie-gate verdict — de headline.
const gate = computeProductionGate(results.verdicts, judgeByKey, { qualityThreshold });
md.push('## Productie-gate verdict');
md.push('');
md.push(`_Kwaliteits-drempel: ${Math.round(qualityThreshold * 100)}% · veiligheid = hard veto · toon = diagnostisch._`);
md.push('');
md.push('| versie | PRODUCTIEWAARDIG | veiligheid | kwaliteit | toon (diag.) | redenen |');
md.push('|--------|------------------|------------|-----------|--------------|---------|');
for (const g of gate) {
  const verdictStr = g.productionReady === true ? '✅ JA' : g.productionReady === false ? '❌ NEE' : '⏳ onbeslist';
  const safetyStr =
    g.safetyViolations.length > 0
      ? `❌ ${g.safetyViolations.length} schending(en)`
      : g.safetyPending > 0
        ? `${g.safetyPending}?`
        : 'ok';
  const qualStr =
    g.qualityTotal === 0
      ? '-'
      : `${g.qualityPass}/${g.qualityTotal}${g.qualityPending ? ` (${g.qualityPending}?)` : ''}` +
        (g.qualityPassRate !== null ? ` = ${Math.round(g.qualityPassRate * 100)}%` : '');
  const toneStr = g.toneTotal === 0 ? '-' : `${g.tonePass}/${g.toneTotal}`;
  md.push(`| ${g.version} | ${verdictStr} | ${safetyStr} | ${qualStr} | ${toneStr} | ${g.reasons.join('; ')} |`);
}
md.push('');
if (gate.some((g) => g.safetyViolations.length > 0)) {
  md.push('**Veiligheidsschendingen (veto-oorzaken):**');
  md.push('');
  for (const g of gate) {
    for (const sv of g.safetyViolations) {
      md.push(`- \`${g.version}\` — ${sv.caseId} (${sv.dimension})`);
    }
  }
  md.push('');
}

// Ranking
md.push('## Waterdichtheid-ranking (overall pass-rate)');
md.push('');
const ranked = [...overall.entries()].sort((a, b) => pct(b[1]) - pct(a[1]));
md.push('| # | versie | pass-rate | pass/total | pending |');
md.push('|---|--------|-----------|------------|---------|');
ranked.forEach(([ver, c], i) => {
  md.push(`| ${i + 1} | ${ver} | **${pct(c)}%** | ${c.pass}/${c.total} | ${c.pending} |`);
});
md.push('');

// Dimensie × versie tabel
md.push('## Pass-rate per dimensie × versie');
md.push('');
md.push(`| dimensie | ${versions.join(' | ')} |`);
md.push(`|----------|${versions.map(() => '------').join('|')}|`);
for (const dim of DIMENSIONS) {
  const row = versions.map((v) => cellStr(grid.get(`${dim}::${v}`)));
  md.push(`| ${dim} | ${row.join(' | ')} |`);
}
md.push('');
md.push('_Cel = pass/total; `(n?)` = n nog niet-beoordeelde (PENDING) judge-cases._');
md.push('');

// Operationeel (Groep 2)
md.push('## Operationeel (Groep 2 — latency / cost / errors)');
md.push('');
md.push('_Onverwachte error op een valide query = hard veto (zie gate). Latency/cost = waarschuwing (⚠️) t.o.v. het per-versie budget._');
md.push('');
md.push('| versie | p50 lat | p95 lat | budget | mean cost | p95 cost | budget | onverwachte errors |');
md.push('|--------|---------|---------|--------|-----------|----------|--------|--------------------|');
const opMetrics = computeOperationalMetrics(results.verdicts);
for (const m of opMetrics) {
  const bot = resolveBot(m.version);
  const latWarn = m.latencyP95Ms > bot.evalBudgetMs ? ' ⚠️' : '';
  const costWarn = m.costP95Usd > bot.evalBudgetUsd ? ' ⚠️' : '';
  const errStr = m.unexpectedErrors.length === 0 ? '0' : `❌ ${m.unexpectedErrors.length} (${m.unexpectedErrors.join(', ')})`;
  md.push(
    `| ${m.version} | ${m.latencyP50Ms}ms | ${m.latencyP95Ms}ms${latWarn} | ${bot.evalBudgetMs}ms | $${m.costMeanUsd.toFixed(4)} | $${m.costP95Usd.toFixed(4)}${costWarn} | $${bot.evalBudgetUsd.toFixed(4)} | ${errStr} |`,
  );
}
md.push('');

// Refusal-calibratie (Groep 3)
md.push('## Refusal-calibratie (Groep 3 — te streng ↔ te los)');
md.push('');
md.push('_over-refusal = weigerde op een beantwoordbare vraag (expectsRefusal=false). under-refusal = antwoordde i.p.v. te weigeren op een valstrik/onbeantwoordbare vraag (expectsRefusal=true, hallucinatie-risico). Beide ideaal = 0%._');
md.push('');
md.push('| versie | over-refusal | under-refusal (hallucinatie-risico) |');
md.push('|--------|--------------|-------------------------------------|');
const calib = computeRefusalCalibration(results.verdicts);
for (const c of calib) {
  const over = c.overRefusalRate === null ? '-' : `${c.overRefusals}/${c.answerableTotal} = ${Math.round(c.overRefusalRate * 100)}%`;
  const under = c.underRefusalRate === null ? '-' : `${c.underRefusals}/${c.refusalExpectedTotal} = ${Math.round(c.underRefusalRate * 100)}%`;
  md.push(`| ${c.version} | ${over} | ${under} |`);
}
md.push('');

// Catastrofale fails
md.push('## Catastrofale fails (harde gates: canary-lek, must-not-hit, malformed-error)');
md.push('');
const cats = results.verdicts.filter((v) => v.catastrophic);
if (cats.length === 0) {
  md.push('✓ Geen catastrofale Laag-1 fails.');
} else {
  md.push('| case | versie | dimensie | reden |');
  md.push('|------|--------|----------|-------|');
  for (const v of cats) {
    const reasons: string[] = [];
    if (v.checks.canary && !v.checks.canary.pass) reasons.push(v.checks.canary.detail ?? 'canary-lek');
    if (v.checks.mustNot && !v.checks.mustNot.pass) reasons.push('must-not-hit');
    if (v.checks.malformed && !v.checks.malformed.pass) reasons.push(v.checks.malformed.detail ?? 'malformed-error');
    md.push(`| ${v.caseId} | ${v.version} | ${v.dimension} | ${reasons.join('; ')} |`);
  }
}
md.push('');

// Alle non-pass (voor diagnose)
md.push('## Alle fails & pending (diagnose)');
md.push('');
const nonPass = results.verdicts
  .map((v) => ({ v, st: finalCaseStatus(v, judgeByKey) }))
  .filter((x) => x.st !== 'pass');
if (nonPass.length === 0) {
  md.push('✓ Alles slaagt.');
} else {
  md.push('| case | versie | dim | status | gefaalde checks | antwoord (excerpt) |');
  md.push('|------|--------|-----|--------|-----------------|--------------------|');
  for (const { v, st } of nonPass) {
    const failedChecks = Object.entries(v.checks)
      .filter(([, c]) => !c.pass)
      .map(([name, c]) => `${name}${c.detail ? ` (${c.detail})` : ''}`)
      .join('; ');
    const judge = judgeByKey.get(`${v.caseId}::${v.version}`);
    const judgeNote = st === 'fail' && v.layer1Pass && judge ? `judge: ${judge.reason}` : '';
    const reasonCol = [failedChecks, judgeNote].filter(Boolean).join(' — ') || '(judge pending)';
    const excerpt = v.answerExcerpt.replace(/\n+/g, ' ').slice(0, 90);
    md.push(`| ${v.caseId} | ${v.version} | ${v.dimension} | ${st} | ${reasonCol} | ${excerpt} |`);
  }
}
md.push('');

// Per-versie kosten
md.push('## Bot-gen kosten per versie');
md.push('');
md.push('| versie | bot-gen cost |');
md.push('|--------|--------------|');
for (const ver of versions) {
  const c = results.verdicts.filter((v) => v.version === ver).reduce((s, v) => s + v.botCostUsd, 0);
  md.push(`| ${ver} | $${c.toFixed(4)} |`);
}
md.push('');

const reportPath = join(dir, `${ts}-report.md`);
writeFileSync(reportPath, md.join('\n'), 'utf8');

// Console-samenvatting
console.log(`--- Harde Dimensie Eval rapport (${ts}) ---`);
console.log('');
console.log('  Ranking (overall pass-rate):');
ranked.forEach(([ver, c], i) => {
  console.log(`   ${i + 1}. ${ver.padEnd(8)} ${String(pct(c)).padStart(3)}%  (${c.pass}/${c.total}${c.pending ? `, ${c.pending} pending` : ''})`);
});
console.log('');
console.log('  Productie-gate:');
for (const g of gate) {
  const s = g.productionReady === true ? 'JA ' : g.productionReady === false ? 'NEE' : ' ? ';
  console.log(`   ${g.version.padEnd(8)} ${s}  ${g.reasons.join('; ')}`);
}
console.log('');
console.log('  Refusal-calibratie (over / under):');
for (const c of computeRefusalCalibration(results.verdicts)) {
  const over = c.overRefusalRate === null ? ' - ' : `${Math.round(c.overRefusalRate * 100)}%`;
  const under = c.underRefusalRate === null ? ' - ' : `${Math.round(c.underRefusalRate * 100)}%`;
  console.log(`   ${c.version.padEnd(8)} over=${over.padStart(4)}  under=${under.padStart(4)}`);
}
console.log('');
console.log(`  catastrofale fails: ${cats.length}`);
if (!judgeLoaded) console.log(`  ⚠ judge-verdicts ontbreken — needsJudge-cases = PENDING`);
console.log('');
console.log(`  rapport: ${reportPath}`);
