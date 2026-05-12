import { AppError, toAppError, type AppErrorCode } from './app-error';

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
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends Record<string, unknown> = {}> =
  | ({ ok: true } & T)
  | ActionFail;

export async function actionTry<T extends Record<string, unknown>>(
  fn: () => Promise<T> | T,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, ...data };
  } catch (err) {
    const appErr = toAppError(err);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[actionTry]', appErr.code, appErr.message, appErr.cause ?? '');
    }
    return {
      ok: false,
      error: appErr.message,
      code: appErr.code,
      retryAfterSec: appErr.retryAfterSec,
    };
  }
}

export function fail(code: AppErrorCode, message?: string, retryAfterSec?: number): never {
  throw new AppError(code, { message, retryAfterSec });
}
