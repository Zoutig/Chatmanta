'use client';

// "Bron bekijken": de opgeslagen tekst van een document of webpagina in het
// V1-zijpaneel. De aanroeper laadt de inhoud via zijn read-action.

import { ExternalLink } from 'lucide-react';
import { Drawer } from '@/app/v1/_ui/drawer';

export type SourceView = { title: string; url?: string; text: string; loading: boolean };

export function SourceDrawer({ view, onClose }: { view: SourceView; onClose: () => void }) {
  return (
    <Drawer
      title={view.title}
      onClose={onClose}
      headerExtra={
        view.url ? (
          <a
            href={view.url}
            target="_blank"
            rel="noopener noreferrer"
            className="v1-menu-btn"
            aria-label="Open de pagina in een nieuw tabblad"
            title="Open de pagina"
          >
            <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
          </a>
        ) : null
      }
    >
      {view.loading ? (
        <span className="v1-kb-loading" role="status">
          <span className="v1-spinner" aria-hidden="true" />
          Inhoud laden
        </span>
      ) : (
        <pre className="v1-kb-source-text-body">{view.text}</pre>
      )}
    </Drawer>
  );
}
