// Command Center layout — sidebar + content wrapper.
//
// Auth: de globale proxy.ts (root) gate-t alle paden achter de V0 demo-
// password cookie. Server actions doen extra requireV0Auth() defense-in-
// depth (zie app/actions/commandcenter.ts).

import type { Metadata } from 'next';
import { CommandShell } from './components/command-shell';

export const metadata: Metadata = {
  title: 'ChatManta · Command Center',
  description: 'Founder cockpit voor taken, roadmap en testklanten.',
};

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CommandShell>{children}</CommandShell>;
}
