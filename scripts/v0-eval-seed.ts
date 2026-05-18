// V0 eval seed runner — leest ALLE eval-fixtures/seed-questions*.json files
// en upsert elke rij in public.eval_questions via service-role.
//
// V0.7 eval-v2: multi-org support. Elke seed-file declareert zijn eigen
// _meta.organization_id; de hardcoded DEV_ORG_ID-binding uit pre-v2 is weg.
// Files:
//   - eval-fixtures/seed-questions.json          → DEV_ORG (legacy + sanity)
//   - eval-fixtures/seed-questions-acme-corp.json → acme-corp
//   - eval-fixtures/seed-questions-globex-inc.json → globex-inc
//   - eval-fixtures/seed-questions-initech.json   → initech
//
// Idempotent op (organization_id, slug). Re-runs zijn safe: bestaande rijen
// worden ge-update met nieuwe gold_answer/gold_facts/tags/difficulty.
//
// Usage:
//   npm run eval:seed

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Legacy fallback: eval-fixtures/seed-questions.json (zonder org-suffix) is
// bedoeld voor DEV_ORG en heeft historisch geen _meta.organization_id. Voor
// die ene file fallen we terug op deze constante.
const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

const KNOWN_ORG_IDS: ReadonlySet<string> = new Set([
  DEV_ORG_ID,
  '00000000-0000-0000-0000-0000000000a1', // acme-corp
  '00000000-0000-0000-0000-0000000000a2', // globex-inc
  '00000000-0000-0000-0000-0000000000a3', // initech
]);

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

type QuestionType =
  | 'factual'
  | 'multi_hop'
  | 'out_of_corpus'
  | 'false_premise'
  | 'prompt_injection'
  | 'typo'
  | 'planted_fact'
  | 'smalltalk'
  | 'ambiguous';

type SeedQuestion = {
  slug: string;
  question: string;
  gold_answer: string;
  gold_facts: string[];
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  /** v0.5: verwacht bot-gedrag voor route-correctness eval. Optioneel —
      cases zonder category krijgen NULL in de DB (judge meet route_correct
      dan niet). */
  category?: 'search' | 'general' | 'off_topic' | 'smalltalk';
  // v2 fields (optional in JSON, defaulted when absent)
  question_type?: QuestionType;
  expected_kind?: 'answer' | 'fallback' | 'smalltalk' | null;
  must_not_contain?: string[];
  ideal_source_filenames?: string[];
  conversation_history?: HistoryTurn[];
};

const VALID_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  'factual',
  'multi_hop',
  'out_of_corpus',
  'false_premise',
  'prompt_injection',
  'typo',
  'planted_fact',
  'smalltalk',
  'ambiguous',
]);

const VALID_EXPECTED_KINDS = new Set(['answer', 'fallback', 'smalltalk']);

type SeedFile = {
  _meta?: Record<string, unknown> & { organization_id?: string };
  questions: SeedQuestion[];
};

// ---------------------------------------------------------------------------
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

// ---------------------------------------------------------------------------
// Discover seed-files. Patroon: eval-fixtures/seed-questions*.json
// ---------------------------------------------------------------------------
const FIXTURE_DIR = resolve('eval-fixtures');
function discoverSeedFiles(): string[] {
  const all = readdirSync(FIXTURE_DIR);
  return all
    .filter((f) => /^seed-questions(-.*)?\.json$/.test(f))
    .sort()
    .map((f) => resolve(FIXTURE_DIR, f));
}

function loadAndValidate(filePath: string): { orgId: string; questions: SeedQuestion[] } {
  let parsed: SeedFile;
  try {
    const raw = readFileSync(filePath, 'utf8');
    parsed = JSON.parse(raw) as SeedFile;
  } catch (err) {
    fail(`Kan ${filePath} niet lezen/parsen: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    fail(`${filePath}: mist een 'questions'-array.`);
  }

  // Org-binding: bij voorkeur uit _meta.organization_id; legacy seed-questions.json
  // (geen suffix) zonder _meta valt terug op DEV_ORG_ID.
  const metaOrg = parsed._meta?.organization_id;
  const isLegacyDevOrgFile = filePath.endsWith('seed-questions.json');
  const orgId = typeof metaOrg === 'string' ? metaOrg : (isLegacyDevOrgFile ? DEV_ORG_ID : null);

  if (!orgId) {
    fail(`${filePath}: _meta.organization_id ontbreekt en filename is geen legacy seed-questions.json.`);
  }
  if (!KNOWN_ORG_IDS.has(orgId)) {
    fail(`${filePath}: _meta.organization_id=${orgId} is geen bekende V0-org-UUID.`);
  }

  // Validate per record. Strikt: faal vroeg met een duidelijke error.
  const seenSlugs = new Set<string>();
  for (const q of parsed.questions) {
    const id = `${filePath}#${q.slug ?? '???'}`;
    if (!q.slug || typeof q.slug !== 'string') fail(`Question zonder slug in ${filePath}: ${JSON.stringify(q).slice(0, 120)}`);
    if (seenSlugs.has(q.slug)) fail(`${id}: dubbele slug binnen dezelfde file`);
    seenSlugs.add(q.slug);
    if (!q.question?.trim()) fail(`${id}: question is leeg`);
    if (!q.gold_answer?.trim()) fail(`${id}: gold_answer is leeg`);
    if (!Array.isArray(q.gold_facts)) fail(`${id}: gold_facts moet een array zijn`);
    if (!Array.isArray(q.tags)) fail(`${id}: tags moet een array zijn`);
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
      fail(`${id}: difficulty moet easy|medium|hard zijn (kreeg "${q.difficulty}")`);
    }
    if (q.category !== undefined) {
      if (!['search', 'general', 'off_topic', 'smalltalk'].includes(q.category)) {
        fail(`${id}: category moet search|general|off_topic|smalltalk zijn (kreeg "${q.category}")`);
      }
    }
    if (q.question_type !== undefined && !VALID_QUESTION_TYPES.has(q.question_type)) {
      fail(`${id}: question_type onbekend: "${q.question_type}"`);
    }
    if (q.expected_kind !== undefined && q.expected_kind !== null && !VALID_EXPECTED_KINDS.has(q.expected_kind)) {
      fail(`${id}: expected_kind moet answer|fallback|smalltalk|null zijn`);
    }
    if (q.must_not_contain !== undefined && !Array.isArray(q.must_not_contain)) {
      fail(`${id}: must_not_contain moet een array zijn`);
    }
    if (q.ideal_source_filenames !== undefined && !Array.isArray(q.ideal_source_filenames)) {
      fail(`${id}: ideal_source_filenames moet een array zijn`);
    }
    if (q.conversation_history !== undefined) {
      if (!Array.isArray(q.conversation_history)) {
        fail(`${id}: conversation_history moet een array zijn`);
      }
      for (const [i, turn] of q.conversation_history.entries()) {
        if (!turn || typeof turn !== 'object') fail(`${id}: conversation_history[${i}] is geen object`);
        if (turn.role !== 'user' && turn.role !== 'assistant') {
          fail(`${id}: conversation_history[${i}].role moet user|assistant zijn`);
        }
        if (typeof turn.content !== 'string' || !turn.content.trim()) {
          fail(`${id}: conversation_history[${i}].content moet niet-lege string zijn`);
        }
      }
    }
  }

  return { orgId, questions: parsed.questions };
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const files = discoverSeedFiles();
  if (files.length === 0) fail(`Geen seed-questions*.json in ${FIXTURE_DIR}`);

  const fixtures = files.map((f) => ({ path: f, ...loadAndValidate(f) }));
  const totalQ = fixtures.reduce((n, f) => n + f.questions.length, 0);

  console.log(`--- Seed eval_questions: ${totalQ} entries over ${fixtures.length} file(s) ---`);
  for (const f of fixtures) {
    console.log(`  ${f.path.split(/[\\/]/).pop()} → org=${f.orgId.slice(-4)} (${f.questions.length} Q)`);
  }
  console.log('');

  let inserted = 0;
  let updated = 0;

  for (const fx of fixtures) {
    for (const q of fx.questions) {
      const { data: existing, error: selErr } = await sb
        .from('eval_questions')
        .select('id')
        .eq('organization_id', fx.orgId)
        .eq('slug', q.slug)
        .maybeSingle();
      if (selErr) {
        console.error(`✗ ${q.slug}@${fx.orgId.slice(-4)}: select failed — ${selErr.message}`);
        process.exit(1);
      }

      const row = {
        organization_id: fx.orgId,
        slug: q.slug,
        question: q.question,
        gold_answer: q.gold_answer,
        gold_facts: q.gold_facts,
        tags: q.tags,
        difficulty: q.difficulty,
        category: q.category ?? null,
        question_type: q.question_type ?? 'factual',
        expected_kind: q.expected_kind ?? null,
        must_not_contain: q.must_not_contain ?? [],
        ideal_source_filenames: q.ideal_source_filenames ?? [],
        conversation_history: q.conversation_history ?? [],
      };

      if (existing) {
        const { error: upErr } = await sb
          .from('eval_questions')
          .update(row)
          .eq('id', existing.id);
        if (upErr) {
          console.error(`✗ ${q.slug}@${fx.orgId.slice(-4)}: update failed — ${upErr.message}`);
          process.exit(1);
        }
        console.log(`  ↻ ${q.slug}@${fx.orgId.slice(-4)}`);
        updated++;
      } else {
        const { error: insErr } = await sb.from('eval_questions').insert(row);
        if (insErr) {
          console.error(`✗ ${q.slug}@${fx.orgId.slice(-4)}: insert failed — ${insErr.message}`);
          process.exit(1);
        }
        console.log(`  + ${q.slug}@${fx.orgId.slice(-4)}`);
        inserted++;
      }
    }
  }

  console.log(`\n✓ Seed klaar: ${inserted} nieuw, ${updated} ge-update.`);
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
