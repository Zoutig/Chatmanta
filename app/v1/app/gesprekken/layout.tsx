// Gesprekken-layout: laadt de lokale stijl. Het zijpaneel voor een gesprek leeft
// als @drawer-slot op /v1/app-niveau (app/v1/app/@drawer/(.)gesprekken/[id]):
// een klik in de lijst opent het rechts in een Drawer, een directe link of
// refresh op /v1/app/gesprekken/[id] toont de volledige pagina.

import type { ReactNode } from 'react';
import './gesprekken.css';

export default function GesprekkenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
