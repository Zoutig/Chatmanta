import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSampleText,
  chatJsonBody,
  chatJsonWith,
  isHomepage,
  parseDerive,
  parseGeneratedQuestions,
  pickSampleDocs,
  verdictFor,
  type ChatClient,
  type SampleDoc,
} from '../analysis-core';

const FIXED = [
  { key: 'diensten', label: 'Diensten & producten', probe: 'x' },
  { key: 'prijzen', label: 'Prijzen & tarieven', probe: 'x' },
  { key: 'contact', label: 'Contactgegevens', probe: 'x' },
];

test('verdictFor — drempels per indexversie', () => {
  assert.equal(verdictFor(null, 'v2'), 'ontbreekt');
  assert.equal(verdictFor(0.3, 'v2'), 'ontbreekt');
  assert.equal(verdictFor(0.37, 'v2'), 'zwak');
  assert.equal(verdictFor(0.5, 'v2'), 'gedekt');
  assert.equal(verdictFor(0.5, 'v1'), 'zwak');
  assert.equal(verdictFor(0.55, 'v1'), 'gedekt');
});

test('chatJsonBody — gpt-4o-mini houdt temperature + max_tokens (byte-identiek)', () => {
  const body = chatJsonBody({ model: 'gpt-4o-mini', system: 's', user: 'u', temperature: 0.2, maxTokens: 600 });
  assert.equal(body.temperature, 0.2);
  assert.equal(body.max_tokens, 600);
  assert.equal('max_completion_tokens' in body, false);
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('chatJsonBody — GPT-6 krijgt max_completion_tokens i.p.v. max_tokens', () => {
  const body = chatJsonBody({ model: 'gpt-6-luna', system: 's', user: 'u', temperature: 0.4, maxTokens: 2500 });
  assert.equal(body.max_completion_tokens, 2500);
  assert.equal('max_tokens' in body, false);
});

function fakeClient(content: string, capture: Record<string, unknown>[] = []): ChatClient {
  return {
    chat: {
      completions: {
        create: async (b) => {
          capture.push(b);
          return { choices: [{ message: { content } }], usage: { prompt_tokens: 11, completion_tokens: 7 } };
        },
      },
    },
  };
}

test('chatJsonWith — parseert JSON en telt tokens (OpenAI gemockt)', async () => {
  const seen: Record<string, unknown>[] = [];
  const r = await chatJsonWith<{ a: number }>(fakeClient('{"a":1}', seen), {
    model: 'gpt-4o-mini',
    system: 'sys',
    user: 'usr',
    temperature: 0,
    maxTokens: 10,
  });
  assert.deepEqual(r, { data: { a: 1 }, inputTokens: 11, outputTokens: 7 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].model, 'gpt-4o-mini');
});

test('chatJsonWith — ongeldige JSON → data null (geen throw)', async () => {
  const r = await chatJsonWith(fakeClient('geen json'), {
    model: 'gpt-4o-mini',
    system: '',
    user: '',
    temperature: 0,
    maxTokens: 10,
  });
  assert.equal(r.data, null);
});

const doc = (id: string, meta: Record<string, unknown> | null = null): SampleDoc => ({ id, filename: `${id}.txt`, metadata: meta });

test('isHomepage — root-URL en varianten', () => {
  assert.equal(isHomepage(doc('a', { source_url: 'https://voorbeeld.nl/' })), true);
  assert.equal(isHomepage(doc('a', { source_url: 'https://voorbeeld.nl' })), true);
  assert.equal(isHomepage(doc('a', { source_url: 'https://voorbeeld.nl/nl/' })), true);
  assert.equal(isHomepage(doc('a', { source_url: 'https://voorbeeld.nl/prijzen' })), false);
  assert.equal(isHomepage(doc('a', null)), false);
  assert.equal(isHomepage(doc('a', { source_url: 'geen url' })), false);
});

test('pickSampleDocs — homepage eerst, dan gespreid over de hele lijst, Q&A/quiz achteraan', () => {
  const pages = Array.from({ length: 50 }, (_, i) => doc(`p${i}`, { source_url: `https://x.nl/p${i}` }));
  const home = doc('home', { source_url: 'https://x.nl/' });
  const qa = doc('qa', { origin: 'manual_qa' });
  const all = [qa, ...pages.slice(0, 25), home, ...pages.slice(25)];
  const picked = pickSampleDocs(all, 12);
  assert.equal(picked.length, 12);
  assert.equal(picked[0].id, 'home');
  assert.ok(!picked.some((d) => d.id === 'qa'), 'Q&A niet mee als de pagina\'s de ruimte vullen');
  // Gespreid: ook pagina's uit het laatste deel van de lijst.
  assert.ok(picked.some((d) => Number(d.id.slice(1)) >= 40), 'ook late pagina\'s in de steekproef');
  assert.equal(new Set(picked.map((d) => d.id)).size, 12, 'geen dubbelen');
});

test('pickSampleDocs — kleine kennisbank: alles mee, quiz/Q&A vullen aan', () => {
  const picked = pickSampleDocs([doc('a'), doc('q', { origin: 'quiz' }), doc('b')], 12);
  assert.deepEqual(picked.map((d) => d.id), ['a', 'b', 'q']);
  assert.deepEqual(pickSampleDocs([doc('a')], 0), []);
});

test('buildSampleText — per-document- en totaallimiet, lege documenten overgeslagen', () => {
  const docs = [doc('a'), doc('b'), doc('c')];
  const text = new Map([
    ['a', ['intro a', 'verder a']],
    ['b', ['   ']],
    ['c', ['x'.repeat(50)]],
  ]);
  const out = buildSampleText(docs, text, { perDocChars: 20, maxChars: 1000 });
  assert.ok(out.startsWith('### a.txt\nintro a\nverder a'));
  assert.ok(!out.includes('b.txt'));
  assert.ok(out.includes('### c.txt\n' + 'x'.repeat(20)));
  const capped = buildSampleText(docs, text, { perDocChars: 20, maxChars: 30 });
  assert.ok(!capped.includes('c.txt'), 'totaallimiet stopt de opbouw');
});

test('parseDerive — context + max 4 dynamische categorieën, vaste overgeslagen', () => {
  const r = parseDerive(
    {
      branche: ' fysiotherapie ',
      extra_categorieen: [
        { label: 'Prijzen', zoekzin: 'x' }, // overlapt vaste categorie
        { label: 'Vergoeding', zoekzin: 'Wordt het vergoed?' },
        { label: '', zoekzin: 'leeg label' },
        { label: 'Verwijzing', zoekzin: 'Is een verwijzing nodig?' },
        { label: 'Behandelingen', zoekzin: 'Welke behandelingen?' },
        { label: 'Parkeren', zoekzin: 'Waar parkeren?' },
        { label: 'Wachttijd', zoekzin: 'Hoe lang wachten?' },
      ],
    },
    FIXED,
  );
  assert.equal(r.context.branche, 'fysiotherapie');
  assert.equal(r.context.doelgroep, undefined);
  assert.deepEqual(r.dynamicCategories.map((c) => c.label), ['Vergoeding', 'Verwijzing', 'Behandelingen', 'Parkeren']);
  assert.deepEqual(parseDerive(null, FIXED).dynamicCategories, []);
});

test('parseGeneratedQuestions — max, lege vragen weg, meerkeuze zonder opties wordt open', () => {
  const qs = parseGeneratedQuestions(
    {
      vragen: [
        { vraag: 'Wat kost een behandeling?', type: 'open', categorie: 'prijzen' },
        { vraag: '  ', type: 'open' },
        { vraag: 'Welke betaalmethoden?', type: 'meerkeuze', opties: ['iDEAL', '', 'Contant'] },
        { vraag: 'Meerkeuze zonder opties', type: 'meerkeuze', opties: [] },
      ],
    },
    20,
  );
  assert.equal(qs.length, 3);
  assert.equal(qs[0].categorie, 'prijzen');
  assert.equal(qs[0].bron, 'ai');
  assert.deepEqual(qs[1].opties, ['iDEAL', 'Contant']);
  assert.equal(qs[1].type, 'meerkeuze');
  assert.equal(qs[2].type, 'open');
  assert.equal(qs[2].opties, null);
  assert.equal(qs[2].categorie, 'overig');

  const many = parseGeneratedQuestions({ vragen: Array.from({ length: 30 }, (_, i) => ({ vraag: `v${i}` })) }, 20);
  assert.equal(many.length, 20);
  assert.deepEqual(parseGeneratedQuestions(null, 20), []);
});
