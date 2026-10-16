// Rendert de beelden voor mails naar public/mail/ (3x, voor scherpe weergave):
//   logo.png        merkteken + "ChatManta" voor een LICHTE achtergrond
//   foto.png        rond portret van Sebastiaan voor de handtekening (bron: design/mail/portret.jpg)
// Mails kunnen geen SVG/CSS-masks of webfonts aan, dus het logo moet een PNG zijn.
// wordmark.png is ongeschikt: "Chat" is wit en verdwijnt als een mailprogramma
// de donkere achtergrond weglaat.
//
//   node scripts/mail-assets.mjs

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const out = join(root, 'public', 'mail');
mkdirSync(out, { recursive: true });
// data-URI: setContent draait op about:blank en mag geen file://-beelden laden.
const url = (p) => `data:image/png;base64,${readFileSync(join(root, p)).toString('base64')}`;

const page = (body) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent}#x{display:inline-block}</style></head><body>${body}</body></html>`;

const ASSETS = [
  {
    file: 'logo.png',
    html: page(`<div id="x" style="display:inline-flex;align-items:center;gap:9px;padding:2px;font-family:'Plus Jakarta Sans';font-weight:700;font-size:22px;letter-spacing:-0.02em;color:#0c1e2e;line-height:1">
      <span style="display:block;width:36px;aspect-ratio:270/148;background:#0d9488;-webkit-mask:url('${url('public/logo/mono-mark.png')}') center/contain no-repeat"></span>
      <span>Chat<span style="color:#0f766e">Manta</span></span></div>`),
  },
  {
    // Rond uitgesneden PNG met transparante hoeken: Outlook negeert border-radius.
    file: 'foto.png',
    html: page(`<div id="x" style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:url('${url('design/mail/portret.jpg').replace('image/png', 'image/jpeg')}') center/cover"></div>`),
  },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 3 });
const p = await ctx.newPage();
for (const a of ASSETS) {
  await p.setContent(a.html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.locator('#x').screenshot({ path: join(out, a.file), omitBackground: true });
  const box = await p.locator('#x').boundingBox();
  console.log(`✓ ${a.file}  ${Math.round(box.width)}×${Math.round(box.height)} css-px`);
}
await browser.close();
