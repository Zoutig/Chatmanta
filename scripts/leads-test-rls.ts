// Check: anon en ingelogde gebruikers (ook admin) kunnen NIETS op de leads-tabellen.
// Draait tegen V1-prod met de seed-accounts. Maakt via de service-role tijdelijke
// testrijen (bron 'test', domein 'rls-test.invalid') en ruimt die altijd weer op.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, 'public', any>;

const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!;
const serviceKey = process.env.V1_SUPABASE_SERVICE_ROLE_KEY!;
const NUL_UUID = '00000000-0000-0000-0000-000000000000';

type Fout = { code?: string; message?: string } | null;
const isRlsFout = (e: Fout) =>
  !!e && (e.code === '42501' || /row-level security|permission denied/i.test(e.message ?? ''));

function maak(key: string): Client {
  return createClient(url, key, { auth: { persistSession: false } }) as Client;
}

// Kolom die in elke rij van de tabel gevuld is (voor de "alle rijen"-filter bij update/delete).
const SLEUTEL: Record<string, string> = { leads: 'id', lead_activiteiten: 'id', lead_afzenders: 'user_id' };

async function check(label: string, client: Client, leadId: string, userId: string): Promise<number> {
  let fouten = 0;
  const fout = (m: string) => {
    console.error(`FOUT ${label}: ${m}`);
    fouten++;
  };

  const inserts: Record<string, Record<string, unknown>> = {
    leads: { bedrijfsnaam: 'rls-test-2', bron: 'test', domein: 'rls-test-2.invalid' },
    lead_activiteiten: { lead_id: leadId, soort: 'notitie' },
    lead_afzenders: {
      user_id: userId,
      naam: 'Test Persoon',
      voornaam: 'Test',
      telefoon: '0000000000',
      email: 'test@rls-test.invalid',
    },
  };
  const updates: Record<string, Record<string, unknown>> = {
    leads: { notitie: 'gehackt' },
    lead_activiteiten: { uitkomst: 'niet_bellen' },
    lead_afzenders: { naam: 'gehackt' },
  };

  for (const [t, payload] of Object.entries(inserts)) {
    const r = await client.from(t).select('*').limit(1);
    if (r.data && r.data.length > 0) fout(`kan ${t} lezen (${r.data.length} rij)`);

    const w = await client.from(t).insert(payload);
    if (!w.error) fout(`kan in ${t} schrijven`);
    else if (!isRlsFout(w.error)) fout(`insert ${t} faalde niet op RLS: ${w.error.code} ${w.error.message}`);

    const u = await client.from(t).update(updates[t]).not(SLEUTEL[t], 'is', null).select();
    if (u.data && u.data.length > 0) fout(`kan ${t} updaten (${u.data.length} rij)`);

    const d = await client.from(t).delete().not(SLEUTEL[t], 'is', null).select();
    if (d.data && d.data.length > 0) fout(`kan ${t} verwijderen (${d.data.length} rij)`);
  }

  for (const [naam, args] of [
    ['leads_claim_volgende', { p_user: NUL_UUID }],
    ['leads_opschonen', {}],
  ] as const) {
    const rpc = await client.rpc(naam, args);
    if (!rpc.error) fout(`kan ${naam} aanroepen`);
  }

  console.log(`${label}: ${fouten === 0 ? 'ok' : `${fouten} fout(en)`}`);
  return fouten;
}

async function main() {
  const service = maak(serviceKey);
  let fouten = 0;
  let leadId: string | null = null;
  let afzenderAangemaakt = false;
  let outsiderId: string | null = null;

  try {
    const { data: users, error: ue } = await service
      .from('users')
      .select('id,email,is_jorion_admin')
      .in('email', ['outsider@example.com', 'member@example.com']);
    if (ue) throw new Error(`users lezen faalde: ${ue.message}`);
    for (const u of users ?? []) console.log(`${u.email}: is_jorion_admin=${u.is_jorion_admin}`);
    const outsider = users?.find((u) => u.email === 'outsider@example.com');
    const member = users?.find((u) => u.email === 'member@example.com');
    if (!outsider || !member) throw new Error('seed-users niet gevonden');
    if (outsider.is_jorion_admin) throw new Error('outsider is onverwacht admin');
    if (!member.is_jorion_admin) console.warn('LET OP: member is geen jorion-admin; label klopt niet');
    outsiderId = outsider.id as string;

    // Testrijen via de service-role, zodat de lees-check echt iets te zien kan krijgen.
    const l = await service
      .from('leads')
      .insert({ bedrijfsnaam: 'rls-test', bron: 'test', domein: 'rls-test.invalid' })
      .select('id')
      .single();
    if (l.error) throw new Error(`testlead aanmaken faalde: ${l.error.message}`);
    leadId = l.data.id as string;
    const a = await service.from('lead_activiteiten').insert({ lead_id: leadId, soort: 'notitie' });
    if (a.error) throw new Error(`testactiviteit aanmaken faalde: ${a.error.message}`);
    const bestaand = await service.from('lead_afzenders').select('user_id').eq('user_id', outsiderId);
    if (!bestaand.data?.length) {
      const f = await service.from('lead_afzenders').insert({
        user_id: outsiderId,
        naam: 'Test Persoon',
        voornaam: 'Test',
        telefoon: '0000000000',
        email: 'test@rls-test.invalid',
      });
      if (f.error) throw new Error(`testafzender aanmaken faalde: ${f.error.message}`);
      afzenderAangemaakt = true;
    }
    for (const t of Object.keys(SLEUTEL)) {
      const c = await service.from(t).select('*', { count: 'exact', head: true });
      if (!c.count) throw new Error(`service-role ziet geen rijen in ${t}`);
    }

    fouten += await check('anon', maak(anonKey), leadId, outsiderId);

    const user = maak(anonKey);
    const li = await user.auth.signInWithPassword({
      email: 'outsider@example.com',
      password: process.env.V1_SEED_OUTSIDER_PW!,
    });
    if (li.error) throw new Error(`login outsider faalde: ${li.error.message}`);
    fouten += await check('authenticated (niet-admin)', user, leadId, li.data.user.id);

    // Ook een admin-sessie mag via de gewone client niets: toegang loopt alleen via service-role.
    const admin = maak(anonKey);
    const la = await admin.auth.signInWithPassword({
      email: 'member@example.com',
      password: process.env.V1_SEED_MEMBER_PW!,
    });
    if (la.error) throw new Error(`login member faalde: ${la.error.message}`);
    fouten += await check('authenticated (admin, zonder service-role)', admin, leadId, la.data.user.id);
  } catch (e) {
    console.error(`FOUT: ${e instanceof Error ? e.message : String(e)}`);
    fouten++;
  } finally {
    // Cascade ruimt de activiteit op; afzender alleen als wij hem hebben aangemaakt.
    if (afzenderAangemaakt && outsiderId) await service.from('lead_afzenders').delete().eq('user_id', outsiderId);
    await service.from('leads').delete().or('bron.eq.test,domein.eq.rls-test.invalid,domein.eq.rls-test-2.invalid');
    const rest = await service
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .or('bron.eq.test,domein.like.%rls-test%');
    console.log(`opruiming: ${rest.count ?? '?'} testleads over`);
    if (rest.count) fouten++;
  }
  process.exit(fouten ? 1 : 0);
}

main();
