import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveJudgeModel } from '../eval-judge-model';

test('resolveJudgeModel — default gpt-4o', () => {
  assert.equal(resolveJudgeModel([], {}), 'gpt-4o');
});
test('resolveJudgeModel — CLI wint van env', () => {
  assert.equal(resolveJudgeModel(['--judge-model=gpt-6-sol'], { EVAL_JUDGE_MODEL: 'gpt-4o' }), 'gpt-6-sol');
});
test('resolveJudgeModel — env als geen CLI', () => {
  assert.equal(resolveJudgeModel([], { EVAL_JUDGE_MODEL: 'gpt-6-sol' }), 'gpt-6-sol');
});
test('resolveJudgeModel — onbekend model faalt hard (geen stille $0-kosten)', () => {
  assert.throws(() => resolveJudgeModel(['--judge-model=gpt-9'], {}), /onbekend judge-model/);
});
