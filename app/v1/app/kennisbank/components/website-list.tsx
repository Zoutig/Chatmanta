'use client';
// Websitebronnen als kaarten: kop (host + tellers, uitklappen), compacte
// statusregel (bezig / mislukt / leeg) en de paginalijst. Verwijderen via ⋯.
import { useCallback, useState, useTransition } from 'react';
import { ChevronRight, Globe, Trash2 } from 'lucide-react';
import type { WebsiteSource } from '../types';
import { deleteWebsiteSourceAction } from '../actions';
import { Menu } from '@/app/v1/_ui/menu';
import { useToast } from '@/app/v1/_ui/toast';
import { ManagedPages } from './managed-pages';
import { CrawlDiagnostics, CrawlProgressLine } from './crawl-diagnostics';
import { ConfirmDialog } from './confirm-dialog';

export function WebsiteList({
  sources,
  onChange,
}: {
  sources: WebsiteSource[];
  onChange: (s: WebsiteSource[]) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, start] = useTransition();
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cancelDelete = useCallback(() => setConfirmId(null), []);
  const doDelete = () => {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    start(async () => {
      const res = await deleteWebsiteSourceAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onChange(sources.filter((w) => w.source.id !== id));
      toast.success('Website-bron verwijderd');
    });
  };

  return (
    <>
      {sources.map((ws) => {
        const id = ws.source.id;
        const crawling = ws.job?.status === 'pending' || ws.job?.status === 'processing';
        const isOpen = open.has(id) && !crawling;
        const host = ws.source.host ?? ws.source.rootUrl ?? 'Website';
        const counts = {
          active: ws.pages.filter((p) => p.status === 'active').length,
          off: ws.pages.filter((p) => p.status === 'disabled').length,
          failed: ws.pages.filter((p) => p.status === 'error').length,
        };
        const panelId = `kb-source-${id}`;
        return (
          <section key={id} className="v1-card v1-kb-source" aria-label={host}>
            <div className="v1-kb-source-head">
              <button
                type="button"
                className="v1-kb-source-toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                disabled={crawling || ws.pages.length === 0}
                onClick={() => toggle(id)}
              >
                <ChevronRight size={16} strokeWidth={1.8} className="v1-kb-chevron" data-open={isOpen} aria-hidden="true" />
                <Globe size={16} strokeWidth={1.8} className="v1-kb-globe" aria-hidden="true" />
                <span className="v1-kb-source-text">
                  <span className="v1-kb-source-host">{host}</span>
                  <span className="v1-kb-source-meta">
                    {crawling
                      ? 'Bezig met verwerken'
                      : `${ws.pages.length} pagina's · ${counts.active} actief · ${counts.off} uit · ${counts.failed} mislukt`}
                  </span>
                </span>
              </button>
              <Menu
                label={`Acties voor ${host}`}
                items={[
                  {
                    label: 'Website-bron verwijderen',
                    icon: <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />,
                    onSelect: () => setConfirmId(id),
                  },
                ]}
              />
            </div>

            {crawling ? (
              <CrawlProgressLine
                completed={ws.job?.completed ?? 0}
                total={ws.job?.total ?? 0}
                rateLimited={ws.job?.events?.[0]?.decision === 'rate-limited'}
              />
            ) : (
              <CrawlDiagnostics job={ws.job} pagesCount={ws.pages.length} isCrawling={false} />
            )}

            {isOpen && (
              <div id={panelId}>
                <ManagedPages data={ws} onChange={onChange} />
              </div>
            )}
          </section>
        );
      })}

      {confirmId ? (
        <ConfirmDialog
          title="Website-bron verwijderen?"
          body="Alle pagina's van deze website gaan uit je kennisbank."
          confirmLabel="Verwijderen"
          onCancel={cancelDelete}
          onConfirm={doDelete}
        />
      ) : null}
    </>
  );
}
