// Upsert de x7-vragen (eval-out/launch/x7q/*.json) in eval_questions. Idempotent op (organization_id, slug).
// Usage: node --env-file=.env.local eval-out/launch/x7q/seed-x7q.cjs [--apply]
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs'); const path = require('path');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const dir = path.join(__dirname); // eval-fixtures/x7 (bron: eval-out/launch/x7q)
const TYPES = new Set(['factual', 'multi_hop', 'out_of_corpus', 'false_premise', 'prompt_injection', 'typo', 'planted_fact', 'smalltalk', 'ambiguous']);
const KINDS = new Set(['answer', 'fallback', 'smalltalk']);
const apply = process.argv.includes('--apply');
(async () => {
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const q of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (!/^(h2|x7s)-/.test(q.slug)) throw new Error(`${f}: slug ${q.slug}`);
      if (!TYPES.has(q.question_type)) throw new Error(`${q.slug}: question_type ${q.question_type}`);
      if (!KINDS.has(q.expected_kind)) throw new Error(`${q.slug}: expected_kind ${q.expected_kind}`);
      rows.push({
        organization_id: q.organization_id, slug: q.slug, question: q.question, gold_answer: q.gold_answer ?? null,
        gold_facts: q.gold_facts ?? [], tags: q.tags ?? [], difficulty: q.difficulty ?? 'medium', category: q.category ?? 'search',
        conversation_history: q.conversation_history ?? [], expected_kind: q.expected_kind, must_not_contain: q.must_not_contain ?? [],
        ideal_source_filenames: q.ideal_source_filenames ?? [], question_type: q.question_type,
      });
    }
  }
  const slugs = rows.map((r) => r.slug); if (new Set(slugs).size !== slugs.length) throw new Error('dubbele slugs');
  const h = rows.filter((r) => r.slug.startsWith('h2-')); const s = rows.filter((r) => r.slug.startsWith('x7s-'));
  console.log({ total: rows.length, holdout2: h.length, stress: s.length, apply });
  fs.writeFileSync(path.join(dir, 'holdout2-slugs.txt'), h.map((r) => r.slug).join(','));
  fs.writeFileSync(path.join(dir, 'stress-slugs.txt'), s.map((r) => r.slug).join(','));
  if (!apply) return;
  const { error } = await sb.from('eval_questions').upsert(rows, { onConflict: 'organization_id,slug' });
  if (error) throw error;
  console.log('upserted', rows.length);
})();
