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
  | 'quiz'
  | 'table';

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

function Tabs({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 28, paddingBottom: 12, borderBottom: '1px solid var(--v1-line)' }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? 130 : 110} height={14} />
      ))}
    </div>
  );
}

/** Kop van een genummerde stap (Widget-scherm). */
function StepTitle() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Skeleton width={26} height={26} radius={999} />
      <Skeleton width={110} height={16} />
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
          <Head actions={3} />
          <Skeleton height={150} radius={22} />
          <div className="v1-skel-strip">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="v1-skel-stat">
                <Skeleton width="45%" height={12} />
                <Skeleton width={64} height={28} radius={8} />
                <Skeleton width="70%" height={11} />
              </div>
            ))}
          </div>
          <div className="v1-skel-grid">
            <Card>
              <Skeleton width="45%" height={16} />
              <ListRows count={4} />
            </Card>
            <Card>
              <Skeleton width="40%" height={16} />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Skeleton width={['60%', '52%', '48%', '40%', '35%'][i]} height={13} />
                  <Skeleton width={80} height={6} radius={3} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </Card>
          </div>
        </>
      );

    case 'conversations':
      return (
        <>
          <Head />
          <Tabs count={2} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Skeleton width={250} height={38} radius={12} />
            <Skeleton width={40} height={24} radius={999} />
            <Skeleton width={150} height={13} />
          </div>
          <Card style={{ gap: 0 }}>
            <ListRows count={6} />
          </Card>
        </>
      );

    case 'conversation':
      return (
        <div className="v1-page" style={{ maxWidth: 760 }}>
          <Skeleton width={140} height={13} />
          <Head />
          <Skeleton width={220} height={12} />
          <Card style={{ gap: 18 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-start' : 'flex-end' }}>
                <Skeleton width={i % 2 ? '68%' : '44%'} height={i % 2 ? 72 : 40} radius={16} />
              </div>
            ))}
          </Card>
        </div>
      );

    case 'knowledge':
      return (
        <>
          <Head actions={1} />
          <Tabs count={3} />
          <Card style={{ gap: 0 }}>
            <ListRows count={5} />
          </Card>
        </>
      );

    case 'contacts':
      return (
        <>
          <Head actions={1} />
          <Tabs count={4} />
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
      // Drie stappen onder elkaar: Uiterlijk (velden + voorbeeld), Installeren, Status.
      return (
        <>
          <Head actions={2} />
          <StepTitle />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            <Card style={{ gap: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Array.from({ length: 11 }, (_, i) => (
                  <Skeleton key={i} width={30} height={30} radius={999} />
                ))}
              </div>
              <Field />
              <Field />
              <Field />
            </Card>
            <Skeleton height={600} radius={22} />
          </div>
          <StepTitle />
          <Card>
            <Skeleton width="55%" height={14} />
            <Skeleton height={52} radius={12} />
            <Skeleton width={150} height={13} />
          </Card>
          <StepTitle />
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Skeleton width={180} height={14} />
              <Skeleton width={44} height={26} radius={999} />
            </div>
            <Skeleton width="60%" height={13} />
          </Card>
        </>
      );

    case 'chat':
      // Nep-browservenster met de widget rechtsonder open.
      return (
        <>
          <Head actions={1} />
          <div className="v1-skel-card" style={{ padding: 0, gap: 0, minHeight: 640, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--v1-line)' }}>
              <Skeleton width={46} height={10} radius={999} />
              <Skeleton width="min(360px, 60%)" height={22} radius={999} />
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: 590 }}>
              <div
                className="v1-skel"
                style={{ position: 'absolute', right: 20, bottom: 88, top: 20, width: 'min(384px, calc(100% - 40px))', borderRadius: 22 }}
              />
              <div style={{ position: 'absolute', right: 20, bottom: 20 }}>
                <Skeleton width={56} height={56} radius={999} />
              </div>
            </div>
          </div>
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

    case 'table':
      // Lijstpagina's (admin): kop, filterregel, kaart met tabelrijen.
      return (
        <>
          <Head actions={1} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[90, 110, 80, 120].map((w, i) => (
              <Skeleton key={i} width={w} height={30} radius={999} />
            ))}
          </div>
          <Card style={{ gap: 0 }}>
            <ListRows count={7} />
          </Card>
        </>
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
