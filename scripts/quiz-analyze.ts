// Quiz M2 — handmatige end-to-end test van de hybride kennisbank-analyse-engine.
//
//   npm run quiz:analyze                  (default: eerste KNOWN_ORG met docs)
//   npm run quiz:analyze acme-corp        (specifieke org, model gpt-4o-mini)
//   npm run quiz:analyze acme-corp gpt-4o (specifiek model)
//
// Annuleert een bestaande niet-geannuleerde quiz voor de org (maakt het
// UNIQUE-slot vrij voor een herhaalbare test), maakt een nieuwe quiz, draait de
// 3-lagen-analyse en print de gegenereerde vragen + bedrijfscontext + kosten.
// Bedoeld voor dev-validatie, niet voor productie.

import { resolveOrgIdFromSlug, listKnownOrgs } from '../lib/v0/server/active-org';
import { listDocs } from '../lib/v0/server/rag';
import {
  createQuiz,
  getActiveQuizForOrg,
  listQuestions,
  setQuizStatus,
} from '../lib/controlroom/server/quiz';
import { analyzeKnowledgeBase } from '../lib/controlroom/server/quiz-analysis';
import type { QuizAnalyseModel } from '../lib/controlroom/types';

async function pickOrg(arg?: string): Promise<{ slug: string; id: string }> {
  if (arg) {
    const id = resolveOrgIdFromSlug(arg);
    if (!id) throw new Error(`Onbekende org-slug: ${arg}`);
    return { slug: arg, id };
  }
  for (const org of listKnownOrgs()) {
    const docs = await listDocs(org.id);
    if (docs.length > 0) return { slug: org.slug, id: org.id };
  }
  throw new Error('Geen KNOWN_ORG met documenten gevonden — geef expliciet een slug op.');
}

async function main(): Promise<void> {
  const slugArg = process.argv[2];
  const modelArg: QuizAnalyseModel = process.argv[3] === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini';
  const { slug, id: orgId } = await pickOrg(slugArg);

  const docs = await listDocs(orgId);
  console.log(`\n=== Quiz-analyse — org '${slug}' (${orgId}) — ${docs.length} documenten — model ${modelArg} ===\n`);
  if (docs.length === 0) {
    console.log('Kennisbank is leeg — niets te analyseren.');
    return;
  }

  const existing = await getActiveQuizForOrg(orgId);
  if (existing) {
    console.log(`Bestaande quiz (${existing.status}) gevonden → annuleren voor een schone test.`);
    await setQuizStatus(existing.id, 'geannuleerd');
  }

  const quiz = await createQuiz({ organizationId: orgId, analyseModel: modelArg });
  console.log(`Quiz aangemaakt: ${quiz.id} (status ${quiz.status})\n`);

  const t0 = Date.now();
  const summary = await analyzeKnowledgeBase({ quizId: quiz.id, organizationId: orgId, model: modelArg });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`--- Resultaat (${seconds}s) ---`);
  console.log(`status:           ${summary.status}`);
  console.log(`vragen:           ${summary.questionCount}`);
  console.log(`analyse-kosten:   $${summary.analyseCostUsd.toFixed(5)}`);
  console.log(`generatie-kosten: $${summary.generationCostUsd.toFixed(5)}`);

  const final = await getActiveQuizForOrg(orgId);
  console.log('\nbedrijfscontext:');
  console.log(JSON.stringify(final?.bedrijfscontext, null, 2));

  const questions = await listQuestions(quiz.id);
  console.log(`\n--- ${questions.length} gegenereerde vragen ---`);
  for (const q of questions) {
    console.log(`\n[${q.categorieLabel ?? q.categorie}] (${q.type})`);
    if (q.context) console.log(`  context: ${q.context}`);
    console.log(`  vraag:   ${q.vraag}`);
    if (q.opties && q.opties.length > 0) console.log(`  opties:  ${q.opties.join(' | ')}`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('FOUT:', e);
  process.exit(1);
});
