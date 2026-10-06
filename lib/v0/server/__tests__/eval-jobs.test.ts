import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJobs } from '../eval-jobs';

const qs = [{ id: 'q1' }, { id: 'q2' }];
test('buildJobs — default version-major (huidig gedrag)', () => {
  const j = buildJobs(qs, ['a', 'b'], 1, false).map((x) => `${x.question.id}@${x.botVersion}`);
  assert.deepEqual(j, ['q1@a', 'q2@a', 'q1@b', 'q2@b']);
});
test('buildJobs — interleave wisselt versies per vraag', () => {
  const j = buildJobs(qs, ['a', 'b'], 1, true).map((x) => `${x.question.id}@${x.botVersion}`);
  assert.deepEqual(j, ['q1@a', 'q1@b', 'q2@a', 'q2@b']);
});
test('buildJobs — runs vermenigvuldigt, interleave per run', () => {
  const j = buildJobs([{ id: 'q1' }], ['a', 'b'], 2, true).map((x) => `${x.botVersion}#${x.runIndex}`);
  assert.deepEqual(j, ['a#0', 'b#0', 'a#1', 'b#1']);
});
