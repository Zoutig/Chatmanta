'use client';

// Client-brug tussen de (server-)admin-layout en de gedeelde ShellFrame: de
// layout mag geen functies naar een client component sturen, dus de
// sidebar-render-prop wordt hier gemaakt. Alleen getallen komen van de server.

import type { ReactNode } from 'react';
import { ShellFrame } from '@/app/v1/app/_shell/shell-frame';
import { AdminSidebar } from './sidebar';

export function AdminFrame({
  quizCount,
  feedbackCount,
  children,
}: {
  quizCount: number;
  feedbackCount: number;
  children: ReactNode;
}) {
  return (
    <ShellFrame
      homeHref="/v1/admin"
      sidebar={(closeNav) => (
        <AdminSidebar quizCount={quizCount} feedbackCount={feedbackCount} onNavigate={closeNav} />
      )}
    >
      {children}
    </ShellFrame>
  );
}
