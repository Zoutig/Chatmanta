import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QA_NOT_LEARNED, runQAUpsert, type QAUpsertDeps } from '../qa-upsert-core';

function fakeDeps(over: Partial<{ oldDoc: string | null; ingest: string | null; saveError: string | null }> = {}) {
  const calls: string[] = [];
  const deps: QAUpsertDeps = {
    readOldDocId: async () => {
      calls.push('read');
      return over.oldDoc === undefined ? 'old-doc' : over.oldDoc;
    },
    ingest: async () => {
      calls.push('ingest');
      return over.ingest === undefined ? 'new-doc' : over.ingest;
    },
    saveRow: async (docId) => {
      calls.push(`save:${docId}`);
      return over.saveError ?? null;
    },
    retire: async (docId) => {
      calls.push(`retire:${docId}`);
    },
  };
  return { deps, calls };
}

test('bewerken: oude document pas na geslaagde opslag uitgezet', async () => {
  const { deps, calls } = fakeDeps();
  const res = await runQAUpsert({ isUpdate: true, active: true }, deps);
  assert.deepEqual(calls, ['read', 'ingest', 'save:new-doc', 'retire:old-doc']);
  assert.deepEqual(res, { newDocId: 'new-doc', notIngested: false });
});

test('bewerken + mislukte ingest: niets opgeslagen, niets uitgezet', async () => {
  const { deps, calls } = fakeDeps({ ingest: null });
  await assert.rejects(runQAUpsert({ isUpdate: true, active: true }, deps), new RegExp(QA_NOT_LEARNED.slice(0, 20)));
  assert.deepEqual(calls, ['read', 'ingest']);
});

test('opslag-fout: nieuw document weer uitgezet, oude blijft staan', async () => {
  const { deps, calls } = fakeDeps({ saveError: 'org_qa_items update: kapot' });
  await assert.rejects(runQAUpsert({ isUpdate: true, active: true }, deps), /kapot/);
  assert.deepEqual(calls, ['read', 'ingest', 'save:new-doc', 'retire:new-doc']);
});

test('nieuw item + mislukte ingest: rij bewaard, notIngested', async () => {
  const { deps, calls } = fakeDeps({ ingest: null });
  const res = await runQAUpsert({ isUpdate: false, active: true }, deps);
  assert.deepEqual(calls, ['ingest', 'save:null']);
  assert.deepEqual(res, { newDocId: null, notIngested: true });
});

test('uitzetten via bewerken: geen ingest, oude document uitgezet na opslag', async () => {
  const { deps, calls } = fakeDeps();
  const res = await runQAUpsert({ isUpdate: true, active: false }, deps);
  assert.deepEqual(calls, ['read', 'save:null', 'retire:old-doc']);
  assert.equal(res.notIngested, false);
});

test('nieuw item, opslag-fout: nieuw document opgeruimd', async () => {
  const { deps, calls } = fakeDeps({ saveError: 'org_qa_items insert: kapot' });
  await assert.rejects(runQAUpsert({ isUpdate: false, active: true }, deps), /insert/);
  assert.deepEqual(calls, ['ingest', 'save:new-doc', 'retire:new-doc']);
});
