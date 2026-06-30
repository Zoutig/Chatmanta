import type { ReactNode } from 'react';

// V1 Preview — presentationele sfeer-backdrop waar de chat-kaart op "zweeft".
// Spiegelt het V0-idee (widget over een homepage-screenshot) maar zonder de
// billable capture.
//
// ponytail: screenshot-backdrop (Firecrawl) overgeslagen — backdrop is
// placeholder (neutrale gradient), add when gewenst.
export function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 'var(--klant-r-lg)',
        border: '1px solid var(--klant-border)',
        background:
          'radial-gradient(130% 120% at 50% 0%, var(--klant-surface) 0%, var(--klant-bg) 65%)',
        padding: 'clamp(28px, 6vw, 64px) 20px',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 420,
      }}
    >
      {children}
    </div>
  );
}
