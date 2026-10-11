// Admin Dashboard — segment-loading fallback. De cross-org fan-out duurt ~enkele
// seconden; toon een rustige laad-staat i.p.v. een lege flits.

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 28, width: 220, borderRadius: 8, background: 'var(--klant-surface-muted)' }} />
      <div className="klant-metrics-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 92, borderRadius: 'var(--klant-r-lg)', background: 'var(--klant-surface-muted)', border: '1px solid var(--klant-border)' }} />
        ))}
      </div>
      <div style={{ height: 160, borderRadius: 'var(--klant-r-lg)', background: 'var(--klant-surface-muted)', border: '1px solid var(--klant-border)' }} />
      <p style={{ fontSize: 13, color: 'var(--klant-dim)', textAlign: 'center' }}>Admin Dashboard laden…</p>
    </div>
  );
}
