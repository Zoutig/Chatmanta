import type { ReactNode } from 'react';

// V1 Preview — faux browser-venster met adresbalk + mockup-backdrop.
//
// Spiegelt V0's preview-frame structuur: traffic-lights + adresbalk boven,
// daarna een `position: relative` backdrop-vlak waarop de widget `position:
// absolute` zweeft. De V0-screenshot (Firecrawl) is weggelaten — in plaats
// daarvan altijd de MockupSite (neutrale lege "website"). Geen client-state
// nodig → server component.
//
// ponytail: screenshot-backdrop (Firecrawl) overgeslagen — backdrop is een
// stijlvolle mockup. Add when screenshot-feature voor V1 gewenst.

export function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="klant-card"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 560,
      }}
    >
      {/* Faux browser-chrome — verkeerslichten + adresbalk */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--klant-border)',
          background: 'var(--klant-surface-muted)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#28c840' }} />
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--klant-bg)',
            border: '1px solid var(--klant-border)',
            borderRadius: 999,
            padding: '5px 12px',
            fontSize: 12,
            color: 'var(--klant-muted)',
            fontFamily: 'var(--klant-font-mono)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          https://jouw-website.nl
        </div>
      </div>

      {/* Backdrop-vlak — `position: relative`; de widget hangt hier absoluut in */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--klant-bg)',
        }}
      >
        <MockupSite />

        {/* Lichte sluier zodat de widget altijd leesbaar boven de backdrop ligt */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0) 55%, rgba(15,17,21,0.06) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Children = de V1PreviewWidget (position: absolute binnen dit vlak) */}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lege "website"-mockup — faux nav + hero + content-blokjes zodat de widget
// altijd op "een site" lijkt te staan. Gespiegeld van V0 preview-frame.
// ---------------------------------------------------------------------------
function MockupSite() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        padding: '0 0 40px',
        background:
          'linear-gradient(180deg, var(--klant-surface) 0%, var(--klant-bg) 100%)',
      }}
    >
      {/* Faux site-nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 28px',
          borderBottom: '1px solid var(--klant-border)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--klant-ink-soft)',
          }}
        >
          jouw-website.nl
        </div>
        <div style={{ display: 'flex', gap: 18 }} aria-hidden="true">
          {[60, 48, 52].map((w, i) => (
            <span
              key={i}
              style={{
                width: w,
                height: 9,
                borderRadius: 999,
                background: 'var(--klant-border-strong)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Faux hero */}
      <div style={{ padding: '40px 28px 0', maxWidth: 520 }} aria-hidden="true">
        <span
          style={{
            display: 'block',
            width: '70%',
            height: 26,
            borderRadius: 8,
            background: 'var(--klant-surface-deep)',
            marginBottom: 14,
          }}
        />
        <span
          style={{
            display: 'block',
            width: '90%',
            height: 12,
            borderRadius: 6,
            background: 'var(--klant-border-strong)',
            marginBottom: 8,
          }}
        />
        <span
          style={{
            display: 'block',
            width: '60%',
            height: 12,
            borderRadius: 6,
            background: 'var(--klant-border-strong)',
          }}
        />
      </div>

      {/* Faux content-kaarten */}
      <div
        style={{ display: 'flex', gap: 16, padding: '36px 28px 0', flexWrap: 'wrap' }}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: '1 1 140px',
              minWidth: 120,
              height: 96,
              borderRadius: 12,
              background: 'var(--klant-surface)',
              border: '1px solid var(--klant-border)',
            }}
          />
        ))}
      </div>

      {/* Status-label */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 16,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--klant-dim)',
        }}
      >
        Voorbeeldweergave van je website
      </div>
    </div>
  );
}
