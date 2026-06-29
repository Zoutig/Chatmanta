// Next.js instrumentation — draait éénmaal per runtime bij server-boot. We laden
// hier expliciet de DB error-sink, zodat captureError als observability-sink
// geregistreerd is vóór de eerste server-action/route draait. Expliciete import
// i.p.v. self-register-at-import: serverless cold-starts kunnen een module die
// nergens anders geïmporteerd wordt overslaan (dan blijft de sink een no-op).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // C2 (v0.10) — fail-closed env-assert vóór de eerste request. In productie
    // crasht de boot luid bij een ontbrekend EMBED_TOKEN_SECRET of een
    // USE_UPSTASH=true zonder Redis-vars (i.p.v. een stille 401-zwarte widget /
    // stille in-memory rate-limit). Buiten productie: luide waarschuwing.
    const { assertProductionEnv, isProductionRuntime } = await import(
      './lib/v0/server/startup-assert'
    );
    assertProductionEnv(process.env, { isProduction: isProductionRuntime(process.env) });

    await import('./lib/v0/server/error-capture');

    // M-E §1 — server-side Sentry (no-op zonder SENTRY_DSN). Onafhankelijk van de
    // V0 DB error-sink hierboven; beide vangen, geen single-sink-replace.
    const { initSentry } = await import('./lib/observability/sentry');
    initSentry();
  }
}

// Next 16 roept dit bij elke server-/route-fout → vangt de unhandled 500's en
// stuurt ze naar Sentry. Alleen in de nodejs-runtime (@sentry/node is node-only).
export async function onRequestError(
  err: unknown,
  request: unknown,
  context: unknown,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { captureServerError } = await import('./lib/observability/sentry');
  captureServerError(err, { request, context });
}
