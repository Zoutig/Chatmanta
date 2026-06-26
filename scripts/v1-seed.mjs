// V1 fundament §4 — seed: dev-only testgebruikers + org + membership in het
// V1-prod-project. Idempotent (herhaald draaien is veilig). Bewijst tegelijk dat
// de V1 Supabase-auth + tenancy-tabellen werken.
//
// Draai met: npm run v1:seed
//
// LET OP: dit zet TESTgebruikers in V1-prod. V1-prod is in de fundamentfase nog
// leeg/zonder echte klantdata — prima. Verwijder deze seed (member@/outsider@/
// seed-org) vóór er echte klantdata in V1 landt.
//
// Reikt naar de Supabase REST/Auth-API over HTTPS (443), niet de pooler (5432/
// 6543, vanaf deze machine geblokkeerd) — dus dit werkt waar `migrate` faalt.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
const key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ NEXT_PUBLIC_V1_SUPABASE_URL + V1_SUPABASE_SERVICE_ROLE_KEY vereist in .env.local');
  process.exit(1);
}
const memberPw = process.env.V1_SEED_MEMBER_PW;
const outsiderPw = process.env.V1_SEED_OUTSIDER_PW;
if (!memberPw || !outsiderPw) {
  console.error('✗ V1_SEED_MEMBER_PW + V1_SEED_OUTSIDER_PW vereist in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Maak een auth-user (email_confirm) of vind de bestaande. Geeft het user-id. */
async function ensureUser(email, password) {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user) {
    console.log(`✓ user aangemaakt: ${email} (${data.user.id})`);
    return data.user.id;
  }
  if (error && !/already|exists|registered|duplicate/i.test(error.message)) {
    throw error;
  }
  // Bestond al → opzoeken via listUsers.
  const { data: list, error: lerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (lerr) throw lerr;
  const u = list.users.find((x) => x.email === email);
  if (!u) throw new Error(`user ${email} bestaat zogenaamd al maar is niet gevonden`);
  console.log(`• user bestond al: ${email} (${u.id})`);
  return u.id;
}

const memberId = await ensureUser('member@example.com', memberPw);
const outsiderId = await ensureUser('outsider@example.com', outsiderPw);

// Org (upsert op slug). Service-role bypasst RLS.
const { data: org, error: oerr } = await sb
  .from('organizations')
  .upsert({ name: 'Seed Org', slug: 'seed-org' }, { onConflict: 'slug' })
  .select('id')
  .single();
if (oerr) throw oerr;
console.log(`✓ org seed-org: ${org.id}`);

// Membership ALLEEN voor member (outsider blijft buiten → deny-path).
const { error: merr } = await sb
  .from('organization_members')
  .upsert(
    { organization_id: org.id, user_id: memberId, role: 'owner' },
    { onConflict: 'organization_id,user_id' },
  );
if (merr) throw merr;
console.log('✓ membership: member@example.com → seed-org (owner)');

// Org B (PR-1b cross-org-isolatie). outsider wordt lid van B en blijft GEEN lid
// van A → de auth.spec deny-path op /v1/app (die A gebruikt) blijft kloppen. Org B
// krijgt in v1:seed:chunks een eigen chatbot + een chunk met een uniek geheim token.
const { data: orgB, error: oberr } = await sb
  .from('organizations')
  .upsert({ name: 'Seed Org B', slug: 'seed-org-b' }, { onConflict: 'slug' })
  .select('id')
  .single();
if (oberr) throw oberr;
console.log(`✓ org seed-org-b: ${orgB.id}`);

const { error: mberr } = await sb
  .from('organization_members')
  .upsert(
    { organization_id: orgB.id, user_id: outsiderId, role: 'member' },
    { onConflict: 'organization_id,user_id' },
  );
if (mberr) throw mberr;
console.log('✓ membership: outsider@example.com → seed-org-b (member)');

console.log('\n--- Zet dit in .env.local ---');
console.log(`V1_SEED_ORG_ID=${org.id}`);
console.log(`\n(member=${memberId} lid van A; outsider=${outsiderId} lid van B, GEEN lid van A → deny-path op /v1/app)`);
