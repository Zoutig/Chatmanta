// Run: node --import tsx --test app/v1/_ui/__tests__/button.test.tsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, buttonClass } from '../button';

test('buttonClass: standaard primary/md', () => {
  assert.equal(buttonClass(), 'v1-btn v1-btn--primary');
});

test('buttonClass: varianten, klein en blok', () => {
  assert.equal(
    buttonClass({ variant: 'secondary', size: 'sm', block: true }),
    'v1-btn v1-btn--secondary v1-btn--sm v1-btn--block',
  );
});

test('Button: type=button tenzij anders opgegeven', () => {
  assert.match(renderToStaticMarkup(<Button>Klik</Button>), /type="button"/);
  assert.match(renderToStaticMarkup(<Button type="submit">Ga</Button>), /type="submit"/);
});

test('Button loading: disabled, aria-busy en spinner', () => {
  const html = renderToStaticMarkup(<Button loading>Bezig</Button>);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /v1-spinner/);
});

test('Button: extra className wordt toegevoegd', () => {
  assert.match(renderToStaticMarkup(<Button className="x">a</Button>), /class="v1-btn v1-btn--primary x"/);
});
