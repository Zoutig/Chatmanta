import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%', height = 14, style }: { width?: CSSProperties['width']; height?: number; style?: CSSProperties }) {
  return <div className="v1-skel" style={{ width, height, ...style }} />;
}

export type PageSkeletonVariant = 'overview' | 'list' | 'form' | 'detail' | 'chat';

function Lines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={16} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </>
  );
}

/** Laadskelet in de vorm van het paginatype; gebruikt door loading.tsx. */
export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  return (
    <div className="v1-skel-page" role="status" aria-live="polite">
      <span className="v1-sr-only">Pagina laden…</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton width={120} height={12} />
        <Skeleton width="38%" height={30} />
      </div>

      {variant === 'overview' && (
        <>
          <div className="v1-skel" style={{ height: 132, borderRadius: 22 }} />
          <div className="v1-skel-card" style={{ flexDirection: 'row', gap: 24 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton width="50%" height={12} />
                <Skeleton width="40%" height={28} />
              </div>
            ))}
          </div>
          <div className="v1-skel-grid">
            <div className="v1-skel-card"><Lines count={5} /></div>
            <div className="v1-skel-card"><Lines count={5} /></div>
          </div>
        </>
      )}

      {variant === 'list' && (
        <>
          <Skeleton width="45%" height={36} />
          <div className="v1-skel-card"><Lines count={7} /></div>
        </>
      )}

      {variant === 'form' && (
        <>
          <div className="v1-skel-card"><Lines count={4} /></div>
          <div className="v1-skel-card"><Lines count={3} /></div>
        </>
      )}

      {variant === 'detail' && (
        <>
          <div className="v1-skel-card"><Lines count={2} /></div>
          <div className="v1-skel-card"><Lines count={8} /></div>
        </>
      )}

      {variant === 'chat' && <div className="v1-skel" style={{ height: 480, borderRadius: 20 }} />}
    </div>
  );
}
