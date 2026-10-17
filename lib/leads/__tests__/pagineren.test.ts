import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leesAllePaginas, LEES_PAGINA, eerste, begrensPagina, enkel, verdeelPagina } from '../pagineren';

function bron(n: number) {
  const rijen = Array.from({ length: n }, (_, i) => i);
  const vragen: [number, number][] = [];
  const haal = async (van: number, tot: number) => {
    vragen.push([van, tot]);
    return rijen.slice(van, tot + 1);
  };
  return { haal, vragen };
}

test('leesAllePaginas leest door voorbij max_rows', async () => {
  const { haal, vragen } = bron(2 * LEES_PAGINA + 387);
  const alles = await leesAllePaginas(haal);
  assert.equal(alles.length, 2 * LEES_PAGINA + 387);
  assert.deepEqual(vragen, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test('leesAllePaginas stopt na een leeg blok bij een veelvoud van de paginagrootte', async () => {
  const { haal, vragen } = bron(LEES_PAGINA);
  assert.equal((await leesAllePaginas(haal)).length, LEES_PAGINA);
  assert.equal(vragen.length, 2);
});

test('leesAllePaginas: lege tabel', async () => {
  const { haal } = bron(0);
  assert.deepEqual(await leesAllePaginas(haal), []);
});

test('leesAllePaginas geeft een fout van haal door', async () => {
  await assert.rejects(leesAllePaginas(async () => Promise.reject(new Error('stuk'))), /stuk/);
});

test('eerste neemt bij een array de eerste waarde', () => {
  assert.equal(eerste(undefined), undefined);
  assert.equal(eerste('a'), 'a');
  assert.equal(eerste(['a', 'b']), 'a');
  assert.equal(eerste([]), undefined);
});

test('begrensPagina houdt de pagina binnen 1..aantal pagina\'s', () => {
  assert.equal(begrensPagina(1, 0, 50), 1);
  assert.equal(begrensPagina(5, 0, 50), 1);
  assert.equal(begrensPagina(0, 120, 50), 1);
  assert.equal(begrensPagina(-3, 120, 50), 1);
  assert.equal(begrensPagina(2, 120, 50), 2);
  assert.equal(begrensPagina(99, 120, 50), 3);
  assert.equal(begrensPagina(3, 100, 50), 2);
  assert.equal(begrensPagina(Number.NaN, 100, 50), 1);
});

test('enkel maakt van elke queryparameter een losse string', () => {
  assert.deepEqual(enkel({ q: ['a', 'b'], tab: 'opvolgen', p: undefined }), { q: 'a', tab: 'opvolgen', p: undefined });
});

test('verdeelPagina verdeelt een pagina over twee groepen', () => {
  assert.deepEqual(verdeelPagina(0, 50, 10), { eerste: [0, 9], tweede: [0, 39] });
  assert.deepEqual(verdeelPagina(0, 50, 0), { eerste: null, tweede: [0, 49] });
  assert.deepEqual(verdeelPagina(0, 50, 50), { eerste: [0, 49], tweede: null });
  assert.deepEqual(verdeelPagina(0, 50, 70), { eerste: [0, 49], tweede: null });
  assert.deepEqual(verdeelPagina(50, 50, 70), { eerste: [50, 69], tweede: [0, 29] });
  assert.deepEqual(verdeelPagina(100, 50, 70), { eerste: null, tweede: [30, 79] });
});
