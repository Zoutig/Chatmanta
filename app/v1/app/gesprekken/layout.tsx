// Gesprekken-layout: de lijst (children) plus een zijpaneel-slot (@drawer).
// Een klik op een gesprek in de lijst wordt onderschept door @drawer/(.)[id] en
// opent het gesprek rechts in een Drawer; een directe link of refresh op
// /v1/app/gesprekken/[id] toont de volledige pagina (Next 16 parallel +
// intercepting routes, zie docs parallel-routes.md › Modals).

import type { ReactNode } from 'react';
import './gesprekken.css';

export default function GesprekkenLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
