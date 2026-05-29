import { AppError, toAppError, type AppErrorCode } from './app-error';
import { newRequestId } from './request-id';
import { getSink, severityForCode, type ErrorSurface } from '@/lib/observability/sink';

// Uniform return-pattern voor alle server actions.
//
// Voorheen had ChatManta vier verschillende error-shapes:
// `{ ok, error }`, `{ kind, message }`, `{ error? }`, en losse throws. Met
// ActionResult krijgt de UI één discriminator (`ok`) plus altijd een `code`
// op de error-branch — die mapt via userView() naar gebruikersvriendelijke
// tekst.
//
// Bewust legacy-friendly: de generic `T` is een record (`{ summary }`,
// `{ detail }`, etc.) dat we platdrukken op de ok-branch. Bestaande callers
// die `result.summary` of `result.detail` doen blijven werken zonder dat we
// elke caller moeten herschrijven. `error: string` blijft staan zodat oude
// `console.warn('xxx', result.error)`-patronen blijven werken.

export type ActionFail = {
  ok: false;
  error: string;
  code: AppErrorCode;
  retryAfterSec?: number;
  /** Correlatie-ID (chm_…) — server-actions hadden dit voorheen niet; nu
   *  gedeeld met de gelogde fout-groep zodat de UI/Copy-knop het kan tonen. */
  requestId?: string;
};

/** Optionele tagging zodat een gevangen server-action-fout in de juiste surface
 *  en met org-context in admin_error_groups belandt. */
export type ActionMeta = {
  surface?: ErrorSurface;
  route?: string;
  organizationId?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends Record<string, unknown> = {}> =
  | ({ ok: true } & T)
  | ActionFail;

export async function actionTry<T extends Record<string, unknown>>(
  fn: () => Promise<T> | T,
  meta?: ActionMeta,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, ...data };
  } catch (err) {
    const appErr = toAppError(err);
    const requestId = newRequestId();
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[actionTry]', appErr.code, appErr.message, appErr.cause ?? '');
    }
    // Capture via de observability-sink (NIET een directe import van de admin/v0-
    // laag — dat zou een layering-inversie zijn; eslint bewaakt dat). In prod was
    // dit voorheen volledig stil; nu belandt elke server-action-fout in
    // admin_error_groups, correleerbaar via requestId.
    getSink().capture({
      surface: meta?.surface ?? 'dashboard',
      severity: severityForCode(appErr.code),
      code: appErr.code,
      message: appErr.message,
      error: appErr.cause ?? appErr,
      organizationId: meta?.organizationId ?? null,
      context: { requestId, route: meta?.route },
    });
    return {
      ok: false,
      error: appErr.message,
      code: appErr.code,
      retryAfterSec: appErr.retryAfterSec,
      requestId,
    };
  }
}

export function fail(code: AppErrorCode, message?: string, retryAfterSec?: number): never {
  throw new AppError(code, { message, retryAfterSec });
}
