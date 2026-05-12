import { APP_ERROR_CODES, isAppErrorCode, type AppErrorCode } from './codes';

type AppErrorOpts = {
  message?: string;
  cause?: unknown;
  retryAfterSec?: number;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryAfterSec?: number;
  override readonly cause?: unknown;

  constructor(code: AppErrorCode, opts: AppErrorOpts = {}) {
    super(opts.message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = httpStatusFor(code);
    this.retryAfterSec = opts.retryAfterSec;
    this.cause = opts.cause;
  }
}

export function isAppError(x: unknown): x is AppError {
  return x instanceof AppError;
}

// Wrap onbekende waarden in AppError('INTERNAL'). Idempotent: passeert
// bestaande AppError-instances ongewijzigd. Bewaart de oorspronkelijke error
// als `cause` zodat server-side logging volledige context heeft.
export function toAppError(x: unknown): AppError {
  if (isAppError(x)) return x;
  const message = x instanceof Error ? x.message : typeof x === 'string' ? x : 'unknown error';
  return new AppError('INTERNAL', { message, cause: x });
}

export function httpStatusFor(code: AppErrorCode): number {
  switch (code) {
    case 'RATE_LIMIT':
      return 429;
    case 'INPUT_INVALID':
      return 400;
    case 'INJECTION_BLOCKED':
      return 400;
    case 'INGEST_TOO_LARGE':
    case 'INGEST_TYPE':
    case 'INGEST_READ_FAILED':
      return 400;
    case 'AUTH_REQUIRED':
      return 401;
    case 'AUTH_FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'LLM_TIMEOUT':
      return 504;
    case 'LLM_UNAVAILABLE':
    case 'EMBED_FAILED':
      return 502;
    case 'INTERNAL':
      return 500;
  }
}

// JSON-shape voor responses op API-routes en server-actions.
export type AppErrorWire = {
  code: AppErrorCode;
  requestId?: string;
  retryAfterSec?: number;
};

export function toWire(err: AppError, requestId?: string): AppErrorWire {
  return {
    code: err.code,
    requestId,
    retryAfterSec: err.retryAfterSec,
  };
}

// Defensieve parse voor NDJSON `error`-events en JSON-bodies van faalpaden.
// Onbekende code → 'INTERNAL'.
export function fromWire(x: unknown): AppErrorWire {
  const obj = (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}) ?? {};
  const code = isAppErrorCode(obj.code) ? obj.code : 'INTERNAL';
  const requestId = typeof obj.requestId === 'string' ? obj.requestId : undefined;
  const retryAfterSec = typeof obj.retryAfterSec === 'number' ? obj.retryAfterSec : undefined;
  return { code, requestId, retryAfterSec };
}

export { APP_ERROR_CODES, isAppErrorCode };
export type { AppErrorCode };
