// Quick env + Supabase connectivity check.
// Logs only pass/fail per check — never values.
// Run: npm run check-env

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url.startsWith('https://')) {
  fail('URL must start with https://');
  process.exit(1);
}
pass('URL starts with https://');
if (url.endsWith('/')) console.log('  (note: URL has trailing slash — usually fine but Supabase docs show no trailing slash)');
if (url.includes(' ')) fail('URL contains a space — likely paste error');
const looksLikeSupabase = url.includes('supabase.co') || url.includes('supabase.in') || url.includes('supabase.com');
if (looksLikeSupabase) pass('URL contains supabase.{co|in|com}');
else console.log('  ⚠ URL does not contain supabase.{co|in|com} — unusual but REST ping below will tell us if it works');

// Helper: choose auth headers based on key format.
// Old JWT keys (eyJ...) need both apikey + Authorization: Bearer.
// New sb_* keys are not JWTs — they go in apikey header only.
function authHeaders(key) {
  return key.startsWith('sb_')
    ? { 'apikey': key }
    : { 'apikey': key, 'Authorization': `Bearer ${key}` };
}

console.log('\n--- Public key auth ---');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anonKeyKind = anonKey.startsWith('sb_') ? 'sb_publishable' : 'legacy JWT (anon)';
console.log(`  Detected key kind: ${anonKeyKind}`);

// Try /auth/v1/settings first — what supabase-js hits initially.
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: authHeaders(anonKey) });
  if (res.status === 200) {
    pass(`Auth settings endpoint reachable (HTTP ${res.status}) — public key accepted`);
  } else {
    fail(`/auth/v1/settings returned HTTP ${res.status} — public key likely wrong`);
    // Also try REST root as fallback for diagnostic context
    const restRes = await fetch(`${url}/rest/v1/`, { headers: authHeaders(anonKey) });
    console.log(`  (diagnostic) /rest/v1/ returned HTTP ${restRes.status}`);
  }
} catch (err) {
  fail(`fetch failed: ${err.message}`);
}

console.log('\n--- Server key auth (admin REST API ping) ---');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serverKeyKind = serviceKey.startsWith('sb_') ? 'sb_secret' : 'legacy JWT (service_role)';
console.log(`  Detected key kind: ${serverKeyKind}`);
try {
  const res = await fetch(`${url}/rest/v1/`, { headers: authHeaders(serviceKey) });
  if (res.status === 200) pass(`Admin REST API reachable, server key accepted (HTTP ${res.status})`);
  else fail(`Admin REST API returned HTTP ${res.status} — server key likely wrong`);
} catch (err) {
  fail(`fetch failed: ${err.message}`);
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
