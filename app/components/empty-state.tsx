'use client';

import Image from 'next/image';

const EXAMPLES: { label: string; q: string }[] = [
  { label: 'Wat doet het?', q: 'wat doet ChatManta?' },
  { label: 'Stack', q: 'welke stack gebruiken jullie?' },
  { label: 'Doelgroep', q: 'voor welke doelgroep is het?' },
  { label: 'Kernprincipes', q: 'wat zijn de kernprincipes?' },
];

export function EmptyState({
  onPick,
  docCount,
  chunkCount,
}: {
  onPick: (q: string) => void;
  docCount: number;
  chunkCount: number;
}) {
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
          {EXAMPLES.map((e) => (
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
