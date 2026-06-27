import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V1_RAG_DEFAULTS, buildV1Persona } from '../rag-config';

test('V1_RAG_DEFAULTS heeft de PR-1-vlaggen goed', () => {
  assert.equal(V1_RAG_DEFAULTS.chatbotScoped, true, 'chatbotScoped moet true (V1)');
  assert.equal(V1_RAG_DEFAULTS.hybridSearch, false, 'hybridSearch uit (geen match_chunks_hybrid in 0002)');
  assert.equal(V1_RAG_DEFAULTS.parentDocumentRetrieval, true, 'parent-retrieval aan (RPC = _with_parents)');
  assert.equal(V1_RAG_DEFAULTS.cacheEnabled, true, 'cache aan (answer_cache live sinds PR-3a)');
  assert.equal(V1_RAG_DEFAULTS.sourceLinksEnabled, true, 'bronlinks aan (RPC geeft source_url uit metadata sinds PR-3b)');
  assert.equal(V1_RAG_DEFAULTS.generalKnowledgeEnabled, false, 'alleen-gegrond (anti-hallucinatie)');
  assert.equal(V1_RAG_DEFAULTS.similarityThreshold, 0.4, 'V0-empirie-drempel');
});

test('buildV1Persona vult alle 10 RagPersona-velden', () => {
  const p = buildV1Persona('Manta Bakkerij');
  const keys = [
    'company', 'companySuffix', 'audience', 'citationExample1', 'citationExample2',
    'smalltalkGreeting', 'smalltalkHelpScope', 'domainKeywords', 'generalKnowledgeClosing', 'offTopicScope',
  ] as const;
  for (const k of keys) {
    const v = p[k];
    // companySuffix mag '' zijn (geldig), de rest moet niet-leeg zijn.
    if (k === 'companySuffix') {
      assert.equal(typeof v, 'string', `persona.${k} moet string zijn`);
    } else {
      assert.ok(v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== ''), `persona.${k} ontbreekt/leeg`);
    }
  }
  assert.equal(p.company, 'Manta Bakkerij');
  assert.ok(Array.isArray(p.domainKeywords) && p.domainKeywords.length > 0);
});
