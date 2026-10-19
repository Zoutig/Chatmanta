import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIERS } from '@/lib/site/pricing';
import { PricingPlans } from '../pricing-plans';

// SSR (en zonder JS) moet elk pakket als gewone kaart tonen: geen tabs, niets verborgen.
// De tab-modus (één kaart tegelijk) gaat pas aan ná hydratie op een smal scherm.
test('SSR rendert alle pakketkaarten zichtbaar en zonder tablist', () => {
  const html = renderToStaticMarkup(<PricingPlans />);
  const articles = html.match(/<article\b[^>]*>/g) ?? [];
  assert.equal(articles.length, TIERS.length);
  for (const a of articles) {
    assert.ok(!/\shidden(=|\s|>)/.test(a), `kaart verborgen in SSR: ${a}`);
    assert.ok(!a.includes('role="tabpanel"'), 'geen tabpanel zonder tabs');
  }
  assert.ok(!html.includes('role="tablist"'), 'geen tablist in SSR');
  for (const t of TIERS) {
    assert.ok(html.includes(`aria-labelledby="pn-${t.id}"`), `kaart ${t.id} gelabeld door zijn kop`);
  }
});
