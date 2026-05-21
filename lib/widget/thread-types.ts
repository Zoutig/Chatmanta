// Thread-types voor de publieke widget. Pure DTOs zonder UI-koppeling, zodat
// de storage-laag (lib/widget/thread-store.ts) en de UI-laag (chatmanta-widget,
// thread-drawer) hetzelfde contract delen.
//
// V0: storage = localStorage. V1 (Supabase Auth) kan zelfde types hergebruiken
// voor een server-store implementatie.

export type ThreadMessage = {
  role: 'user' | 'assistant';
  content: string;
  id: string;
};

export type Thread = {
  id: string;
  /** Auto-gegenereerd uit eerste user-message, max 40 chars. */
  title: string;
  /** ms-since-epoch — sorteer-key voor de lijst. */
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
};
