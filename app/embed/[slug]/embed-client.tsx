'use client';

import { useEffect } from 'react';
import { ChatMantaWidget, type ChatMantaWidgetProps } from '@/app/widget/components/chatmanta-widget';

type Props = ChatMantaWidgetProps & { embedToken: string };

export function EmbedClient(props: Props) {
  // Heartbeat: één ping bij mount. host komt uit ?h= dat de loader meegaf.
  useEffect(() => {
    const host = new URLSearchParams(window.location.search).get('h') ?? undefined;
    void fetch(`/api/v0/widget/ping?org=${encodeURIComponent(props.orgSlug)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatmanta-embed': props.embedToken,
      },
      body: JSON.stringify({ host }),
    }).catch(() => {
      // best-effort
    });
  }, [props.embedToken]);

  return <ChatMantaWidget {...props} embedded parentOrigin="*" />;
}
