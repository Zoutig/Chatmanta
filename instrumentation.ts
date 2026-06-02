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
  }
}
