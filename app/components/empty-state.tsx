'use client';

import Image from 'next/image';
import { useMemo } from 'react';

const EXAMPLES: { label: string; q: string }[] = [
  { label: 'Wat doet het?', q: 'wat doet ChatManta?' },
  { label: 'Stack', q: 'welke stack gebruiken jullie?' },
  { label: 'Doelgroep', q: 'voor welke doelgroep is het?' },
  { label: 'Kernprincipes', q: 'wat zijn de kernprincipes?' },
  { label: 'Jorion', q: 'wat is Jorion Solutions?' },
  { label: 'Multi-tenancy', q: 'hoe werkt multi-tenancy?' },
  { label: 'Anti-hallucinatie', q: 'hoe voorkomt de bot hallucinaties?' },
  { label: 'Cost-discipline', q: 'hoe worden de kosten beheerst?' },
  { label: 'Embedding-model', q: 'welk embedding-model wordt gebruikt?' },
  { label: 'Crawler', q: "hoeveel pagina's kan Firecrawl crawlen?" },
  { label: 'Hosting', q: 'waar draait ChatManta?' },
  { label: 'Widget', q: 'hoe wordt de chatbot op een klantsite gezet?' },
];

const PICK_COUNT = 4;

// Mulberry32-PRNG → deterministisch per seed, zodat server-render en client-
// hydration dezelfde shuffle produceren (geen hydration mismatch).
function pickSeeded(seed: number): typeof EXAMPLES {
  const out = EXAMPLES.slice();
  let s = (seed | 0) || 1;
  const n = Math.min(PICK_COUNT, out.length);
  for (let i = 0; i < n; i++) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = i + Math.floor(r * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

export function EmptyState({
  onPick,
  docCount,
  chunkCount,
  seed = 0,
}: {
  onPick: (q: string) => void;
  docCount: number;
  chunkCount: number;
  /** Bumpt iedere "Nieuwe vraag"-klik → andere 4 voorbeelden. 0 = initial render (eerste 4). */
  seed?: number;
}) {
  const picks = useMemo(
    () => (seed === 0 ? EXAMPLES.slice(0, PICK_COUNT) : pickSeeded(seed)),
    [seed],
  );

  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        <Image src="/logo/mark.png" alt="" width={510} height={270} priority />
      </div>
      <h1 className="empty-title">Wat wil je weten?</h1>
      <p className="empty-sub">
        {docCount > 0
          ? `Ik doorzoek ${docCount} ${docCount === 1 ? 'document' : 'documenten'} · ${chunkCount} chunks. Vragen worden gevectoriseerd, gematcht op je drempel, en beantwoord met inline citaties.`
          : 'Nog geen documenten. Upload via het Documenten-paneel rechts.'}
      </p>
      {docCount > 0 ? (
        <div className="empty-grid">
          {picks.map((e) => (
            <button
              key={e.q}
              type="button"
              className="empty-card"
              onClick={() => onPick(e.q)}
            >
              <div className="empty-card-label">{e.label}</div>
              <div className="empty-card-q">{e.q}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
