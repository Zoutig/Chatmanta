// Run: node --import tsx --test lib/v1/widget/__tests__/widget-v1-loader.test.ts
// Draait public/widget-v1.js in een vm-sandbox met een minimale nep-DOM. Test het
// gedrag dat klantsites raakt: <body> nog null, vlag-volgorde, diagnose-warns,
// !important-stijlen en de apex↔www-tolerantie van de postMessage-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = readFileSync(join(process.cwd(), 'public', 'widget-v1.js'), 'utf8');

type Listener = (e: unknown) => void;

type FakeScript = { src: string; attrs: Record<string, string>; getAttribute(n: string): string | null };

function makeScript(src: string, attrs: Record<string, string>): FakeScript {
  return { src, attrs, getAttribute: (n) => (n in attrs ? attrs[n] : null) };
}

function setup(opts: { script?: FakeScript | null; fallback?: FakeScript | null; body?: boolean } = {}) {
  const warns: string[] = [];
  const winListeners: Record<string, Listener[]> = {};
  const docListeners: Record<string, Listener[]> = {};
  const posted: { msg: unknown; target: string }[] = [];
  const appended: unknown[] = [];
  const contentWindow = { postMessage: (msg: unknown, target: string) => posted.push({ msg, target }) };
  const styles: Record<string, { value: string; priority: string }> = {};
  const iframe = {
    title: '',
    src: '',
    contentWindow,
    style: {
      setProperty(p: string, v: string, prio: string) {
        styles[p] = { value: v, priority: prio };
      },
    },
    setAttribute() {},
    addEventListener() {},
  };
  const body = { appendChild: (n: unknown) => appended.push(n) };
  const document: Record<string, unknown> = {
    currentScript: opts.script === undefined ? makeScript('https://www.chatmanta.nl/widget-v1.js', { 'data-org': 'acme' }) : opts.script,
    body: opts.body === false ? null : body,
    querySelector: () => opts.fallback ?? null,
    createElement: () => iframe,
    addEventListener: (t: string, fn: Listener) => (docListeners[t] ??= []).push(fn),
  };
  const window: Record<string, unknown> = {
    location: { hostname: 'klant.nl', href: 'https://klant.nl/' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (t: string, fn: Listener) => (winListeners[t] ??= []).push(fn),
  };
  const ctx = vm.createContext({
    window,
    document,
    URL,
    console: { warn: (m: string) => warns.push(m), info() {}, log() {} },
  });
  const run = () => vm.runInContext(SRC, ctx);
  const fireMessage = (origin: string, data: unknown, source: unknown = contentWindow) =>
    (winListeners.message ?? []).forEach((fn) => fn({ origin, data, source }));
  return { run, warns, window, document, body, iframe, styles, posted, appended, docListeners, fireMessage };
}

test('loader blijft ES5-stijl (geen let/const/arrow/template/class)', () => {
  // Commentaar eruit, dan grof scannen op ES2015+-syntax (geen parser-dependency).
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\b(let|const|class)\s/);
  assert.doesNotMatch(code, /=>/);
  assert.doesNotMatch(code, /`/);
  assert.doesNotMatch(code, /,\s*\)/); // trailing comma in een call = ES2017
});

test('normaal pad: iframe direct gemount met juiste src, vlag gezet', () => {
  const s = setup();
  s.run();
  assert.equal(s.appended.length, 1);
  assert.equal(s.iframe.src, 'https://www.chatmanta.nl/embed-v1/acme?h=klant.nl');
  assert.equal(s.window.__chatmantaWidgetV1Loaded, true);
  assert.equal(s.warns.length, 0);
});

test('body nog null (head zonder defer / async): wacht op DOMContentLoaded', () => {
  const s = setup({ body: false });
  assert.doesNotThrow(() => s.run());
  assert.equal(s.appended.length, 0);
  assert.equal(s.docListeners.DOMContentLoaded?.length, 1);
  s.document.body = s.body;
  s.docListeners.DOMContentLoaded[0]({});
  assert.equal(s.appended.length, 1);
});

test('geen currentScript en geen fallback: warn, vlag NIET gezet', () => {
  const s = setup({ script: null, fallback: null });
  s.run();
  assert.equal(s.appended.length, 0);
  assert.equal(s.window.__chatmantaWidgetV1Loaded, undefined);
  assert.equal(s.warns.length, 1);
  assert.match(s.warns[0], /currentScript/);
});

test('geen currentScript maar wel de tag in de DOM: fallback werkt', () => {
  const s = setup({ script: null, fallback: makeScript('https://www.chatmanta.nl/widget-v1.js', { 'data-org': 'acme' }) });
  s.run();
  assert.equal(s.appended.length, 1);
});

test('ontbrekend data-org: warn, vlag NIET gezet (tweede correcte tag kan nog laden)', () => {
  const s = setup({ script: makeScript('https://www.chatmanta.nl/widget-v1.js', {}) });
  s.run();
  assert.equal(s.appended.length, 0);
  assert.equal(s.window.__chatmantaWidgetV1Loaded, undefined);
  assert.match(s.warns[0], /data-org/);
});

test('data-chatbot blijft werken (contract)', () => {
  const s = setup({ script: makeScript('https://www.chatmanta.nl/widget-v1.js', { 'data-chatbot': 'acme' }) });
  s.run();
  assert.equal(s.appended.length, 1);
});

test('tweede keer laden doet niets', () => {
  const s = setup();
  s.run();
  s.run();
  assert.equal(s.appended.length, 1);
});

test('stijlen staan op !important (host-CSS kan ze niet slopen)', () => {
  const s = setup();
  s.run();
  for (const p of ['position', 'width', 'height', 'max-width', 'bottom', 'right', 'z-index']) {
    assert.equal(s.styles[p]?.priority, 'important', p);
  }
  assert.equal(s.styles.position.value, 'fixed');
  assert.equal(s.styles['max-width'].value, 'none');
});

test('resize van de eigen origin past de maat aan', () => {
  const s = setup();
  s.run();
  s.fireMessage('https://www.chatmanta.nl', { type: 'chatmanta:resize', state: 'peek', side: 'bottom-left' });
  assert.equal(s.styles.height.value, '168px');
  assert.equal(s.styles.left.value, '0');
});

test('apex-code + redirect naar www: berichten van www worden geaccepteerd, host-state gaat naar www', () => {
  const s = setup({ script: makeScript('https://chatmanta.nl/widget-v1.js', { 'data-org': 'acme' }) });
  s.run();
  s.fireMessage('https://www.chatmanta.nl', { type: 'chatmanta:ready' });
  assert.equal(s.posted.length, 1);
  assert.equal(s.posted[0].target, 'https://www.chatmanta.nl');
  s.fireMessage('https://www.chatmanta.nl', { type: 'chatmanta:resize', state: 'open' });
  assert.equal(s.styles.width.value, 'min(480px, 100vw)');
});

test('vreemde origins blijven geweigerd', () => {
  const s = setup();
  s.run();
  for (const o of ['https://evil.nl', 'https://www.chatmanta.nl.evil.nl', 'http://www.chatmanta.nl', 'https://chatmanta.nl.evil.nl']) {
    s.fireMessage(o, { type: 'chatmanta:resize', state: 'open' });
  }
  assert.equal(s.styles.width.value, '110px');
});

test('bericht van een andere frame op de eigen origin wordt genegeerd', () => {
  const s = setup();
  s.run();
  s.fireMessage('https://www.chatmanta.nl', { type: 'chatmanta:resize', state: 'open' }, { other: true });
  assert.equal(s.styles.width.value, '110px');
});

test('localhost: geen www-variant', () => {
  const s = setup({ script: makeScript('http://localhost:3000/widget-v1.js', { 'data-org': 'acme' }) });
  s.run();
  s.fireMessage('http://www.localhost:3000', { type: 'chatmanta:resize', state: 'open' });
  assert.equal(s.styles.width.value, '110px');
  s.fireMessage('http://localhost:3000', { type: 'chatmanta:resize', state: 'open' });
  assert.equal(s.styles.width.value, 'min(480px, 100vw)');
});
