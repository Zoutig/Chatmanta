// V0 eval seed runner — leest eval-fixtures/seed-questions.json en upsert
// elke rij in public.eval_questions via service-role.
//
// Idempotent op (organization_id, slug). Re-runs zijn safe: bestaande rijen
// worden ge-update met nieuwe gold_answer/gold_facts/tags/difficulty.
//
// Usage:
//   npm run eval:seed

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

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
  _meta?: Record<string, unknown>;
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

const fixturePath = resolve('eval-fixtures/seed-questions.json');
let parsed: SeedFile;
try {
  const raw = readFileSync(fixturePath, 'utf8');
  parsed = JSON.parse(raw) as SeedFile;
} catch (err) {
  fail(`Kan ${fixturePath} niet lezen/parsen: ${err instanceof Error ? err.message : String(err)}`);
}

if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
  fail('seed-questions.json bevat geen `questions` array of is leeg.');
}

// Validate elk record. Strikt: faal vroeg met een duidelijke error.
const seenSlugs = new Set<string>();
for (const q of parsed.questions) {
  if (!q.slug || typeof q.slug !== 'string') fail(`Question zonder slug: ${JSON.stringify(q).slice(0, 120)}`);
  if (seenSlugs.has(q.slug)) fail(`Dubbele slug: ${q.slug}`);
  seenSlugs.add(q.slug);
  if (!q.question?.trim()) fail(`slug=${q.slug}: question is leeg`);
  if (!q.gold_answer?.trim()) fail(`slug=${q.slug}: gold_answer is leeg`);
  if (!Array.isArray(q.gold_facts)) fail(`slug=${q.slug}: gold_facts moet een array zijn`);
  if (!Array.isArray(q.tags)) fail(`slug=${q.slug}: tags moet een array zijn`);
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
    fail(`slug=${q.slug}: difficulty moet easy|medium|hard zijn (kreeg "${q.difficulty}")`);
  }
  if (q.question_type !== undefined && !VALID_QUESTION_TYPES.has(q.question_type)) {
    fail(`slug=${q.slug}: question_type onbekend: "${q.question_type}"`);
  }
  if (q.expected_kind !== undefined && q.expected_kind !== null && !VALID_EXPECTED_KINDS.has(q.expected_kind)) {
    fail(`slug=${q.slug}: expected_kind moet answer|fallback|smalltalk|null zijn`);
  }
  if (q.must_not_contain !== undefined && !Array.isArray(q.must_not_contain)) {
    fail(`slug=${q.slug}: must_not_contain moet een array zijn`);
  }
  if (q.ideal_source_filenames !== undefined && !Array.isArray(q.ideal_source_filenames)) {
    fail(`slug=${q.slug}: ideal_source_filenames moet een array zijn`);
  }
  if (q.conversation_history !== undefined) {
    if (!Array.isArray(q.conversation_history)) {
      fail(`slug=${q.slug}: conversation_history moet een array zijn`);
    }
    for (const [i, turn] of q.conversation_history.entries()) {
      if (!turn || typeof turn !== 'object') fail(`slug=${q.slug}: conversation_history[${i}] is geen object`);
      if (turn.role !== 'user' && turn.role !== 'assistant') {
        fail(`slug=${q.slug}: conversation_history[${i}].role moet user|assistant zijn`);
      }
      if (typeof turn.content !== 'string' || !turn.content.trim()) {
        fail(`slug=${q.slug}: conversation_history[${i}].content moet niet-lege string zijn`);
      }
    }
  }
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`--- Seed eval_questions: ${parsed.questions.length} entries (org=${DEV_ORG_ID}) ---`);

  let inserted = 0;
  let updated = 0;
  for (const q of parsed.questions) {
    const { data: existing, error: selErr } = await sb
      .from('eval_questions')
      .select('id')
      .eq('organization_id', DEV_ORG_ID)
      .eq('slug', q.slug)
      .maybeSingle();
    if (selErr) {
      console.error(`✗ ${q.slug}: select failed — ${selErr.message}`);
      process.exit(1);
    }

    const row = {
      organization_id: DEV_ORG_ID,
      slug: q.slug,
      question: q.question,
      gold_answer: q.gold_answer,
      gold_facts: q.gold_facts,
      tags: q.tags,
      difficulty: q.difficulty,
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
        console.error(`✗ ${q.slug}: update failed — ${upErr.message}`);
        process.exit(1);
      }
      console.log(`  ↻ ${q.slug}`);
      updated++;
    } else {
      const { error: insErr } = await sb.from('eval_questions').insert(row);
      if (insErr) {
        console.error(`✗ ${q.slug}: insert failed — ${insErr.message}`);
        process.exit(1);
      }
      console.log(`  + ${q.slug}`);
      inserted++;
    }
  }

  console.log(`\n✓ Seed klaar: ${inserted} nieuw, ${updated} ge-update.`);
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
