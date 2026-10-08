'use client';

// Zijpaneel om het onderschepte gesprek (@drawer/(.)[id]). Sluiten = terug in de
// geschiedenis, zodat de lijst (met filters en scrollpositie) blijft staan.

import { useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/app/v1/_ui/drawer';

export function ConversationDrawer({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Stabiel houden: de Drawer zet focus en scroll-lock opnieuw bij een nieuwe onClose.
  const close = useCallback(() => router.back(), [router]);
  return (
    <Drawer title="Gesprek" onClose={close}>
      {children}
    </Drawer>
  );
}
