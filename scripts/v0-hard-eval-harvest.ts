// Harde Dimensie Eval — query_log-harvest (Laag 3 / Groep 1, realisme).
//
// Leest echte bezoekersvragen uit query_log (kind='answer' = beantwoordbaar),
// dedupliceert + PII-filtert, en schrijft answer-quality-case-KANDIDATEN naar
// eval-out/hard/harvest-candidates-<ts>.json. Deze gaan NIET automatisch de
// fixture in — de operator beoordeelt ze en kopieert de goede handmatig naar
// eval-fixtures/hard-dimension-cases.json.
//
// V0-eerlijkheid: query_log is in V0 dun + grotendeels eigen test-verkeer met
// fake demo-data. De waarde is deels vooruitkijkend (vol rendement in V1).
//
// Usage:
//   npm run eval:hard:harvest                       # per-org 8, limit 1000
//   npm run eval:hard:harvest -- --per-org=12 --limit=2000
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { redactPii } from '../lib/observability/redact';
import { selectHarvestCandidates, type HarvestInput, type HardOrgSlug } from '../lib/v0/server/hard-eval-checks';

const ORG_SLUG_BY_ID: Readonly<Record<string, HardOrgSlug>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseIntArg(name: string, dflt: number): number {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(new RegExp(`^--${name}=(\\d+)$`));
    if (m) return Number(m[1]);
  }
  return dflt;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

async function main(): Promise<void> {
  const perOrg = parseIntArg('per-org', 8);
  const limit = parseIntArg('limit', 1000);

  const sb = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Alleen kind='answer' = de bot vond context en beantwoordde → goede
  // answer-quality-kandidaten (in-corpus, beantwoordbaar).
  const { data, error } = await sb
    .from('query_log')
    .select('question, organization_id, created_at')
    .eq('kind', 'answer')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(`query_log lees-fout: ${error.message}`);

  const rows: HarvestInput[] = [];
  let skippedUnknownOrg = 0;
  for (const r of (data ?? []) as { question: string; organization_id: string }[]) {
    const slug = ORG_SLUG_BY_ID[r.organization_id];
    if (!slug) {
      skippedUnknownOrg++;
      continue;
    }
    if (typeof r.question === 'string' && r.question.trim()) rows.push({ question: r.question, orgSlug: slug });
  }

  const before = rows.length;
  const candidates = selectHarvestCandidates(rows, {
    perOrg,
    containsPii: (q) => redactPii(q) !== q,
  });

  const ts = timestamp();
  const dir = join(process.cwd(), 'eval-out', 'hard');
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `harvest-candidates-${ts}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      { _meta: { harvestedAt: ts, source: 'query_log kind=answer', perOrg, rawRows: before }, cases: candidates },
      null,
      2,
    ),
    'utf8',
  );

  const perOrgCounts = new Map<string, number>();
  for (const c of candidates) perOrgCounts.set(c.orgSlug, (perOrgCounts.get(c.orgSlug) ?? 0) + 1);

  console.log('--- Harde Dimensie Eval — query_log-harvest ---');
  console.log(`  ruwe kind='answer' rijen : ${before}${skippedUnknownOrg ? ` (+${skippedUnknownOrg} onbekende org geskipt)` : ''}`);
  console.log(`  kandidaten (na dedupe/PII): ${candidates.length}`);
  for (const [slug, n] of perOrgCounts) console.log(`    ${slug.padEnd(12)} ${n}`);
  if (candidates.length === 0) {
    console.log('  ⚠ Geen kandidaten — query_log is dun (verwacht in V0). De harness werkt; vol rendement in V1.');
  }
  console.log('');
  console.log(`  → review-bestand: ${outPath}`);
  console.log('  Beoordeel de kandidaten en kopieer goede handmatig naar eval-fixtures/hard-dimension-cases.json.');
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
