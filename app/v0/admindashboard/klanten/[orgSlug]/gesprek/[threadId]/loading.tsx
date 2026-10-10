// Admin Dashboard — laad-staat voor de gesprek-detailweergave.

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 28, width: 200, borderRadius: 8, background: 'var(--klant-surface-muted)' }} />
      <div style={{ height: 110, borderRadius: 'var(--klant-r-lg)', background: 'var(--klant-surface-muted)', border: '1px solid var(--klant-border)' }} />
      <div style={{ height: 260, borderRadius: 'var(--klant-r-lg)', background: 'var(--klant-surface-muted)', border: '1px solid var(--klant-border)' }} />
      <p style={{ fontSize: 13, color: 'var(--klant-dim)', textAlign: 'center' }}>Gesprek laden…</p>
    </div>
  );
}
