// De Drawer staat in een layout (niet in de page), zodat hij tijdens het laden
// (loading.tsx) al open is en niet opnieuw inschuift als de inhoud binnenkomt.

import type { ReactNode } from 'react';
import { ConversationDrawer } from '../../_conversation/conversation-drawer';

export default function ConversationDrawerLayout({ children }: { children: ReactNode }) {
  return <ConversationDrawer>{children}</ConversationDrawer>;
}
