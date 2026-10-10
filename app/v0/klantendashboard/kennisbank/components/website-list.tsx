'use client';
import { useState } from 'react';
import { ChevronRight, Globe } from 'lucide-react';
import type { WebsiteSource } from '@/lib/v0/server/crawler';
import { ManagedPages } from './managed-pages';
import { CrawlProgress } from './crawl-progress';
import { CrawlDiagnostics } from './crawl-diagnostics';

export function WebsiteList({
  sources,
  onChange,
}: {
  sources: WebsiteSource[];
  onChange: (s: WebsiteSource[]) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const removeSource = (id: string) => onChange(sources.filter((w) => w.source.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sources.map((ws) => {
        const id = ws.source.id;
        const crawling = ws.job?.status === 'pending' || ws.job?.status === 'processing';
        const isOpen = open.has(id);
        const counts = {
          active: ws.pages.filter((p) => p.status === 'active').length,
          off: ws.pages.filter((p) => p.status === 'disabled').length,
          failed: ws.pages.filter((p) => p.status === 'error').length,
        };
        return (
          <div key={id} className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div role="button" tabIndex={crawling ? -1 : 0}
              onClick={() => !crawling && toggle(id)}
              onKeyDown={(e) => { if (!crawling && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(id); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: crawling ? 'default' : 'pointer' }}
            >
              <ChevronRight
                size={16}
                style={{
                  color: 'var(--klant-fg-dim)',
                  flexShrink: 0,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform .15s',
                  opacity: crawling ? 0.3 : 1,
                }}
              />
              <Globe size={15} style={{ color: 'var(--klant-accent)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {ws.source.host ?? ws.source.rootUrl}
                </div>
                <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
                  {crawling
                    ? 'Bezig met verwerken…'
                    : `${ws.pages.length} pagina’s · ${counts.active} actief · ${counts.off} uit · ${counts.failed} mislukt`}
                </div>
              </div>
            </div>
            {crawling && (
              <div style={{ padding: '0 14px 14px' }}>
                <CrawlProgress
                  completed={ws.job?.completed ?? 0}
                  total={ws.job?.total ?? 0}
                  rateLimited={ws.job?.events?.[0]?.decision === 'rate-limited'}
                />
              </div>
            )}
            {!crawling && (
              <CrawlDiagnostics job={ws.job} pagesCount={ws.pages.length} isCrawling={false} style={{ margin: '0 14px 12px' }} />
            )}
            {isOpen && !crawling && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--klant-border)' }}>
                <ManagedPages data={ws} onChange={onChange} onDelete={removeSource} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
