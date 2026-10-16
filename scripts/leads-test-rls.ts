// Check: anon en een ingelogde niet-admin kunnen NIETS op de leads-tabellen.
// Draait tegen V1-prod met de seed-accounts. Schrijft niets (pogingen falen).
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!;
const TABELLEN = ['leads', 'lead_activiteiten', 'lead_afzenders'] as const;

async function check(label: string, client: ReturnType<typeof createClient>) {
  let fouten = 0;
  for (const t of TABELLEN) {
    const r = await client.from(t).select('*').limit(1);
    if (r.data && r.data.length > 0) {
      console.error(`FOUT ${label}: kan ${t} lezen`);
      fouten++;
    }
    const w = await client.from(t).insert({ bedrijfsnaam: 'rls-test', bron: 'test', domein: 'rls-test.invalid' } as never);
    if (!w.error) {
      console.error(`FOUT ${label}: kan in ${t} schrijven`);
      fouten++;
    }
  }
  const rpc = await client.rpc('leads_claim_volgende', { p_user: '00000000-0000-0000-0000-000000000000' });
  if (!rpc.error) {
    console.error(`FOUT ${label}: kan leads_claim_volgende aanroepen`);
    fouten++;
  }
  console.log(`${label}: ${fouten === 0 ? 'ok' : `${fouten} fout(en)`}`);
  return fouten;
}

async function main() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  let fouten = await check('anon', anon);
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await user.auth.signInWithPassword({
    email: 'outsider@example.com',
    password: process.env.V1_SEED_OUTSIDER_PW!,
  });
  if (error) throw new Error(`login outsider faalde: ${error.message}`);
  fouten += await check('authenticated (niet-admin)', user);
  // Ook een admin-sessie mag via de gewone client niets: toegang loopt alleen via service-role.
  const admin = createClient(url, anonKey, { auth: { persistSession: false } });
  const a = await admin.auth.signInWithPassword({ email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW! });
  if (a.error) throw new Error(`login member faalde: ${a.error.message}`);
  fouten += await check('authenticated (admin, zonder service-role)', admin);
  process.exit(fouten ? 1 : 0);
}

main();
