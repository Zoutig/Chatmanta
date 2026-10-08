import type { CSSProperties, ReactNode } from 'react';

export function Skeleton({
  width = '100%',
  height = 14,
  radius,
  style,
}: {
  width?: CSSProperties['width'];
  height?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className="v1-skel" style={{ width, height, borderRadius: radius, ...style }} />;
}

// Laadskeletten per pagina: dezelfde opbouw als de echte pagina, zodat de inhoud
// op zijn plek "invalt" in plaats van te verspringen. Het skelet verschijnt pas
// na een korte vertraging (CSS), zodat snelle navigaties niet flitsen.
export type PageSkeletonVariant =
  | 'overview'
  | 'conversations'
  | 'conversation'
  | 'knowledge'
  | 'contacts'
  | 'widget'
  | 'chat'
  | 'settings'
  | 'account'
  | 'feedback'
  | 'quiz';

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="v1-skel-card" style={style}>
      {children}
    </div>
  );
}

function Head({ actions = 0, eyebrow = false }: { actions?: number; eyebrow?: boolean }) {
  return (
    <div className="v1-page-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 320px' }}>
        {eyebrow ? <Skeleton width={110} height={12} /> : null}
        <Skeleton width="min(340px, 70%)" height={30} radius={10} />
        <Skeleton width="min(460px, 90%)" height={14} />
      </div>
      {actions > 0 ? (
        <div className="v1-page-actions">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} width={120} height={40} radius={12} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Paneel met kop + lees-rijen (label links, waarde rechts). */
function RowsPanel({ rows, title = 120 }: { rows: number; title?: number }) {
  return (
    <Card style={{ gap: 0, paddingTop: 18, paddingBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14 }}>
        <Skeleton width={title} height={16} />
        <Skeleton width={84} height={34} radius={10} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="v1-skel-row">
          <Skeleton width={120} height={13} />
          <Skeleton width={i % 2 ? '45%' : '62%'} height={13} />
        </div>
      ))}
    </Card>
  );
}

function ListRows({ count, meta = true }: { count: number; meta?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="v1-skel-listrow">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={['72%', '58%', '66%', '50%'][i % 4]} height={14} />
            {meta ? <Skeleton width={150} height={11} /> : null}
          </div>
          <Skeleton width={64} height={22} radius={999} />
        </div>
      ))}
    </>
  );
}

function Pills({ widths }: { widths: number[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={32} radius={999} />
      ))}
    </div>
  );
}

function Tabs({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 28, paddingBottom: 12, borderBottom: '1px solid var(--v1-line)' }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? 130 : 110} height={14} />
      ))}
    </div>
  );
}

function Field({ tall = false }: { tall?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton width={130} height={12} />
      <Skeleton height={tall ? 120 : 44} radius={12} />
    </div>
  );
}

function Body({ variant }: { variant: PageSkeletonVariant }) {
  switch (variant) {
    case 'overview':
      return (
        <>
          <Head eyebrow actions={3} />
          <Skeleton height={76} radius={16} />
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Skeleton width={40} height={40} radius={12} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="34%" height={15} />
              <Skeleton width="62%" height={12} />
            </div>
          </Card>
          <div className="v1-skel-stats">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Skeleton width="45%" height={11} />
                <Skeleton width={56} height={28} radius={8} />
                <Skeleton width="60%" height={11} />
              </Card>
            ))}
          </div>
          <div className="v1-skel-grid">
            <Card>
              <Skeleton width="40%" height={16} />
              <ListRows count={4} meta={false} />
            </Card>
            <Card>
              <Skeleton width="30%" height={16} />
              <ListRows count={4} meta={false} />
            </Card>
          </div>
        </>
      );

    case 'conversations':
      return (
        <>
          <Head eyebrow actions={2} />
          <Tabs count={2} />
          <Pills widths={[78, 112, 124, 112]} />
          <Card style={{ gap: 0 }}>
            <ListRows count={6} />
          </Card>
        </>
      );

    case 'conversation':
      return (
        <>
          <Skeleton width={140} height={13} />
          <Head />
          <div className="v1-skel-split">
            <Card style={{ gap: 18 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-start' : 'flex-end' }}>
                  <Skeleton width={i % 2 ? '68%' : '44%'} height={i % 2 ? 72 : 40} radius={16} />
                </div>
              ))}
            </Card>
            <Card>
              <Skeleton width="50%" height={15} />
              <Skeleton height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="65%" height={12} />
            </Card>
          </div>
        </>
      );

    case 'knowledge':
      return (
        <>
          <Head eyebrow />
          <Tabs count={3} />
          <div className="v1-skel-drop">
            <Skeleton width={48} height={48} radius={999} />
            <Skeleton width={280} height={15} />
            <Skeleton width={360} height={12} />
          </div>
          <Card style={{ gap: 0 }}>
            <ListRows count={4} />
          </Card>
        </>
      );

    case 'contacts':
      return (
        <>
          <Head eyebrow />
          <Pills widths={[70, 70, 96, 90]} />
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Skeleton width="30%" height={15} />
                <Skeleton width={72} height={22} radius={999} />
              </div>
              <Skeleton width="45%" height={12} />
              <Skeleton width="85%" height={12} />
            </Card>
          ))}
        </>
      );

    case 'widget':
      return (
        <>
          <Head eyebrow />
          <Card>
            <Skeleton width={110} height={16} />
            <Skeleton width="45%" height={12} />
            <Skeleton height={64} radius={12} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} radius={10} />
            ))}
          </Card>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <Skeleton width={100} height={16} />
                <Skeleton width="40%" height={12} />
              </div>
              <Skeleton width={16} height={16} radius={4} />
            </Card>
          ))}
        </>
      );

    case 'chat':
      return (
        <>
          <Head eyebrow />
          <Skeleton height={520} radius={20} />
        </>
      );

    case 'settings':
      return (
        <>
          <Head actions={1} />
          <div className="v1-subnav-layout">
            <div className="v1-skel-subnav">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} width={i === 0 ? '100%' : '70%'} height={i === 0 ? 36 : 14} radius={10} />
              ))}
            </div>
            <div className="v1-stack">
              <RowsPanel rows={4} title={70} />
              <RowsPanel rows={2} title={60} />
              <RowsPanel rows={5} title={110} />
            </div>
          </div>
        </>
      );

    case 'account':
      return (
        <div className="v1-page v1-page--narrow">
          <Head />
          <RowsPanel rows={2} title={130} />
          <RowsPanel rows={3} title={110} />
          <Card>
            <Skeleton width={90} height={16} />
            <div className="v1-skel-stats">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Skeleton width="55%" height={12} />
                  <Skeleton width={90} height={26} radius={8} />
                  {i < 2 ? <Skeleton height={6} radius={3} /> : null}
                </div>
              ))}
            </div>
          </Card>
        </div>
      );

    case 'feedback':
      return (
        <div className="v1-page" style={{ maxWidth: 720 }}>
          <Head />
          <Card style={{ gap: 20 }}>
            <Field />
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={42} radius={12} />
              ))}
            </div>
            <Field tall />
            <div className="v1-skel-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field />
              <Field />
            </div>
          </Card>
        </div>
      );

    case 'quiz':
      return (
        <>
          <Head eyebrow />
          <Card style={{ gap: 16 }}>
            <Skeleton width={90} height={12} />
            <Skeleton width="70%" height={20} radius={8} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={48} radius={12} />
            ))}
          </Card>
        </>
      );
  }
}

/** Laadskelet in de vorm van de pagina; gebruikt door loading.tsx. */
export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  return (
    <div className="v1-skel-page" role="status" aria-live="polite">
      <span className="v1-sr-only">Pagina laden</span>
      <Body variant={variant} />
    </div>
  );
}
