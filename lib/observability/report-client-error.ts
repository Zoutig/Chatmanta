// Client-side fout-reporter → POST /api/v0/client-error. Browser-only, gebruikt
// sendBeacon (overleeft page-unload) met fetch+keepalive als fallback. Mag NOOIT
// zelf een fout veroorzaken (alles in try/catch). Verzendt geen secrets; de
// server bepaalt surface/severity/org en redigeert PII server-side.

export type ClientErrorReport = {
  surface: 'widget' | 'dashboard';
  message: string;
  stack?: string;
  url?: string;
  code?: string;
  digest?: string;
};

const ENDPOINT = '/api/v0/client-error';

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({
      surface: report.surface,
      message: report.message?.slice(0, 1000),
      stack: report.stack?.slice(0, 4000),
      url: report.url ?? window.location?.href,
      code: report.code,
      digest: report.digest,
      userAgent: navigator?.userAgent,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // reporter mag de app nooit laten crashen
  }
}
