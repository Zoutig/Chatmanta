// De Drawer staat in een layout (niet in de page), zodat hij tijdens het laden
// (loading.tsx) al open is en niet opnieuw inschuift als de inhoud binnenkomt.

import type { ReactNode } from 'react';
import '@/app/voorbeeld/(dashboard)/gesprekken/gesprekken.css';
import { ConversationDrawer } from '@/app/voorbeeld/(dashboard)/gesprekken/_conversation/conversation-drawer';

export default function ConversationDrawerLayout({ children }: { children: ReactNode }) {
  return <ConversationDrawer>{children}</ConversationDrawer>;
}
