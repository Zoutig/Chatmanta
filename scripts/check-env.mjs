// Quick env + Supabase connectivity check.
// Logs only pass/fail per check — never values.
// Run: npm run check-env

const required = [
  'V0_SUPABASE_URL',
  'V0_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_V1_SUPABASE_URL',
  'NEXT_PUBLIC_V1_SUPABASE_ANON_KEY',
  'V1_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_PRODUCT_NAME',
  'NEXT_PUBLIC_APP_URL',
];

let allOk = true;
const fail = (msg) => { console.log(`✗ ${msg}`); allOk = false; };
const pass = (msg) => console.log(`✓ ${msg}`);

console.log('--- Env presence ---');
for (const key of required) {
  const value = process.env[key];
  if (!value) fail(`${key} is missing`);
  else if (value.startsWith('your-')) fail(`${key} still has placeholder value`);
  else pass(`${key} present (${value.length} chars)`);
}

if (!allOk) {
  console.log('');
  console.log('Fix the above before continuing. .env.local must contain real values.');
  process.exit(1);
}

console.log('\n--- Supabase URL format ---');
function checkUrlFormat(label, envKey) {
  const url = process.env[envKey];
  if (!url.startsWith('https://')) {
    fail(`${envKey} must start with https://`);
    return null;
  }
  pass(`${label} URL starts with https://`);
  if (url.endsWith('/')) console.log('  (note: URL has trailing slash — usually fine but Supabase docs show no trailing slash)');
  if (url.includes(' ')) fail(`${envKey} contains a space — likely paste error`);
  const looksLikeSupabase = url.includes('supabase.co') || url.includes('supabase.in') || url.includes('supabase.com');
  if (looksLikeSupabase) pass(`${label} URL contains supabase.{co|in|com}`);
  else console.log(`  ⚠ ${label} URL does not contain supabase.{co|in|com} — unusual but REST ping below will tell us if it works`);
  return url;
}
const v0Url = checkUrlFormat('V0', 'V0_SUPABASE_URL');
const v1Url = checkUrlFormat('V1', 'NEXT_PUBLIC_V1_SUPABASE_URL');
if (!v0Url || !v1Url) process.exit(1);

// Helper: choose auth headers based on key format.
// Old JWT keys (eyJ...) need both apikey + Authorization: Bearer.
// New sb_* keys are not JWTs — they go in apikey header only.
function authHeaders(key) {
  return key.startsWith('sb_')
    ? { 'apikey': key }
    : { 'apikey': key, 'Authorization': `Bearer ${key}` };
}

// V0 has no public/anon key (server-only sandbox) — only a server-key ping.
console.log('\n--- V0 server key auth (admin REST API ping) ---');
const v0ServiceKey = process.env.V0_SUPABASE_SERVICE_ROLE_KEY;
const v0ServiceKeyKind = v0ServiceKey.startsWith('sb_') ? 'sb_secret' : 'legacy JWT (service_role)';
console.log(`  Detected key kind: ${v0ServiceKeyKind}`);
try {
  const res = await fetch(`${v0Url}/rest/v1/`, { headers: authHeaders(v0ServiceKey) });
  if (res.status === 200) pass(`V0 admin REST API reachable, server key accepted (HTTP ${res.status})`);
  else fail(`V0 admin REST API returned HTTP ${res.status} — server key likely wrong`);
} catch (err) {
  fail(`V0 fetch failed: ${err.message}`);
}

console.log('\n--- V1 public key auth ---');
const v1AnonKey = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY;
const v1AnonKeyKind = v1AnonKey.startsWith('sb_') ? 'sb_publishable' : 'legacy JWT (anon)';
console.log(`  Detected key kind: ${v1AnonKeyKind}`);

// Try /auth/v1/settings first — what supabase-js hits initially.
try {
  const res = await fetch(`${v1Url}/auth/v1/settings`, { headers: authHeaders(v1AnonKey) });
  if (res.status === 200) {
    pass(`V1 auth settings endpoint reachable (HTTP ${res.status}) — public key accepted`);
  } else {
    fail(`V1 /auth/v1/settings returned HTTP ${res.status} — public key likely wrong`);
    // Also try REST root as fallback for diagnostic context
    const restRes = await fetch(`${v1Url}/rest/v1/`, { headers: authHeaders(v1AnonKey) });
    console.log(`  (diagnostic) /rest/v1/ returned HTTP ${restRes.status}`);
  }
} catch (err) {
  fail(`V1 fetch failed: ${err.message}`);
}

console.log('\n--- V1 server key auth (admin REST API ping) ---');
const v1ServiceKey = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
const v1ServiceKeyKind = v1ServiceKey.startsWith('sb_') ? 'sb_secret' : 'legacy JWT (service_role)';
console.log(`  Detected key kind: ${v1ServiceKeyKind}`);
try {
  const res = await fetch(`${v1Url}/rest/v1/`, { headers: authHeaders(v1ServiceKey) });
  if (res.status === 200) pass(`V1 admin REST API reachable, server key accepted (HTTP ${res.status})`);
  else fail(`V1 admin REST API returned HTTP ${res.status} — server key likely wrong`);
} catch (err) {
  fail(`V1 fetch failed: ${err.message}`);
}

console.log('\n--- V0 AI provider keys (soft check) ---');
const v0Keys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
for (const k of v0Keys) {
  const v = process.env[k];
  if (!v) console.log(`  ⚠ ${k} not set — required vóór V0 RAG-flow getest kan worden`);
  else if (v.startsWith('sk-ant-your') || v.startsWith('sk-your')) console.log(`  ⚠ ${k} still placeholder`);
  else pass(`${k} present (${v.length} chars)`);
}

console.log('');
if (allOk) {
  console.log('✓ All required checks passed.');
  process.exit(0);
} else {
  console.log('✗ One or more checks failed. Fix .env.local and retry.');
  process.exit(1);
}
