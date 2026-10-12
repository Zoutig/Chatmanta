import { MANTA_ATLAS as A, type MouthFamily } from './atlas';

/**
 * Animatie-engine van de ChatManta-mascotte (framework-vrij; de React-wrapper regelt
 * mount, zichtbaarheid en reduced motion).
 *
 * - Lichaam: één afbeelding (manta-body.png), vervormd met een WebGL-mesh. Vleugelslag
 *   naar Fish e.a. 2016: scharnier met stille wortel, korte golf wortel→tip (< 1
 *   golflengte), achterrand loopt achter, neerslag sneller dan opslag.
 * - Gezicht: per frame op een klein 2D-canvas getekend (oogwit → pupil binnen het oogwit
 *   → ooglidstand → mondstand) en als textuur door dezelfde mesh-vervorming gestuurd,
 *   zodat gezicht en lichaam één geheel blijven.
 * - Geen WebGL? Dan tekent hij lichaam + gezicht plat via 2D (gezicht leeft nog).
 *
 * Coördinaten zijn in het bronvlak van 1536×1024; de atlas staat op schaal A.scale.
 */

export type MantaMode = 'idle' | 'happy' | 'shy' | 'wow' | 'think' | 'lost';

const W = 1536;
const H = 1024;
const S = A.scale;
// Gezichtsvak (bronvlak): omvat beide ogen en de mond.
const FX = 570, FY = 220, FW = 544, FH = 344;
// Hele manta iets kleiner in het canvas, zodat vleugeluitslag en deining niet clippen.
const FIT = 0.92;

const MOTION: Record<MantaMode, { amp: number; flap: number; bob: number; tail: number }> = {
  idle: { amp: 0.1, flap: 2.2, bob: 7, tail: 12 },
  happy: { amp: 0.2, flap: 4.6, bob: 10, tail: 22 },
  shy: { amp: 0.05, flap: 1.4, bob: 3, tail: 6 },
  wow: { amp: 0.07, flap: 1.8, bob: 4, tail: 8 },
  think: { amp: 0.06, flap: 1.6, bob: 4, tail: 8 },
  lost: { amp: 0.07, flap: 1.7, bob: 5, tail: 9 },
};
// mondfamilie, openheid, pupilgrootte, ooglid-openheid
const FACE: Record<MantaMode, [MouthFamily, number, number, number]> = {
  idle: ['smile', 0, 1, 1],
  happy: ['smile', 0.55, 1.08, 0.92],
  shy: ['sad', 0.35, 0.9, 0.8],
  wow: ['oh', 0.85, 0.82, 1],
  think: ['oo', 0.2, 0.95, 0.9],
  lost: ['sad', 0.3, 1, 0.95], // 404: zoekend rondkijken, licht bezorgd
};
const TALK_FAMILIES: MouthFamily[] = ['ah', 'ah', 'ee', 'oh', 'oo', 'smile', 'smile'];

// ---------- "uitspreken": tekst → mondbewegingen ----------
type Syllable = { t0: number; t1: number; fam: MouthFamily; peak: number };
type Speech = { syl: Syllable[]; wordStarts: number[]; total: number; start: number | null; fired: number; onWord?: (i: number) => void; onEnd?: () => void };

// Klinkergroep → mondvorm (Nederlands, grof): oe/u/ui/eu → oo, o → oh, a → ah, e/i/ij/ie → ee.
function mouthFor(v: string): MouthFamily {
  const s = v.toLowerCase();
  if (/oe|ui|eu|^u+$|ou|au/.test(s)) return 'oo';
  if (s.includes('o')) return 'oh';
  if (s.includes('a')) return 'ah';
  if (/[eiyéèëï]/.test(s)) return 'ee';
  return 'smile';
}
const PEAK: Record<MouthFamily, number> = { ah: 0.95, oh: 0.85, ee: 0.7, oo: 0.7, smile: 0.5, sad: 0.4 };

/**
 * Bouwt een tijdlijn van lettergrepen (~0,17 s), korte sluiting tussen woorden en
 * pauzes bij leestekens. Woorden zijn de witruimte-gescheiden tokens van `text`,
 * in dezelfde volgorde als waarin de UI ze toont.
 */
export function speechTimeline(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const syl: Syllable[] = [];
  const wordStarts: number[] = [];
  let t = 0;
  for (const w of words) {
    wordStarts.push(t);
    const groups = w.match(/ij|[aeiouyàáäâëéèêïíöóôüú]+/gi) ?? ['e'];
    // ~5 lettergrepen/s, lange klinkergroepen iets langer (prettig voorleestempo)
    const dur = clamp(0.11 + (0.025 * w.length) / groups.length, 0.11, 0.22);
    for (const g of groups) {
      const fam = mouthFor(g);
      syl.push({ t0: t, t1: t + dur, fam, peak: clamp(PEAK[fam] + (Math.random() - 0.5) * 0.25, 0.2, 1) });
      t += dur;
    }
    t += /[.!?:]$/.test(w) ? 0.38 : /[,;]$/.test(w) ? 0.2 : 0.04;
  }
  return { syl, wordStarts, total: t };
}

const VS = `
attribute vec2 a_p; uniform vec4 u_rect; uniform float u_ph,u_amp,u_bob,u_tail,u_roll,u_fit; uniform vec2 u_head; varying vec2 v_uv;
void main(){
  vec2 p0=a_p; vec2 p=p0; v_uv=(p0-u_rect.xy)/u_rect.zw;
  vec2 c=vec2(790.,530.), d=vec2(.982,-.185), n=vec2(.185,.982);
  float u=dot(p0-c,d), au=abs(u), ch=dot(p0-c,n);
  float r=clamp(au/720.,0.,1.);
  float g=pow(smoothstep(0.06,1.0,r),1.25);
  float tr=clamp(ch/260.,0.,1.);
  float psi=u_ph+0.22*sin(u_ph);
  float ang=u_amp*g*sin(psi-r*1.15-tr*0.3);
  p-=d*sign(u)*au*(1.-cos(ang));
  p.y-=au*sin(ang)*0.55;
  float wt=smoothstep(640.,990.,p0.y); p.x+=wt*wt*u_tail*sin(u_ph-1.6-p0.y*0.006);
  float wl=smoothstep(400.,110.,p0.y); p.x+=wl*wl*6.*sin(u_ph-0.9); p.y+=wl*wl*4.*sin(u_ph-1.6);
  float wf=exp(-pow(length(p0-vec2(830.,400.))/320.,2.0)); p+=u_head*vec2(16.,9.)*wf;
  float s=sin(u_roll),co=cos(u_roll); vec2 rr=p-c; p=c+vec2(co*rr.x-s*rr.y,s*rr.x+co*rr.y);
  p.y+=u_bob;
  vec2 q=(p-vec2(768.,512.))*u_fit/vec2(768.,512.);
  gl_Position=vec4(q.x,-q.y,0.,1.);
}`;
const FS = `precision mediump float; uniform sampler2D u_tex; uniform float u_bright; varying vec2 v_uv;
void main(){ if(v_uv.x<0.||v_uv.y<0.||v_uv.x>1.||v_uv.y>1.) discard; vec4 c=texture2D(u_tex,v_uv); gl_FragColor=vec4(c.rgb*u_bright,c.a); }`;

type Blink = { t0: number; wink: boolean; close: number; hold: number; open: number };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class MantaEngine {
  private gl: WebGLRenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private face = document.createElement('canvas');
  private fc: CanvasRenderingContext2D;
  private eyeCv = { L: document.createElement('canvas'), R: document.createElement('canvas') };
  private glRes: { texBody: WebGLTexture; texFace: WebGLTexture; ibAll: WebGLBuffer; ibFace: WebGLBuffer; nAll: number; nFace: number; u: Record<string, WebGLUniformLocation | null> } | null = null;

  private mode: MantaMode = 'idle';
  private talking = false;
  private cur = { ...MOTION.idle };
  private phase = 0;
  private last: number | null = null;
  private st = { gx: 0, gy: 0, pupil: 1, openL: 1, openR: 1, family: 'smile' as MouthFamily, mouth: 0 };
  private head = { x: 0, y: 0 };
  private target: { x: number; y: number } | null = null; // null = zelf rondkijken
  private focusUntil = 0;
  private focus: { x: number; y: number } | null = null;
  private lastPointer = -99;
  private glance = { x: 0, y: 0, next: 0 };
  private blinkState: Blink | null = null;
  private nextBlink = 2;
  private syl = { start: 0, end: 0, fam: 'smile' as MouthFamily, peak: 0 };
  private speech: Speech | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private body: HTMLImageElement,
    private atlas: HTMLImageElement,
  ) {
    this.face.width = Math.round(FW * S);
    this.face.height = Math.round(FH * S);
    this.fc = this.face.getContext('2d')!;
    for (const s of ['L', 'R'] as const) {
      this.eyeCv[s].width = Math.round(A.eyes[s].size[0] * S);
      this.eyeCv[s].height = Math.round(A.eyes[s].size[1] * S);
    }
    this.gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (this.gl) this.initGl(this.gl);
    else this.ctx2d = canvas.getContext('2d');
  }

  // ---------- publieke besturing ----------
  setMode(m: MantaMode) { this.mode = m; }
  getMode() { return this.mode; }
  setTalking(on: boolean) { this.talking = on; }
  /** Kijkrichting genormaliseerd (-1..1, t.o.v. de kop). */
  setPointer(x: number, y: number, now: number) { this.target = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }; this.lastPointer = now; }
  /** Even naar iets specifieks kijken (bv. het chatbericht), wint van de muis. */
  lookAt(x: number, y: number, now: number, ms = 1400) { this.focus = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }; this.focusUntil = now + ms / 1000; }
  blink(now: number) { this.blinkState = { t0: now, wink: false, close: 0.09, hold: 0.04, open: 0.15 }; }
  wink(now: number) { this.blinkState = { t0: now, wink: true, close: 0.12, hold: 0.28, open: 0.2 }; }
  /** Spreek `text` uit: mond volgt de klinkers; `onWord(i)` vuurt als woord i begint. */
  speak(text: string, opts: { onWord?: (i: number) => void; onEnd?: () => void } = {}) {
    this.stopSpeaking();
    this.speech = { ...speechTimeline(text), start: null, fired: -1, ...opts };
  }
  stopSpeaking() {
    this.speech = null;
  }
  isSpeaking() { return this.speech !== null; }

  resize(cssWidth: number, dpr: number) {
    const w = clamp(Math.round(cssWidth * dpr), 160, W);
    this.canvas.width = w;
    this.canvas.height = Math.round((w * H) / W);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Eén frame; `sec` = tijd in seconden, `still` = reduced motion (geen lichaamsbeweging). */
  frame(sec: number, still = false) {
    const dt = this.last == null ? 0 : Math.min(0.05, sec - this.last);
    this.last = sec;
    this.update(sec, dt, still);
    this.drawFace();
    if (this.gl && this.glRes) this.drawGl(sec, still);
    else this.draw2d();
  }

  destroy() {
    const gl = this.gl;
    if (gl && this.glRes) {
      gl.deleteTexture(this.glRes.texBody);
      gl.deleteTexture(this.glRes.texFace);
      gl.deleteBuffer(this.glRes.ibAll);
      gl.deleteBuffer(this.glRes.ibFace);
    }
    this.glRes = null;
  }

  // ---------- gedrag ----------
  private update(sec: number, dt: number, still: boolean) {
    const k = (rate: number) => Math.min(1, dt * rate);
    const tg = MOTION[this.mode];
    for (const key of Object.keys(this.cur) as (keyof typeof this.cur)[]) this.cur[key] = lerp(this.cur[key], tg[key], k(2.5));
    this.phase += dt * this.cur.flap; // fase optellen → geen sprong bij tempowissel

    // Kijkrichting: focus > muis > zelf rondkijken
    let tx: number, ty: number;
    if (this.mode === 'shy') { tx = -0.8; ty = 0.8; }
    else if (this.focus && sec < this.focusUntil) { tx = this.focus.x; ty = this.focus.y; }
    else if (this.mode === 'think') { tx = 0.35; ty = -0.9; }
    else if (this.target && sec - this.lastPointer < (this.mode === 'lost' ? 1.2 : 2.5)) { tx = this.target.x; ty = this.target.y; }
    else {
      if (sec > this.glance.next) {
        this.glance = { x: (Math.random() * 2 - 1) * 0.8, y: (Math.random() * 2 - 1) * 0.5, next: sec + (this.mode === 'lost' ? 0.5 + Math.random() * 0.7 : 1.2 + Math.random() * 2) };
      }
      tx = this.glance.x; ty = this.glance.y;
    }
    if (!still && !this.blinkState && Math.hypot(tx - this.st.gx, ty - this.st.gy) > 1.1 && Math.random() < 0.5) {
      this.blinkState = { t0: sec, wink: false, close: 0.08, hold: 0.03, open: 0.14 }; // grote blikwissel → vaak een knipper
    }
    this.st.gx = lerp(this.st.gx, tx, k(18)); // ogen: snel (saccade)
    this.st.gy = lerp(this.st.gy, ty, k(18));
    this.head.x = lerp(this.head.x, tx, k(3)); // kop: traag
    this.head.y = lerp(this.head.y, ty, k(3));

    // Knipperen
    if (!still && !this.blinkState && sec > this.nextBlink) {
      this.blink(sec);
      this.nextBlink = sec + 2.5 + Math.random() * 3.5 + (Math.random() < 0.15 ? -2.2 : 0);
    }
    let shut = 0;
    const b = this.blinkState;
    if (b) {
      const t = sec - b.t0;
      if (t < b.close) shut = smooth(t / b.close);
      else if (t < b.close + b.hold) shut = 1;
      else if (t < b.close + b.hold + b.open) shut = 1 - smooth((t - b.close - b.hold) / b.open);
      else this.blinkState = null;
    }
    const [faceFam, faceOpen, pupil, lid] = FACE[this.mode];
    this.st.openL = lid * (1 - shut);
    this.st.openR = lid * (1 - (b?.wink ? 0 : shut));

    // Mond: praten = lettergrepen; vormwissel pas als de mond (bijna) dicht is
    let fam = faceFam;
    let open = faceOpen;
    const sp = this.speech;
    if (sp) {
      if (sp.start === null) sp.start = sec;
      const t = sec - sp.start;
      while (sp.fired + 1 < sp.wordStarts.length && t >= sp.wordStarts[sp.fired + 1]) sp.onWord?.(++sp.fired);
      if (t >= sp.total) {
        this.speech = null;
        sp.onEnd?.();
      } else if (!still) {
        const s = sp.syl.find((x) => t >= x.t0 && t < x.t1);
        if (s) {
          fam = s.fam;
          open = s.peak * Math.pow(Math.sin((Math.PI * (t - s.t0)) / (s.t1 - s.t0)), 0.6);
        } else {
          fam = this.st.family; // pauze: mond dicht, vorm vasthouden
          open = 0;
        }
      }
    } else if (this.talking && !still) {
      if (sec >= this.syl.end) {
        const pause = Math.random() < 0.18;
        this.syl = {
          start: sec,
          end: sec + (pause ? 0.22 : 0.14 + Math.random() * 0.12),
          fam: pause ? 'smile' : TALK_FAMILIES[Math.floor(Math.random() * TALK_FAMILIES.length)],
          peak: pause ? 0 : 0.45 + Math.random() * 0.55,
        };
      }
      const f = (sec - this.syl.start) / (this.syl.end - this.syl.start);
      fam = this.syl.fam;
      open = this.syl.peak * Math.pow(Math.sin(Math.PI * Math.min(1, f)), 0.6);
    } else if (this.talking) {
      open = 0.3;
    }
    if (b?.wink) { fam = 'smile'; open = Math.max(open, 0.35); }
    // Vormwissel alleen als de mond bijna dicht is: de eerste standen van alle families
    // lijken op elkaar, dus onder ~25% open valt de wissel niet op. Tijdens uitspreken
    // reageert de mond sneller (korte lettergrepen).
    const switchAt = sp ? 0.25 : 0.07;
    if (fam !== this.st.family) { if (this.st.mouth < switchAt) this.st.family = fam; else open = 0; }
    const up = sp ? 40 : 26;
    const down = sp ? 30 : 18;
    this.st.mouth = still ? (fam === this.st.family ? open : 0) : lerp(this.st.mouth, open, k(open > this.st.mouth ? up : down));
    this.st.pupil = lerp(this.st.pupil, pupil, still ? 1 : k(4));
  }

  // ---------- gezicht ----------
  private drawFace() {
    const fc = this.fc;
    const img = this.atlas;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, this.face.width, this.face.height);
    const pick = (n: number) => Math.round(n * (A.frames.length - 1)); // 0..1 → dichtstbijzijnde stand
    for (const s of ['L', 'R'] as const) {
      const e = A.eyes[s];
      const cv = this.eyeCv[s];
      const c = cv.getContext('2d')!;
      const [bx, by] = e.at;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(S, 0, 0, S, 0, 0); // tekenen in bron-eenheden
      const blit = (r: readonly number[]) => c.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, e.size[0], e.size[1]);
      blit(e.white);
      c.globalCompositeOperation = 'source-atop'; // pupil alleen binnen het oogwit
      const px = e.pupilCenter[0] - bx;
      const py = e.pupilCenter[1] - by;
      c.save();
      c.translate(px + this.st.gx * e.look[0], py + this.st.gy * e.look[1]);
      c.scale(this.st.pupil, this.st.pupil);
      c.translate(-px, -py);
      blit(e.pupil);
      c.restore();
      c.globalCompositeOperation = 'source-over';
      const open = s === 'L' ? this.st.openL : this.st.openR;
      blit(e.lids[pick(1 - open)]);
      fc.drawImage(cv, Math.round((bx - FX) * S), Math.round((by - FY) * S));
    }
    const m = A.mouth;
    const r = m.families[this.st.family][pick(this.st.mouth)];
    fc.drawImage(img, r[0], r[1], r[2], r[3], (m.at[0] - FX) * S, (m.at[1] - FY) * S, m.size[0] * S, m.size[1] * S);
  }

  // ---------- WebGL ----------
  private initGl(gl: WebGLRenderingContext) {
    const sh = (type: number, src: string) => {
      const o = gl.createShader(type)!;
      gl.shaderSource(o, src);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader');
      return o;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    const NX = 96, NY = 64;
    const pos: number[] = [];
    const all: number[] = [];
    const faceIdx: number[] = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) pos.push((i / NX) * W, (j / NY) * H);
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        all.push(a, b, c, b, d, c);
        const x0 = (i / NX) * W, x1 = ((i + 1) / NX) * W, y0 = (j / NY) * H, y1 = ((j + 1) / NY) * H;
        if (x1 > FX && x0 < FX + FW && y1 > FY && y0 < FY + FH) faceIdx.push(a, b, c, b, d, c);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a_p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ib = (arr: number[]) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(arr), gl.STATIC_DRAW);
      return b;
    };
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const tex = (src: TexImageSource) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ['u_rect', 'u_ph', 'u_amp', 'u_bob', 'u_tail', 'u_roll', 'u_head', 'u_bright', 'u_fit']) u[n] = gl.getUniformLocation(pr, n);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.glRes = { texBody: tex(this.body), texFace: tex(this.face), ibAll: ib(all), ibFace: ib(faceIdx), nAll: all.length, nFace: faceIdx.length, u };
  }

  private drawGl(sec: number, still: boolean) {
    const gl = this.gl!;
    const R = this.glRes!;
    const a = still ? 0 : 1;
    gl.bindTexture(gl.TEXTURE_2D, R.texFace);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.face);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(R.u.u_fit, FIT);
    gl.uniform1f(R.u.u_ph, this.phase);
    gl.uniform1f(R.u.u_amp, this.cur.amp * (1 + 0.22 * Math.sin(sec * 0.37)) * a);
    gl.uniform1f(R.u.u_bob, (Math.sin(this.phase) * this.cur.bob + Math.sin(sec * 0.6) * 5 + this.st.mouth * 2) * a);
    gl.uniform1f(R.u.u_tail, this.cur.tail * a);
    gl.uniform1f(R.u.u_roll, (Math.sin(this.phase + 0.5) * 0.012 + this.head.x * 0.03) * a);
    gl.uniform2f(R.u.u_head, this.head.x, this.head.y);
    gl.uniform1f(R.u.u_bright, 1 + Math.sin(sec * 1.3) * 0.04 * a);
    gl.bindTexture(gl.TEXTURE_2D, R.texBody);
    gl.uniform4f(R.u.u_rect, 0, 0, W, H);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ibAll);
    gl.drawElements(gl.TRIANGLES, R.nAll, gl.UNSIGNED_SHORT, 0);
    gl.bindTexture(gl.TEXTURE_2D, R.texFace);
    gl.uniform4f(R.u.u_rect, FX, FY, FW, FH);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ibFace);
    gl.drawElements(gl.TRIANGLES, R.nFace, gl.UNSIGNED_SHORT, 0);
  }

  private draw2d() {
    const c = this.ctx2d;
    if (!c) return;
    const k = this.canvas.width / W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(k * FIT, 0, 0, k * FIT, (this.canvas.width * (1 - FIT)) / 2, (this.canvas.height * (1 - FIT)) / 2);
    c.drawImage(this.body, 0, 0, W, H);
    c.drawImage(this.face, FX, FY, FW, FH);
  }
}
