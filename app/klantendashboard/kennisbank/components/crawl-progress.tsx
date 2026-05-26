'use client';
import { Loader2, AlertTriangle } from 'lucide-react';

export function CrawlProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 5;
  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
        <Loader2 size={14} style={{ animation: 'org-spin 0.9s linear infinite' }} /> Je website wordt verwerkt
      </div>
      <div style={{ height: 8, background: '#ece8df', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--klant-accent, #0e8e78)', transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>
          {completed}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--klant-fg-dim)' }}> / {total || '…'} pagina&apos;s</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>± 1–3 min</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--klant-fg-dim)' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        Houd dit tabblad open tot het klaar is. Sluit je het, dan pauzeert de verwerking en gaat verder zodra je terugkomt.
      </div>
    </div>
  );
}
