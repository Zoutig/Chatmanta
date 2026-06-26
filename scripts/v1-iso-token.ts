// Gedeeld isolatie-token — een los bestand ZONDER side-effects, zodat zowel de
// seed (v1-seed-chunks.ts) als het isolatie-script (v1-test-org-isolation.ts) het
// kunnen importeren zonder elkaars top-level main() te triggeren. Single source of
// truth: zou het token driften tussen de twee, dan zou de isolatie-test (a) vacuüm
// slagen (vals vertrouwen).
export const ISO_TOKEN = 'ZQXGEHEIM-ORG-B-VERTROUWELIJK';
