import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RagConfig, RagPersona } from '../types';

test('RagConfig carries the engine knobs + chatbotScoped', () => {
  const cfg: Pick<RagConfig, 'chatbotScoped' | 'similarityThreshold' | 'hybridSearch' | 'parentDocumentRetrieval' | 'chatModel'> = {
    chatbotScoped: false,
    similarityThreshold: 0.4,
    hybridSearch: false,
    parentDocumentRetrieval: true,
    chatModel: 'gpt-4o-mini',
  };
  assert.equal(cfg.chatbotScoped, false);
  assert.equal(cfg.similarityThreshold, 0.4);
});

test('RagPersona is importable from lib/rag/types', () => {
  const p: Partial<RagPersona> = {};
  assert.equal(typeof p, 'object');
});
