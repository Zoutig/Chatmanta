// Integratietest van de data-laag (lib/leads/server/db.ts) tegen V1-prod.
// Maakt 2 testleads (bron 'test', domeinen *.invalid, niche 'e2e-db-test') en ruimt ze altijd op.
// Draaien: npm run leads:test-db  (db.ts importeert 'server-only' → --conditions=react-server)
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import * as dbl from '../lib/leads/server/db';
import { pakStand, type Lead } from '../lib/leads/types';
import { AppError } from '../lib/errors/app-error';
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

    // filter op beller (view leads_overzicht)
    await dbl.logActiviteit(db, { leadId: laagId, userId, soort: 'belpoging', details: {} });
    const opNaam = await dbl.lijstLeads(db, { tab: 'vandaag', niche: NICHE, zoek: 'e2e', beller: userId });
    eis(opNaam.totaal === 1 && opNaam.leads[0].id === laagId && opNaam.leads[0].gebeld_door.includes(userId), 'lijstLeads: filter op beller vindt alleen de lead die hij belde');
    const anders = await dbl.lijstLeads(db, { tab: 'vandaag', niche: NICHE, zoek: 'e2e', beller: '00000000-0000-4000-8000-000000000000' });
    eis(anders.totaal === 0, 'lijstLeads: filter op een andere beller vindt niets');
    const t = await dbl.tellers(db);
    eis(t.vandaag >= 2, 'tellers.vandaag telt de testleads mee');
    const opt = await dbl.filterOpties(db);
    eis(opt.niches.includes(NICHE), 'filterOpties bevat de testniche');
    eis(!!(await dbl.zoekDubbel(db, 'e2e-laag.invalid', null)) && laagId.length > 0, 'zoekDubbel vindt een bestaand domein');

    // interesse + kennismaking → ongedaan maken draait beide activiteiten terug
    {
      const l0 = await dbl.haalLead(db, laagId);
      const voorKm = pakStand(l0);
      const km = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
      const o = volgendeStand(voorKm, { uitkomst: 'interesse', mail: false, kennismakingOp: km }, new Date());
      eis(o.kennismaking, 'interesse met datum plant een kennismaking');
      const belId = await dbl.pasStandToe(db, { lead: l0, userId, nieuw: o.stand, soort: 'belpoging', uitkomst: 'interesse', details: o.details, vrijgeven: true });
      const kmId = await dbl.logKennismaking(db, { leadId: laagId, userId, op: o.stand.kennismaking_op, bijActiviteit: belId });
      await dbl.maakOngedaan(db, belId);
      const { data: acts, error: ae } = await db.from('lead_activiteiten').select('id, ongedaan_op').in('id', [belId, kmId]);
      if (ae) throw new Error(ae.message);
      eis(acts?.length === 2 && acts.every((r) => r.ongedaan_op !== null), 'belpoging én kennismaking staan op ongedaan');
      eis(JSON.stringify(pakStand(await dbl.haalLead(db, laagId))) === JSON.stringify(voorKm), 'stand na ongedaan kennismaking weer identiek');

      // Een écht latere activiteit (zonder bij_activiteit) blokkeert ongedaan maken nog steeds.
      const l1 = await dbl.haalLead(db, laagId);
      const o2 = volgendeStand(pakStand(l1), { uitkomst: 'interesse', mail: false, kennismakingOp: km }, new Date());
      const bel2 = await dbl.pasStandToe(db, { lead: l1, userId, nieuw: o2.stand, soort: 'belpoging', uitkomst: 'interesse', details: o2.details, vrijgeven: true });
      await dbl.logKennismaking(db, { leadId: laagId, userId, op: o2.stand.kennismaking_op, bijActiviteit: bel2 });
      await dbl.logActiviteit(db, { leadId: laagId, userId, soort: 'notitie', details: { tekst: 'test' } });
      let geblokt = false;
      try {
        await dbl.maakOngedaan(db, bel2);
      } catch (e) {
        geblokt = e instanceof AppError && /daarna al iets anders/.test(e.message);
      }
      eis(geblokt, 'een latere notitie blokkeert ongedaan maken');
    }

    // pasStandToe weigert bij een claim van een ander en bij een verouderde stand
    {
      const { data: o, error: oe } = await db.from('users').select('id').eq('email', 'outsider@example.com').single();
      if (oe || !o) throw new Error(`outsider niet gevonden: ${oe?.message}`);
      const outsiderId = o.id as string;
      /** True als pasStandToe precies met de "door een ander gewijzigd"-fout weigert. */
      const weigert = async (opts: Parameters<typeof dbl.pasStandToe>[1]) => {
        try {
          await dbl.pasStandToe(db, opts);
          return false;
        } catch (e) {
          return e instanceof AppError && e.code === 'INPUT_INVALID' && e.message === dbl.GEWIJZIGD_DOOR_ANDER;
        }
      };
      const stap = (l: Lead) => ({
        lead: l,
        userId,
        nieuw: volgendeStand(pakStand(l), { uitkomst: 'niet_opgenomen', voicemail: false, naDerde: 'archief' }, new Date()).stand,
        soort: 'belpoging' as const,
        uitkomst: 'niet_opgenomen' as const,
        vrijgeven: true,
      });
      const zetClaim = async (door: string | null, tot: string | null) => {
        const { error } = await db.from('leads').update({ geclaimd_door: door, geclaimd_tot: tot }).eq('id', laagId);
        if (error) throw new Error(error.message);
      };

      await zetClaim(outsiderId, new Date(Date.now() + 10 * 60_000).toISOString());
      const geclaimdeLead = await dbl.haalLead(db, laagId);
      eis(await weigert(stap(geclaimdeLead)), 'pasStandToe faalt als een ander de lead geclaimd heeft');
      const naWeigering = await dbl.haalLead(db, laagId);
      eis(naWeigering.geclaimd_door === outsiderId && naWeigering.pogingen_niet_opgenomen === geclaimdeLead.pogingen_niet_opgenomen, 'claim en stand van de ander blijven staan');

      await zetClaim(outsiderId, new Date(Date.now() - 60_000).toISOString());
      const verlopen = await dbl.haalLead(db, laagId);
      await dbl.pasStandToe(db, stap(verlopen));
      eis((await dbl.haalLead(db, laagId)).geclaimd_door === null, 'verlopen claim van een ander: toegestaan en vrijgegeven');

      const oud = await dbl.haalLead(db, laagId);
      const { error: se } = await db.from('leads').update({ pogingen_niet_opgenomen: oud.pogingen_niet_opgenomen + 1 }).eq('id', laagId);
      if (se) throw new Error(se.message);
      eis(await weigert(stap(oud)), 'pasStandToe faalt als de stand intussen gewijzigd is');
      const vers = await dbl.haalLead(db, laagId);
      eis(await weigert(stap({ ...vers, status: 'kans' })), 'pasStandToe faalt bij een andere status');
    }

    // leads_inzicht: tellingen over directe testactiviteiten (alleen de testniche + dit testuur)
    {
      const van = new Date(Date.now() - 3600_000);
      const tot = new Date(Date.now() + 3600_000);
      const voor = (await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: userId })).data;
      const rij = (soort: string, uitkomst: string | null, details: object = {}, ongedaan = false) => ({
        lead_id: laagId, user_id: userId, soort, uitkomst, details, ongedaan_op: ongedaan ? new Date().toISOString() : null,
      });
      const { error: ie } = await db.from('lead_activiteiten').insert([
        rij('belpoging', 'niet_opgenomen'),
        rij('belpoging', 'geen_interesse', { bezwaar: 'e2e_bezwaar' }),
        rij('belpoging', 'interesse'),
        rij('belpoging', 'interesse', {}, true), // ongedaan: telt niet
        rij('import', null), // import: telt niet
        rij('kennismaking', null),
        rij('status', null, { naar: 'klant' }),
      ]);
      if (ie) throw new Error(ie.message);
      const na = (await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: userId })).data;
      eis(na.belpogingen - voor.belpogingen === 3, 'leads_inzicht: 3 belpogingen erbij (ongedaan telt niet)');
      eis(na.opgenomen - voor.opgenomen === 2, 'leads_inzicht: 2 opgenomen erbij');
      eis(na.interesse - voor.interesse === 1, 'leads_inzicht: 1 interesse erbij');
      eis(na.kennismakingen - voor.kennismakingen === 1 && na.klanten - voor.klanten === 1, 'leads_inzicht: kennismaking en klant geteld');
      const niche = (na.per_niche as { naam: string; belletjes: number; interesse: number; voorraad: number }[]).find((n) => n.naam === NICHE);
      eis(!!niche && niche.belletjes >= 3 && niche.interesse >= 1, 'leads_inzicht: per_niche telt de testniche');
      eis((na.bezwaren as { bezwaar: string }[]).some((b) => b.bezwaar === 'e2e_bezwaar'), 'leads_inzicht: bezwaar zichtbaar');
      eis(typeof na.pijplijn === 'object' && Array.isArray(na.heatmap), 'leads_inzicht: pijplijn en heatmap aanwezig');
      const anders = (await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: '00000000-0000-0000-0000-000000000000' })).data;
      eis(anders.belpogingen === 0, 'leads_inzicht: p_user filtert op beller');
    }

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
