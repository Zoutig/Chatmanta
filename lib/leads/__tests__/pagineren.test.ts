import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leesAllePaginas, LEES_PAGINA } from '../pagineren';

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
