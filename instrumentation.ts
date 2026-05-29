// Next.js instrumentation — draait éénmaal per runtime bij server-boot. We laden
// hier expliciet de DB error-sink, zodat captureError als observability-sink
// geregistreerd is vóór de eerste server-action/route draait. Expliciete import
// i.p.v. self-register-at-import: serverless cold-starts kunnen een module die
// nergens anders geïmporteerd wordt overslaan (dan blijft de sink een no-op).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/v0/server/error-capture');
  }
}
