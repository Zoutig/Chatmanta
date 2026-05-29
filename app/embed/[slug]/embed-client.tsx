'use client';

import { useEffect } from 'react';
import { ChatMantaWidget, type ChatMantaWidgetProps } from '@/app/widget/components/chatmanta-widget';
import { ClientErrorBoundary } from '@/lib/observability/client-error-boundary';
import { reportClientError } from '@/lib/observability/report-client-error';

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
  }, [props.embedToken, props.orgSlug]);

  // Vang niet-React widget-crashes (event-handlers, async, promise-rejections);
  // render-fouten worden door de ClientErrorBoundary hieronder gevangen.
  useEffect(() => {
    const trust = { orgSlug: props.orgSlug, embedToken: props.embedToken } as const;
    const onError = (e: ErrorEvent) =>
      reportClientError({
        surface: 'widget',
        message: e.message || 'window error',
        stack: e.error instanceof Error ? e.error.stack : undefined,
        url: e.filename || undefined,
        code: 'CLIENT_JS',
        ...trust,
      });
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      reportClientError({
        surface: 'widget',
        message: r instanceof Error ? r.message : String(r ?? 'unhandled rejection'),
        stack: r instanceof Error ? r.stack : undefined,
        code: 'CLIENT_JS',
        ...trust,
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [props.embedToken, props.orgSlug]);

  return (
    <ClientErrorBoundary surface="widget" orgSlug={props.orgSlug} embedToken={props.embedToken}>
      <ChatMantaWidget {...props} embedded parentOrigin="*" />
    </ClientErrorBoundary>
  );
}
