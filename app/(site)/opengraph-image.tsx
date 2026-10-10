import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// OG-afbeelding voor de marketingsite (geldt voor `/` en alle (site)-subpagina's).
// Statisch gegenereerd tijdens de build. Let op: metadata-route-bestanden onder app/
// kunnen botsen (zie memory "metadata-route filename-collisie") — daarom alleen hier,
// in de (site)-groep, en geverifieerd met een echte `next build`.
//
// Lettertype: Plus Jakarta Sans (enige site-font). ImageResponse kan geen woff2 lezen,
// dus we halen tijdens de build een TTF-subset op bij Google Fonts. Lukt dat niet
// (offline build), dan valt hij terug op het standaardfont i.p.v. de build te breken.
// Logo: het echte mono-merkteken (wit op transparant) — op navy direct bruikbaar.

export const alt = 'ChatManta — je website beantwoordt elke klantvraag. Ook om 23:00.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const HEADLINE = 'Je website beantwoordt elke klantvraag.';
const ACCENT = 'Ook om 23:00.';
const SUB = 'De Nederlandse website-chatbot die alleen antwoordt uit jouw eigen website en documenten.';

async function loadJakarta(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function Image() {
  const allText = `ChatManta${HEADLINE}${ACCENT}${SUB}chatmanta.nl`;
  const [bold, regular, mark] = await Promise.all([
    loadJakarta(800, allText),
    loadJakarta(500, allText),
    readFile(join(process.cwd(), 'public/logo/mono-mark.png')),
  ]);
  const markSrc = `data:image/png;base64,${mark.toString('base64')}`;
  const fonts = [
    ...(bold ? [{ name: 'Jakarta', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Jakarta', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(160deg, #183a57 0%, #0c1e2e 55%, #08151f 100%)',
          color: '#dce8f1',
          fontFamily: fonts.length ? 'Jakarta' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={81} height={44} alt="" />
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: -1, color: '#ffffff' }}>
            Chat<span style={{ color: '#5eead4' }}>Manta</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -2,
              color: '#ffffff',
              maxWidth: 980,
            }}
          >
            <span>{HEADLINE}</span>
            <span style={{ color: '#5eead4' }}>{ACCENT}</span>
          </div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 30, fontWeight: 500, color: '#a9bccd', maxWidth: 900 }}>
            {SUB}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: '#99f6e4' }}>chatmanta.nl</div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
