// Generic Command Center page skeleton — toont direct bij client-side
// navigatie zodat Taken/Roadmap/Milestones niet langer voelen alsof er niets
// gebeurt tijdens de RSC-render.

const PULSE = 'cc-skel-pulse';

const styleSheet = `
@keyframes ${PULSE} { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }
.${PULSE} { animation: ${PULSE} 1.6s ease-in-out infinite; }
`;

function Bar({ w, h = 14 }: { w: number | string; h?: number }) {
  return (
    <div
      className={PULSE}
      style={{
        width: w,
        height: h,
        background: 'var(--surface-3)',
        borderRadius: 6,
      }}
    />
  );
}

function Card() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <Bar w="70%" />
      <Bar w="92%" h={10} />
      <Bar w="40%" h={10} />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <Bar w={48} h={18} />
        <Bar w={64} h={18} />
      </div>
    </div>
  );
}

export function PageSkeleton({ title }: { title?: string }) {
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: styleSheet }} />
      <div style={{ marginBottom: 22 }}>
        {title ? (
          <h1
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
              margin: 0,
            }}
          >
            {title}
          </h1>
        ) : (
          <Bar w={220} h={26} />
        )}
        <div style={{ marginTop: 10 }}>
          <Bar w={320} h={12} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} />
        ))}
      </div>
    </div>
  );
}
