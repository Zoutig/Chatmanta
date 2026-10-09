// Run: node --import tsx --test lib/v1/widget/__tests__/chat-history.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHistory, isRetryable, retryTarget, type ChatTurn } from '../chat-history';

const u = (id: string, content: string): ChatTurn => ({ id, role: 'user', content });
const a = (id: string, content: string, extra: Partial<ChatTurn> = {}): ChatTurn => ({
  id,
  role: 'assistant',
  content,
  ...extra,
});

test('cleanHistory: zonder fouten alles mee', () => {
  assert.deepEqual(cleanHistory([u('1', 'q1'), a('2', 'a1')]), [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
  ]);
});

test('cleanHistory: fout in het midden laat vraag én fout weg', () => {
  const turns = [u('1', 'q1'), a('2', 'oeps', { error: true }), u('3', 'q2'), a('4', 'a2')];
  assert.deepEqual(cleanHistory(turns), [
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: 'a2' },
  ]);
});

test('cleanHistory: lopend of leeg antwoord telt als mislukt', () => {
  assert.deepEqual(cleanHistory([u('1', 'q1'), a('2', '', { streaming: true })]), []);
  assert.deepEqual(cleanHistory([u('1', 'q1'), a('2', '  ')]), []);
});

test('cleanHistory: losse vraag zonder antwoord gaat niet mee', () => {
  assert.deepEqual(cleanHistory([u('1', 'wees'), u('2', 'q2'), a('3', 'a2')]), [
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: 'a2' },
  ]);
  assert.deepEqual(cleanHistory([u('1', 'q1'), a('2', 'a1'), u('3', 'wees')]), [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
  ]);
});

test('retryTarget: fout als laatste → vraag + schone geschiedenis ervoor', () => {
  const turns = [u('1', 'q1'), a('2', 'a1'), u('3', 'q2'), a('4', 'oeps', { error: true })];
  assert.deepEqual(retryTarget(turns, '4'), {
    question: 'q2',
    history: [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ],
  });
});

test('retryTarget: twee fouten op rij → alleen de laatste, eerdere fout niet in de geschiedenis', () => {
  const turns = [u('1', 'q1'), a('2', 'x', { error: true }), u('3', 'q2'), a('4', 'y', { error: true })];
  assert.equal(retryTarget(turns, '2'), null);
  assert.deepEqual(retryTarget(turns, '4'), { question: 'q2', history: [] });
});

test('retryTarget/isRetryable: geen fout of niet de laatste → niets', () => {
  const turns = [u('1', 'q1'), a('2', 'a1')];
  assert.equal(retryTarget(turns, '2'), null);
  assert.equal(isRetryable(turns, '2'), false);
  const withErr = [...turns, u('3', 'q2'), a('4', 'x', { error: true })];
  assert.equal(isRetryable(withErr, '4'), true);
  assert.equal(retryTarget(withErr, 'bestaat-niet'), null);
});
