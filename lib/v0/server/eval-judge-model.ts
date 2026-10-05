// Judge-model voor de V0-eval. Default gpt-4o (historische baseline). Override via
// `--judge-model=<id>` of env EVAL_JUDGE_MODEL. Alleen modellen met een tarief in
// MODEL_COSTS_USD — anders zou judge-cost stil 0 loggen.
import { MODEL_COSTS_USD } from '@/lib/ai/llm';

export const DEFAULT_JUDGE_MODEL = 'gpt-4o';

export function resolveJudgeModel(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string {
  const cli = argv.map((a) => a.match(/^--judge-model=(.+)$/)?.[1]).find(Boolean);
  const model = cli ?? env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  if (!(Object.hasOwn(MODEL_COSTS_USD, model) && model.startsWith('gpt-'))) {
    throw new Error(
      `onbekend judge-model "${model}" — moet een OpenAI-model (gpt-*) zijn met een tarief in MODEL_COSTS_USD`,
    );
  }
  return model;
}

/** Eén keer per proces geresolved (eval.ts + runner lezen dezelfde waarde). */
export const JUDGE_MODEL = resolveJudgeModel(process.argv.slice(2), process.env);
