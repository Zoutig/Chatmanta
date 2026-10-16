// Integratietest van de data-laag (lib/leads/server/db.ts) tegen V1-prod.
// Maakt 2 testleads (bron 'test', domeinen *.invalid, niche 'e2e-db-test') en ruimt ze altijd op.
// Draaien: npm run leads:test-db  (db.ts importeert 'server-only' → --conditions=react-server)
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import * as dbl from '../lib/leads/server/db';
import { pakStand } from '../lib/leads/types';
import { volgendeStand } from '../lib/leads/volgende-stand';

const NICHE = 'e2e-db-test';

function eis(ok: boolean, m: string) {
  if (!ok) throw new Error(`CHECK MISLUKT: ${m}`);
  console.log(`ok: ${m}`);
}

async function main() {
  const db = getV1ServiceRoleClient();
  const ids: string[] = [];
  try {
    const { data: u, error: ue } = await db.from('users').select('id').eq('email', 'member@example.com').single();
    if (ue || !u) throw new Error(`member niet gevonden: ${ue?.message}`);
    const userId = u.id as string;

    const maak = async (naam: string, domein: string, score: number) => {
      const { data, error } = await db
        .from('leads')
        .insert({ bedrijfsnaam: naam, bron: 'test', domein, niche: NICHE, plaats: 'Testdorp', score, score_max: 100 })
        .select('id')
        .single();
      if (error) throw new Error(`testlead aanmaken faalde: ${error.message}`);
      ids.push(data.id as string);
      return data.id as string;
    };
    const laagId = await maak('E2E laag', 'e2e-laag.invalid', 10);
    const hoogId = await maak('E2E hoog', 'e2e-hoog.invalid', 90);

    // claimVolgende: hoogste score binnen de testniche
    const geclaimd = await dbl.claimVolgende(db, userId, { niche: NICHE });
    eis(geclaimd?.id === hoogId, 'claimVolgende geeft de lead met de hoogste score');
    eis(geclaimd?.geclaimd_door === userId, 'lead staat op naam van de claimer');

    // pasStandToe + maakOngedaan
    const lead = await dbl.haalLead(db, hoogId);
    const voor = pakStand(lead);
    const nu = new Date();
    const overgang = volgendeStand(voor, { uitkomst: 'niet_opgenomen', voicemail: false }, nu);
    const actId = await dbl.pasStandToe(db, {
      lead,
      userId,
      nieuw: overgang.stand,
      soort: 'belpoging',
      uitkomst: 'niet_opgenomen',
      details: overgang.details,
      vrijgeven: true,
    });
    const na = await dbl.haalLead(db, hoogId);
    eis(na.pogingen_niet_opgenomen === 1 && na.geclaimd_door === null, 'stand toegepast en claim vrijgegeven');
    const teller = await dbl.tellerVandaag(db, userId, new Date(nu.getTime() - 60_000));
    eis(teller.gebeld >= 1, 'tellerVandaag telt de belpoging');

    const leadId = await dbl.maakOngedaan(db, actId);
    eis(leadId === hoogId, 'maakOngedaan geeft de lead-id terug');
    const terug = pakStand(await dbl.haalLead(db, hoogId));
    eis(JSON.stringify(terug) === JSON.stringify(voor), 'stand is na ongedaan weer identiek');
    let dubbel = false;
    try {
      await dbl.maakOngedaan(db, actId);
    } catch {
      dubbel = true;
    }
    eis(dubbel, 'tweede keer ongedaan maken wordt geweigerd');

    // lijst en tellers
    const lijst = await dbl.lijstLeads(db, { tab: 'vandaag', niche: NICHE, zoek: 'e2e' });
    eis(lijst.totaal === 2 && lijst.leads[0].id === hoogId, 'lijstLeads: 2 resultaten, hoogste score eerst');
    const kwaad = await dbl.lijstLeads(db, { tab: 'vandaag', zoek: 'x,id.eq.1)(%' });
    eis(Array.isArray(kwaad.leads), 'lijstLeads overleeft een zoekterm met filter-tekens');
    const t = await dbl.tellers(db);
    eis(t.vandaag >= 2, 'tellers.vandaag telt de testleads mee');
    const opt = await dbl.filterOpties(db);
    eis(opt.niches.includes(NICHE), 'filterOpties bevat de testniche');
    eis(!!(await dbl.zoekDubbel(db, 'e2e-laag.invalid', null)) && laagId.length > 0, 'zoekDubbel vindt een bestaand domein');

    console.log('ALLE CHECKS GESLAAGD');
  } finally {
    if (ids.length) {
      await db.from('lead_activiteiten').delete().in('lead_id', ids);
      const { error } = await db.from('leads').delete().in('id', ids);
      console.log(error ? `OPRUIMEN FAALDE: ${error.message}` : `opgeruimd: ${ids.length} testleads`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
