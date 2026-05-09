'use client';

import Image from 'next/image';

export function EmbedView({ botVersion }: { botVersion: string }) {
  const snippet = `<script
  src="https://chatmanta.nl/widget.js"
  data-bot="${botVersion}"
  data-org="org_jorion_solutions"
  defer
></script>`;
  return (
    <div>
      <div className="settings-label">Live preview · klant-website</div>
      <div className="embed-frame">
        <div className="embed-frame-head">
          <div className="embed-frame-dots">
            <span />
            <span />
            <span />
          </div>
          <span>klant-demo.nl</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{botVersion}</span>
        </div>
        <div className="embed-frame-body">
          <div className="embed-bubble">
            <div className="b-name">ChatManta-bot</div>
            <div>Hoi! Stel je vraag over onze service of producten — ik zoek het op in onze docs.</div>
          </div>
          <div className="embed-fab" aria-hidden="true">
            <Image src="/logo/mono-mark.png" alt="" width={270} height={148} />
          </div>
        </div>
      </div>
      <div className="settings-label" style={{ marginTop: 16 }}>
        Embed-snippet
      </div>
      <div className="embed-snippet">{snippet}</div>
      <p className="slider-hint" style={{ marginTop: 10 }}>
        Widget zelf is V1 (Fase 6) — dit is alleen een visuele preview.
      </p>
    </div>
  );
}
