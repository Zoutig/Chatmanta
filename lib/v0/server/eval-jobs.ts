// Pure job-ordering voor eval:run. Interleave = per vraag alle versies direct na
// elkaar, zodat OpenAI-latency-schommelingen over de dag beide versies gelijk
// raken (eerlijke TTFT-vergelijking).
export type EvalJob<Q> = { question: Q; botVersion: string; runIndex: number };

export function buildJobs<Q>(
  questions: readonly Q[],
  versions: readonly string[],
  runs: number,
  interleave: boolean,
): EvalJob<Q>[] {
  const jobs: EvalJob<Q>[] = [];
  if (interleave) {
    for (let r = 0; r < runs; r++)
      for (const q of questions)
        for (const v of versions) jobs.push({ question: q, botVersion: v, runIndex: r });
    return jobs;
  }
  for (const v of versions)
    for (const q of questions)
      for (let r = 0; r < runs; r++) jobs.push({ question: q, botVersion: v, runIndex: r });
  return jobs;
}
