// Contrast-helper voor de widget. Eén bron voor "welke tekstkleur leest op
// een willekeurige merk-achtergrond" — eerder stond dit gedupliceerd in
// chatmanta-widget.tsx, thread-drawer.tsx en fake-site.tsx (elk met een
// luminantie-drempel van 50%, wat tegen midden-grijzen WCAG AA kan falen).
//
// Deze versie kiest tussen (bijna-)zwart en wit op basis van de echte
// WCAG-contrastratio i.p.v. een vaste drempel: we pakken de variant met de
// hoogste ratio, wat per definitie de best leesbare is.

const DARK = '#0a0a0a';
const LIGHT = '#ffffff';

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Relatieve luminantie per WCAG 2.x (sRGB → lineair).
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const L_DARK = relativeLuminance(10, 10, 10); // #0a0a0a
const L_LIGHT = relativeLuminance(255, 255, 255); // #ffffff

/**
 * Beste voorgrond-tekstkleur (#0a0a0a of #ffffff) op een hex-achtergrond.
 * Kiest de variant met de hoogste WCAG-contrastratio. Onparseerbare input →
 * donker (matcht het oude default-gedrag).
 */
export function bestForegroundOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return DARK;
  const bg = relativeLuminance(rgb[0], rgb[1], rgb[2]);
  const darkContrast = contrastRatio(L_DARK, bg);
  const lightContrast = contrastRatio(L_LIGHT, bg);
  return lightContrast > darkContrast ? LIGHT : DARK;
}
