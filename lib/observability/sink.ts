// Observability sink-seam — het contract waar lib/errors + route-handlers van
// afhangen, ZONDER het admin/v0-module te importeren (vermijdt layering-inversie:
// lib/errors is fundamenteel). De echte DB-sink (lib/v0/server/error-capture.ts)
// registreert zich bij boot via instrumentation.ts. Default = no-op, zodat code
// die capture aanroept nooit faalt als er (nog) geen sink geregistreerd is.
//
// Géén 'server-only' en géén node/DB-imports hier: dit blijft een pure
// type-/registry-module zodat hij overal veilig te importeren is.

export type ErrorSurface = 'widget' | 'dashboard' | 'chatbot' | 'api' | 'cron' | 'system';
export type ErrorSeverity = 'error' | 'warning' | 'info';
export type ErrorStatus = 'open' | 'resolved' | 'ignored';

/** Volledige snapshot van één voorval — wordt opgeslagen in last_context. */
export type ErrorContext = {
  requestId?: string;
  stack?: string;
  topFrame?: string;
  url?: string;
  method?: string;
  route?: string;
  botVersion?: string;
  threadId?: string;
  /** Gebruikersinvoer NA PII-redactie (nooit rauw). */
  inputRedacted?: string;
  userAgentHash?: string;
  breadcrumbs?: string[];
  commit?: string;
  env?: string;
  /** Publiek endpoint: Origin aanwezig maar mismatcht → verdacht. */
  originSuspect?: boolean;
};

/** Eén fout-voorval dat gecaptured wordt. severity/title zijn optioneel:
 *  captureError leidt severity af van code en valt voor title terug op code. */
export type ErrorEvent = {
  surface: ErrorSurface;
  severity?: ErrorSeverity;
  code: string; // AppErrorCode | 'CLIENT_JS' | 'UNKNOWN'
  title?: string;
  message?: string;
  organizationId?: string | null;
  context?: ErrorContext;
};

/** Eén gegroepeerde rij uit admin_error_groups (camelCase, gemapt in errors.ts). */
export type ErrorGroup = {
  id: string;
  fingerprint: string;
  organizationId: string | null;
  surface: ErrorSurface;
  severity: ErrorSeverity;
  code: string;
  title: string;
  message: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: ErrorStatus;
  resolvedAt: string | null;
  context: ErrorContext;
};

export interface ErrorSink {
  capture(event: ErrorEvent): void;
}

let _sink: ErrorSink = { capture() {} };

/** Registreer de actieve sink (expliciet bij boot, niet self-register-at-import
 *  — Next serverless cold-starts kunnen een self-registrerende module overslaan). */
export function registerSink(sink: ErrorSink): void {
  _sink = sink;
}

export function getSink(): ErrorSink {
  return _sink;
}

/** Severity-default per code (beslissing #2 + #6): verwachte faals → 'info'
 *  (verborgen uit de default error+warning-view); echte fouten → 'error'.
 *  Een expliciete severity op het ErrorEvent wint hier altijd van. */
export function severityForCode(code: string): ErrorSeverity {
  switch (code) {
    case 'RATE_LIMIT':
    case 'AUTH_REQUIRED':
    case 'AUTH_FORBIDDEN':
    case 'INPUT_INVALID':
    case 'INJECTION_BLOCKED':
      return 'info';
    case 'INGEST_TOO_LARGE':
    case 'INGEST_TYPE':
    case 'NOT_FOUND':
      return 'warning';
    default:
      return 'error';
  }
}
