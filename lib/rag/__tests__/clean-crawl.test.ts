import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCrawledMarkdown, dedupeSiteBoilerplate, foldHomoglyphs } from '../clean-crawl';

test('homoglyfen in gemengde woorden worden Latijn, echte Cyrillische tekst blijft', () => {
  assert.equal(foldHomoglyphs('rijbеwijs Vееnstra'), 'rijbewijs Veenstra');
  assert.equal(foldHomoglyphs('Москва'), 'Москва');
});
test('verminkte prijs en data-URI', () => {
  const out = cleanCrawledMarkdown('## €5 **9,-**\n\n![x](data:image/svg+xml,abc)\n\nThis field is for validation purposes and should be left unchanged.\n\n5/5 - (102 votes)');
  assert.equal(out, '## €59,-');
});
test('boilerplate-blok blijft alleen op thuispagina', () => {
  const blk = 'Pakket A kost 1265 euro voor tien lessen inclusief praktijkexamen.';
  const pages = ['home', 'tarieven', 'regio-a', 'regio-b', 'regio-c'].map((u) => ({ url: `https://x.nl/${u}`, title: u, markdown: `Uniek ${u} tekst die lang genoeg is om te tellen als blok.\n\n${blk}` }));
  const out = dedupeSiteBoilerplate(pages);
  assert.equal(out.filter((p) => p.markdown.includes('Pakket A')).length, 1);
  assert.ok(out.find((p) => p.url.endsWith('tarieven') || p.url.endsWith('home'))!.markdown.length > 0);
});
