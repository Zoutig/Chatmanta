// C2 (v0.10) — fail-closed startup-assert. Draait éénmaal bij server-boot vanuit
// instrumentation.ts (register(), alleen NEXT_RUNTIME==='nodejs').
//
// Waarom: twee productie-misconfiguraties falen vandaag STIL, wat het ergst is —
//   1. Ontbrekend EMBED_TOKEN_SECRET → verifyEmbedToken geeft `false` zonder log →
//      de hele publieke widget gaat 401-zwart zonder signaal.
//   2. USE_UPSTASH=true zonder Redis-vars → rate-limit valt stil terug op een
//      per-process in-memory teller die niet over serverless-instances telt.
// Beide horen LUID te falen vóór de eerste request, niet pas als een bezoeker erop
// stuit. In productie = harde boot-fout (deploy faalt zichtbaar); buiten productie =
// een luide console-waarschuwing zodat lokale dev zonder secret nog kan booten.
//
// Pure functies (geen 'server-only', geen import van de echte clients) → tsx/node-
// test-baar, exact zoals hard-facts.ts.

export type StartupEnv = Record<string, string | undefined>;

export type StartupCheck = { ok: boolean; errors: string[] };

const MIN_EMBED_SECRET_LEN = 16;

/** Pure validatie van de productie-kritische env. Geen side-effects. */
export function checkProductionEnv(env: StartupEnv): StartupCheck {
  const errors: string[] = [];

  const embed = env.EMBED_TOKEN_SECRET;
  if (!embed || embed.length < MIN_EMBED_SECRET_LEN) {
    errors.push(
      `EMBED_TOKEN_SECRET ontbreekt of is < ${MIN_EMBED_SECRET_LEN} chars. ` +
        'Zonder een geldig secret faalt verifyEmbedToken fail-closed en gaat de hele ' +
        'publieke embed-widget 401-zwart. Zet een random secret van minimaal ' +
        `${MIN_EMBED_SECRET_LEN} tekens (bv. \`openssl rand -hex 32\`).`,
    );
  }

  if (env.USE_UPSTASH === 'true') {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      errors.push(
        'USE_UPSTASH=true maar UPSTASH_REDIS_REST_URL en/of UPSTASH_REDIS_REST_TOKEN ' +
          'ontbreekt. De rate-limit zou stil terugvallen op een per-process in-memory ' +
          'teller die niet over serverless-instances telt. Zet beide Upstash-vars, of ' +
          'haal USE_UPSTASH weg om bewust in-memory te draaien.',
      );
    }
  }

  // V0/V1-namespace-split (kickoff §3): sinds de env-rename leest de app de
  // Supabase-clients via V0_*/V1_*. Een ontbrekende var faalt anders pas bij de
  // eerste request (V0 service-role-throw) of stil op een leeg V1-project — dus
  // hier fail-loud bij boot. (V1_DATABASE_URL valt buiten: alleen voor migrate:v1.)
  const requiredSupabase = [
    'V0_SUPABASE_URL',
    'V0_SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_V1_SUPABASE_URL',
    'NEXT_PUBLIC_V1_SUPABASE_ANON_KEY',
    'V1_SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const name of requiredSupabase) {
    if (!env[name]) {
      errors.push(`${name} ontbreekt — vereist sinds de V0/V1-namespace-split (kickoff §3).`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Boot-assert. In productie: gooit bij config-fouten (fail-closed → de deploy/boot
 *  faalt zichtbaar). Buiten productie: luide console.error zodat lokale dev zonder
 *  volledige `.env.local` nog kan booten, maar de fout niet onopgemerkt blijft. */
export function assertProductionEnv(
  env: StartupEnv,
  opts: { isProduction: boolean },
): void {
  const { ok, errors } = checkProductionEnv(env);
  if (ok) return;
  const header = '[startup-assert] productie-env onvolledig:';
  const body = errors.map((e) => `  - ${e}`).join('\n');
  const msg = `${header}\n${body}`;
  if (opts.isProduction) {
    // Fail-closed: laat de boot crashen zodat het in de deploy-/function-logs
    // direct zichtbaar is i.p.v. pas bij een bezoeker.
    throw new Error(msg);
  }
  console.error(`${msg}\n  (niet-productie: boot gaat door — fix dit vóór je deployt.)`);
}

/** Resolve of we in een productie-runtime draaien (Vercel prod óf NODE_ENV=production). */
export function isProductionRuntime(env: StartupEnv): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}
