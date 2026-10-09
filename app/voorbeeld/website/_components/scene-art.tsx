import { useId } from 'react';
import type { SceneVariant } from '@/lib/voorbeeld/site-content';

// Decoratieve "foto's" van het fictieve park: inline SVG, geen externe beelden.
// Altijd aria-hidden; de betekenis staat in de tekst eromheen.

type Palette = { skyTop: string; skyBottom: string; sun: string; sea: string; seaDeep: string };

const DAY: Palette = { skyTop: '#B9DCE0', skyBottom: '#F5E9D5', sun: '#F8DDA4', sea: '#5FA2A3', seaDeep: '#2F6F76' };
const DUSK: Palette = { skyTop: '#E9A98A', skyBottom: '#F7E2C2', sun: '#FBE3B0', sea: '#6C9CA0', seaDeep: '#335F68' };
const FOREST: Palette = { skyTop: '#C9E0D6', skyBottom: '#F2EADA', sun: '#F6E2B4', sea: '#6AA6A2', seaDeep: '#356F70' };
const MORNING: Palette = { skyTop: '#CFE4EC', skyBottom: '#FAF0E1', sun: '#FFE6B8', sea: '#68AAB0', seaDeep: '#2E6C78' };

const PALETTES: Record<SceneVariant, Palette> = {
  strand: DAY,
  lodge: MORNING,
  bos: FOREST,
  tent: FOREST,
  tiny: DUSK,
  hoeve: MORNING,
  camping: DAY,
  zwembad: MORNING,
  restaurant: DUSK,
  omgeving: DAY,
  duinen: DUSK,
};

export function SceneArt({ variant, className }: { variant: SceneVariant; className?: string }) {
  const raw = useId();
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const p = PALETTES[variant];

  return (
    <svg
      className={className}
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.skyTop} />
          <stop offset="1" stopColor={p.skyBottom} />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sea} />
          <stop offset="1" stopColor={p.seaDeep} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.sun} stopOpacity="1" />
          <stop offset="0.55" stopColor={p.sun} stopOpacity="0.85" />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-dune`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6D2AE" />
          <stop offset="1" stopColor="#D2B686" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CDAE7C" />
          <stop offset="1" stopColor="#B8955F" />
        </linearGradient>
      </defs>

      <rect width="1200" height="600" fill={`url(#${id}-sky)`} />
      <circle cx="905" cy="185" r="120" fill={`url(#${id}-sun)`} />

      {/* wolken */}
      <g fill="#FFFFFF" opacity="0.55">
        <ellipse cx="220" cy="120" rx="90" ry="18" />
        <ellipse cx="290" cy="106" rx="60" ry="16" />
        <ellipse cx="690" cy="80" rx="70" ry="12" />
      </g>

      {/* zee */}
      <rect y="318" width="1200" height="110" fill={`url(#${id}-sea)`} />
      <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M60 340 q 30 -6 60 0 t 60 0" />
        <path d="M420 352 q 30 -6 60 0 t 60 0" />
        <path d="M800 336 q 30 -6 60 0 t 60 0" />
        <path d="M1010 360 q 30 -6 60 0 t 60 0" />
      </g>

      {/* vogels */}
      <g stroke="#23404A" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M520 150 q 9 -9 18 0 q 9 -9 18 0" />
        <path d="M570 178 q 7 -7 14 0 q 7 -7 14 0" />
        <path d="M480 190 q 6 -6 12 0 q 6 -6 12 0" />
      </g>

      {/* achterste duin */}
      <path d="M0 372 C 180 318 360 352 560 338 S 930 300 1200 346 L 1200 600 L 0 600 Z" fill="#E9D8B8" />

      {variant === 'omgeving' && <Lighthouse />}
      {variant === 'bos' || variant === 'tent' ? <Pines /> : null}

      {/* middelste duin */}
      <path d="M0 448 C 170 398 360 430 540 418 S 880 380 1200 428 L 1200 600 L 0 600 Z" fill={`url(#${id}-dune)`} />

      <Building variant={variant} />

      {/* voorste duin */}
      <path d="M0 528 C 230 482 520 524 770 502 S 1070 470 1200 498 L 1200 600 L 0 600 Z" fill={`url(#${id}-front)`} />

      {/* helmgras */}
      <g stroke="#6F7D4C" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9">
        <path d="M70 540 q 4 -36 16 -58" />
        <path d="M82 542 q 0 -30 -10 -52" />
        <path d="M94 540 q 8 -28 24 -44" />
        <path d="M1050 500 q 4 -36 16 -58" />
        <path d="M1062 502 q 0 -30 -10 -52" />
        <path d="M1074 500 q 8 -28 24 -44" />
        <path d="M1110 506 q 2 -26 -6 -46" />
        <path d="M860 512 q 4 -28 14 -44" />
        <path d="M872 514 q -2 -24 -10 -40" />
      </g>
    </svg>
  );
}

function Pines() {
  const trees = [
    [700, 360, 1],
    [760, 350, 1.25],
    [830, 365, 0.95],
    [900, 352, 1.2],
    [980, 368, 1],
    [1050, 356, 1.3],
    [1130, 372, 1],
    [640, 372, 0.85],
  ] as const;
  return (
    <g>
      {trees.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-4" y="40" width="8" height="34" fill="#4A3B2C" />
          <path d="M0 -40 L 32 22 L 14 22 L 40 56 L -40 56 L -14 22 L -32 22 Z" fill={i % 2 ? '#2D5446' : '#24463B'} />
        </g>
      ))}
    </g>
  );
}

function Lighthouse() {
  return (
    <g transform="translate(860 170)">
      <path d="M18 0 L 52 0 L 62 190 L 8 190 Z" fill="#F4EEE4" />
      <path d="M14 50 L 56 50 L 58 80 L 12 80 Z" fill="#B5473A" />
      <path d="M11 120 L 59 120 L 60 150 L 10 150 Z" fill="#B5473A" />
      <rect x="20" y="-26" width="30" height="26" fill="#2E3D44" />
      <rect x="25" y="-20" width="20" height="14" fill="#FBE3A2" />
      <path d="M14 -26 L 35 -46 L 56 -26 Z" fill="#B5473A" />
      <path d="M50 -14 L 210 -50 L 210 20 Z" fill="#FFF3C8" opacity="0.35" />
    </g>
  );
}

function Planks({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines = [];
  for (let i = x + 12; i < x + w; i += 12) lines.push(i);
  return (
    <g stroke="#000" strokeOpacity="0.08" strokeWidth="1.5">
      {lines.map((lx) => (
        <line key={lx} x1={lx} y1={y} x2={lx} y2={y + h} />
      ))}
    </g>
  );
}

function Building({ variant }: { variant: SceneVariant }) {
  switch (variant) {
    case 'strand':
      return (
        <g>
          <g transform="translate(330 300)">
            <rect x="0" y="50" width="170" height="92" fill="#A79C8E" />
            <Planks x={0} y={50} w={170} h={92} />
            <path d="M-14 54 L 85 -6 L 184 54 Z" fill="#33464B" />
            <rect x="22" y="76" width="56" height="40" fill="#F6E6C2" stroke="#5B4F43" strokeWidth="4" />
            <rect x="104" y="80" width="40" height="62" fill="#5B4F43" />
            <rect x="-20" y="142" width="210" height="10" fill="#8C7356" />
          </g>
          <g transform="translate(560 330)">
            <rect x="0" y="40" width="130" height="78" fill="#B9AE9F" />
            <Planks x={0} y={40} w={130} h={78} />
            <path d="M-12 44 L 65 -4 L 142 44 Z" fill="#3B5054" />
            <rect x="18" y="62" width="44" height="32" fill="#F6E6C2" stroke="#5B4F43" strokeWidth="4" />
          </g>
          <Parasol x={760} y={420} color="#C8643B" />
          <Parasol x={170} y={438} color="#2F6F76" />
        </g>
      );
    case 'lodge':
      return (
        <g transform="translate(360 290)">
          <path d="M-20 70 L 420 30 L 420 50 L -20 92 Z" fill="#2A3B3A" />
          <rect x="0" y="80" width="400" height="110" fill="#6E5A47" />
          <Planks x={0} y={80} w={400} h={110} />
          <rect x="30" y="96" width="210" height="80" fill="#F3DDB0" stroke="#3A2E24" strokeWidth="5" />
          <line x1="100" y1="96" x2="100" y2="176" stroke="#3A2E24" strokeWidth="4" />
          <line x1="170" y1="96" x2="170" y2="176" stroke="#3A2E24" strokeWidth="4" />
          <rect x="280" y="104" width="80" height="54" fill="#F3DDB0" stroke="#3A2E24" strokeWidth="5" />
          <rect x="342" y="40" width="22" height="46" fill="#4A4038" />
          <rect x="-30" y="190" width="460" height="12" fill="#8A6E50" />
          <g stroke="#6B5640" strokeWidth="3">
            <line x1="-30" y1="202" x2="-30" y2="226" />
            <line x1="430" y1="202" x2="430" y2="226" />
          </g>
        </g>
      );
    case 'bos':
      return (
        <g transform="translate(250 280)">
          <path d="M-16 80 L 160 0 L 336 80 Z" fill="#2F3B37" />
          <rect x="0" y="78" width="320" height="130" fill="#C9B79A" />
          <Planks x={0} y={78} w={320} h={130} />
          <rect x="26" y="100" width="70" height="56" fill="#F6E3B8" stroke="#3A3127" strokeWidth="5" />
          <rect x="128" y="104" width="64" height="104" fill="#3A3127" />
          <rect x="222" y="100" width="70" height="56" fill="#F6E3B8" stroke="#3A3127" strokeWidth="5" />
          <rect x="132" y="30" width="56" height="34" fill="#F6E3B8" stroke="#3A3127" strokeWidth="4" />
          <path d="M100 208 L 220 208 L 240 236 L 80 236 Z" fill="#BFB5A5" />
        </g>
      );
    case 'tent':
      return (
        <g transform="translate(300 290)">
          <rect x="-30" y="150" width="380" height="14" fill="#8A6E50" />
          <g stroke="#6B5640" strokeWidth="4">
            <line x1="-20" y1="164" x2="-20" y2="190" />
            <line x1="340" y1="164" x2="340" y2="190" />
          </g>
          <path d="M0 150 L 30 30 L 290 30 L 320 150 Z" fill="#EFE3CB" />
          <path d="M30 30 L 160 -20 L 290 30 Z" fill="#D9C8A8" />
          <path d="M130 150 L 160 52 L 190 150 Z" fill="#5A4A3A" />
          <path d="M160 52 L 130 150 L 120 150 L 158 50 Z" fill="#CDBB98" />
          <line x1="160" y1="-20" x2="160" y2="150" stroke="#8E7A5C" strokeWidth="3" />
          <rect x="44" y="70" width="52" height="38" fill="#F6E3B8" stroke="#8E7A5C" strokeWidth="3" />
          <rect x="226" y="70" width="52" height="38" fill="#F6E3B8" stroke="#8E7A5C" strokeWidth="3" />
        </g>
      );
    case 'tiny':
      return (
        <g transform="translate(470 300)">
          <path d="M-14 60 L 90 -4 L 194 60 Z" fill="#273634" />
          <rect x="0" y="58" width="180" height="104" fill="#5D6E66" />
          <Planks x={0} y={58} w={180} h={104} />
          <rect x="18" y="78" width="96" height="68" fill="#FCE2B0" stroke="#22302D" strokeWidth="5" />
          <rect x="128" y="84" width="34" height="78" fill="#22302D" />
          <rect x="62" y="18" width="36" height="24" fill="#FCE2B0" stroke="#22302D" strokeWidth="3" />
          <circle cx="40" cy="176" r="12" fill="#2B2B2B" />
          <circle cx="140" cy="176" r="12" fill="#2B2B2B" />
          <rect x="-10" y="160" width="200" height="8" fill="#3A3A3A" />
        </g>
      );
    case 'hoeve':
      return (
        <g transform="translate(260 250)">
          <path d="M-30 120 L 120 0 L 520 0 L 640 120 Z" fill="#3E4B48" />
          <rect x="0" y="118" width="600" height="120" fill="#B9673E" />
          <g stroke="#8D4B2C" strokeOpacity="0.4" strokeWidth="2">
            <line x1="0" y1="148" x2="600" y2="148" />
            <line x1="0" y1="178" x2="600" y2="178" />
            <line x1="0" y1="208" x2="600" y2="208" />
          </g>
          <path d="M240 238 L 240 160 Q 300 120 360 160 L 360 238 Z" fill="#2F4A3F" />
          <line x1="300" y1="142" x2="300" y2="238" stroke="#1F3530" strokeWidth="4" />
          {[40, 120, 440, 520].map((x) => (
            <g key={x}>
              <rect x={x} y="150" width="46" height="54" fill="#F6E1B2" />
              <rect x={x} y="150" width="46" height="54" fill="none" stroke="#F4EEE4" strokeWidth="6" />
            </g>
          ))}
          <rect x="280" y="36" width="40" height="40" fill="#F6E1B2" stroke="#F4EEE4" strokeWidth="5" />
          <rect x="560" y="-30" width="24" height="56" fill="#7E3F26" />
        </g>
      );
    case 'camping':
      return (
        <g>
          <g transform="translate(300 360)">
            <rect x="0" y="0" width="220" height="100" rx="40" fill="#F4EEE4" />
            <rect x="0" y="54" width="220" height="12" fill="#2F6F76" />
            <rect x="30" y="20" width="70" height="30" rx="8" fill="#BFD9DB" />
            <rect x="140" y="18" width="42" height="74" rx="6" fill="#D9CFC0" />
            <circle cx="90" cy="106" r="16" fill="#2B2B2B" />
            <line x1="220" y1="80" x2="262" y2="96" stroke="#555" strokeWidth="5" />
          </g>
          <g transform="translate(600 380)">
            <path d="M0 90 L 70 0 L 140 90 Z" fill="#C8643B" />
            <path d="M70 0 L 52 90 L 88 90 Z" fill="#7E3F26" />
          </g>
          <g transform="translate(780 398)">
            <path d="M0 74 L 56 0 L 112 74 Z" fill="#E3A857" />
            <path d="M56 0 L 42 74 L 70 74 Z" fill="#A9742F" />
          </g>
        </g>
      );
    case 'zwembad':
      return (
        <g transform="translate(240 270)">
          <path d="M0 80 Q 300 -40 620 80 Z" fill="#DCEBEC" opacity="0.9" />
          <path d="M0 80 Q 300 -40 620 80" fill="none" stroke="#7E9A9C" strokeWidth="6" />
          <rect x="0" y="80" width="620" height="120" fill="#F4EEE4" />
          {[40, 140, 240, 340, 440, 540].map((x) => (
            <rect key={x} x={x} y="98" width="70" height="80" fill="#9FD0D2" stroke="#7E9A9C" strokeWidth="3" />
          ))}
          <rect x="60" y="200" width="500" height="34" rx="6" fill="#4FA4A8" />
          <path d="M70 216 q 20 -8 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="3" />
        </g>
      );
    case 'restaurant':
      return (
        <g transform="translate(330 260)">
          <rect x="0" y="80" width="420" height="96" fill="#EDE4D3" />
          <path d="M-24 84 L 444 84 L 420 50 L 0 50 Z" fill="#2F4A4C" />
          {[24, 104, 184, 264, 344].map((x) => (
            <rect key={x} x={x} y="98" width="56" height="60" fill="#FAD9A0" stroke="#7B6A55" strokeWidth="3" />
          ))}
          <rect x="-30" y="176" width="480" height="12" fill="#8A6E50" />
          <g stroke="#6B5640" strokeWidth="6">
            <line x1="0" y1="188" x2="0" y2="240" />
            <line x1="140" y1="188" x2="140" y2="240" />
            <line x1="280" y1="188" x2="280" y2="240" />
            <line x1="420" y1="188" x2="420" y2="240" />
          </g>
          <text x="210" y="74" textAnchor="middle" fontFamily="Georgia, serif" fontSize="20" fill="#F4EEE4" letterSpacing="6">
            ZILT
          </text>
          <Parasol x={500} y={150} color="#E3A857" />
        </g>
      );
    case 'omgeving':
      return (
        <g transform="translate(300 380)">
          <path d="M0 40 L 40 0 L 80 40 Z" fill="#B9673E" />
          <rect x="6" y="40" width="68" height="40" fill="#EDE4D3" />
          <path d="M90 40 L 130 4 L 170 40 Z" fill="#3E4B48" />
          <rect x="96" y="40" width="68" height="40" fill="#D9C8A8" />
          <rect x="190" y="-30" width="20" height="110" fill="#8A7A66" />
          <path d="M180 -30 L 200 -60 L 220 -30 Z" fill="#3E4B48" />
        </g>
      );
    case 'duinen':
    default:
      return (
        <g>
          <Parasol x={820} y={410} color="#C8643B" />
          <g transform="translate(300 392)" fill="#8C7356">
            <rect x="0" y="0" width="6" height="40" />
            <rect x="26" y="4" width="6" height="36" />
            <rect x="52" y="0" width="6" height="40" />
            <rect x="78" y="6" width="6" height="34" />
          </g>
        </g>
      );
  }
}

function Parasol({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1="0" y1="0" x2="10" y2="96" stroke="#5B4F43" strokeWidth="4" />
      <path d="M-58 8 Q 0 -44 58 8 Z" fill={color} />
      <path d="M-58 8 Q -29 -2 0 8 Q 29 -2 58 8" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" />
    </g>
  );
}
