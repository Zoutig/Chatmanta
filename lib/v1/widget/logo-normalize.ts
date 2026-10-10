// Eigen logo voor de chatknop: één keer bij het uploaden, in de browser, omzetten
// naar een vierkant PNG van 112×112 dat als volle cirkel in de knop (56 px, 2×
// retina) en in de kop van het venster staat.
//
// Waarom: een ruw logo in de knop zag er vaak slecht uit (feedback Niels, okt 2026).
// Een JPG met witte achtergrond werd een wit vierkantje op de accentkleur, brede
// logo's en bestanden met veel lege rand werden piepklein, en een donker logo viel
// weg op een donkere accentkleur.
//
// Wat het doet:
//  1. lege randen wegknippen (transparant, of de effen achtergrondkleur van het logo);
//  2. achtergrond kiezen: de eigen effen achtergrond van het logo; bij een transparant
//     logo wit, of donker als het logo zelf licht is (wit logo);
//  3. het logo zo groot mogelijk binnen de cirkel passen, met een veilige rand;
//  4. een foto (geen effen of transparante achtergrond) vult de cirkel helemaal.
//
// De accentkleur wordt bewust NIET in het PNG gebakken: die kan de klant later
// wijzigen zonder opnieuw te uploaden.
//
// `analyzeLogoPixels` en `planLogoLayout` zijn puur (unit-testbaar in node);
// `normalizeLogoFile` gebruikt browser-API's (Image, canvas) en draait alleen client-side.

export const LOGO_OUTPUT_PX = 112;
/** Bovengrens voor het bronbestand. Ruim, want het resultaat is altijd klein. */
export const MAX_LOGO_SOURCE_BYTES = 15 * 1024 * 1024;
export const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Hoeken van het logo-kader liggen op deze fractie van de straal: ruimte tot de rand. */
const SAFE_RADIUS = 0.82;
/** Alpha onder deze waarde telt als transparant. */
const ALPHA_MIN = 24;
/** Som van |ΔR|+|ΔG|+|ΔB| waaronder twee kleuren "gelijk" zijn. */
const COLOR_TOLERANCE = 36;
/** Breder dan dit (of smaller dan 1/dit) wordt het logo klein: melding tonen. */
const MAX_ASPECT = 2.2;
/** Werkformaat voor de analyse; grote foto's worden eerst hiernaar verkleind. */
const WORK_PX = 512;
/** Eerste stap vanaf de bron: nooit een tussencanvas groter dan dit (geheugen). */
const FIRST_STEP_MAX_PX = 2048;
/** Boven dit aantal pixels weigeren: decoderen alleen al kost dan honderden MB. */
const MAX_SOURCE_PIXELS = 100_000_000;

export const LIGHT_BG = '#FFFFFF';
export const DARK_BG = '#1B232B';

type Rgb = [number, number, number];

export type LogoAnalysis = {
  kind: 'transparent' | 'solid-bg' | 'photo';
  /** Effen achtergrond van het logo (alleen bij 'solid-bg'). */
  bg: Rgb | null;
  /** Kader rond de inhoud, in pixels van de geanalyseerde afbeelding. */
  box: { x: number; y: number; w: number; h: number };
  /** Gemiddelde relatieve luminantie (0-1) van de inhoud. */
  inkLuminance: number;
};

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function near(a: Rgb, b: Rgb): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < COLOR_TOLERANCE;
}

/** Puur: RGBA-pixels → soort logo, achtergrond en inhoudskader. */
export function analyzeLogoPixels(data: Uint8ClampedArray, w: number, h: number): LogoAnalysis {
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const transparent = corners.every((p) => p[3] < ALPHA_MIN);

  let bg: Rgb | null = null;
  if (!transparent) {
    const avg: Rgb = [0, 1, 2].map((k) => Math.round(corners.reduce((s, p) => s + p[k], 0) / 4)) as Rgb;
    const uniform = corners.every((p) => p[3] > 230 && near([p[0], p[1], p[2]], avg));
    if (uniform) bg = avg;
  }
  const full = { x: 0, y: 0, w, h };
  if (!transparent && !bg) {
    // Geen effen of transparante rand: een foto of een druk beeld. Niets bijsnijden.
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += luminance([data[i], data[i + 1], data[i + 2]]);
      n++;
    }
    return { kind: 'photo', bg: null, box: full, inkLuminance: n ? sum / n : 0.5 };
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  let lumSum = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(x, y);
      if (p[3] < ALPHA_MIN) continue;
      if (bg && near([p[0], p[1], p[2]], bg)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      lumSum += luminance([p[0], p[1], p[2]]);
      n++;
    }
  }
  const box = x1 < 0 ? full : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  return {
    kind: transparent ? 'transparent' : 'solid-bg',
    bg,
    box,
    inkLuminance: n ? lumSum / n : 0.5,
  };
}

export type LogoLayout = {
  fill: string;
  /** Waar het inhoudskader in het uitvoer-vierkant komt. */
  dest: { x: number; y: number; w: number; h: number };
  /** Bij een foto: welk vierkant uit de bron (cover). Anders het inhoudskader. */
  src: { x: number; y: number; w: number; h: number };
  warning: string | null;
};

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Puur: analyse → hoe het logo in het uitvoer-vierkant komt. */
export function planLogoLayout(a: LogoAnalysis, out: number = LOGO_OUTPUT_PX): LogoLayout {
  const { box } = a;
  if (a.kind === 'photo') {
    const side = Math.min(box.w, box.h);
    return {
      fill: LIGHT_BG,
      src: { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side },
      dest: { x: 0, y: 0, w: out, h: out },
      warning: null,
    };
  }
  const fill = a.bg ? toHex(a.bg) : a.inkLuminance > 0.6 ? DARK_BG : LIGHT_BG;
  // Schaal zo dat de hoeken van het kader op SAFE_RADIUS van de straal liggen.
  const k = (SAFE_RADIUS * (out / 2)) / Math.hypot(box.w / 2, box.h / 2);
  const w = box.w * k;
  const h = box.h * k;
  const ratio = box.w / box.h;
  const warning =
    ratio > MAX_ASPECT || ratio < 1 / MAX_ASPECT
      ? 'Je logo is erg langwerpig en wordt daardoor klein in de chatknop. Een vierkante versie, bijvoorbeeld alleen het beeldmerk, werkt beter.'
      : null;
  return { fill, src: box, dest: { x: (out - w) / 2, y: (out - h) / 2, w, h }, warning };
}

// ---------------------------------------------------------------------------
// Browser-deel
// ---------------------------------------------------------------------------

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return [c, g];
}

/** Verklein in stappen van max 2× — één grote sprong geeft kartelranden bij foto's. */
function downscale(src: CanvasImageSource, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 > tw && ch / 2 > th) {
    const [c, g] = canvas(cw / 2, ch / 2);
    g.drawImage(cur, 0, 0, cw, ch, 0, 0, c.width, c.height);
    cur = c;
    cw = c.width;
    ch = c.height;
  }
  const [c, g] = canvas(tw, th);
  g.drawImage(cur, 0, 0, cw, ch, 0, 0, c.width, c.height);
  return c;
}

export type NormalizedLogo = { dataUrl: string; warning: string | null };

export class LogoError extends Error {}

/** Bestand → genormaliseerd PNG (data-URL). Gooit LogoError met een klanttekst. */
export async function normalizeLogoFile(file: File): Promise<NormalizedLogo> {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) throw new LogoError('Kies een PNG, JPG, WebP of SVG.');
  if (file.size > MAX_LOGO_SOURCE_BYTES) {
    throw new LogoError(
      `Dit bestand is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximaal ${MAX_LOGO_SOURCE_BYTES / 1024 / 1024} MB.`,
    );
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new LogoError('Dit bestand kon niet als afbeelding worden geopend. Probeer een PNG of JPG.');
  }
  // SVG's zonder width/height melden soms 0×0: teken die op het werkformaat.
  const nw = img.naturalWidth || WORK_PX;
  const nh = img.naturalHeight || WORK_PX;
  if (nw * nh > MAX_SOURCE_PIXELS) {
    throw new LogoError(
      `Deze afbeelding is ${Math.round((nw * nh) / 1e6)} megapixel. Verklein hem eerst tot maximaal ${MAX_SOURCE_PIXELS / 1e6} megapixel.`,
    );
  }
  const scale = Math.min(1, WORK_PX / Math.max(nw, nh));
  try {
    // Eerst één sprong naar max 2048 px, zodat er geen tussencanvas op de volle
    // bronmaat ontstaat; daarna in nette halveringsstappen naar het werkformaat.
    const s1 = Math.min(1, FIRST_STEP_MAX_PX / Math.max(nw, nh));
    const [first, firstG] = canvas(nw * s1, nh * s1);
    firstG.drawImage(img, 0, 0, first.width, first.height);
    const work = downscale(first, first.width, first.height, nw * scale, nh * scale);
    let analysis: LogoAnalysis;
    try {
      const d = work.getContext('2d')!.getImageData(0, 0, work.width, work.height).data;
      analysis = analyzeLogoPixels(d, work.width, work.height);
    } catch {
      // Sommige browsers blokkeren het uitlezen van SVG-pixels: dan zonder bijsnijden.
      analysis = { kind: 'transparent', bg: null, box: { x: 0, y: 0, w: work.width, h: work.height }, inkLuminance: 0.2 };
    }
    const plan = planLogoLayout(analysis);
    const [out, g] = canvas(LOGO_OUTPUT_PX, LOGO_OUTPUT_PX);
    g.fillStyle = plan.fill;
    g.fillRect(0, 0, LOGO_OUTPUT_PX, LOGO_OUTPUT_PX);
    const [cropC, cropG] = canvas(plan.src.w, plan.src.h);
    cropG.drawImage(work, plan.src.x, plan.src.y, plan.src.w, plan.src.h, 0, 0, cropC.width, cropC.height);
    const fitted = downscale(cropC, cropC.width, cropC.height, plan.dest.w, plan.dest.h);
    g.drawImage(fitted, plan.dest.x, plan.dest.y, plan.dest.w, plan.dest.h);
    return { dataUrl: out.toDataURL('image/png'), warning: plan.warning };
  } catch {
    throw new LogoError('Het logo kon niet worden verwerkt. Probeer een kleiner bestand of een PNG.');
  }
}
