// Import van Niels' ChatbotScanner-data naar V1 (tabel leads).
//   npm run leads:import -- <leads.json> [--status <status.json>] [--csv-map <map met gevonden_*.csv>] [--toepassen]
// Standaard een PROEFRUN (schrijft niets). Bestanden staan buiten de repo.
// Idempotent: upsert op domein; status- en belvelden van bestaande leads worden nooit overschreven,
// behalve 'niet benaderen' uit status.json (→ niet_bellen). Afgesloten of geanonimiseerde leads en
// leads zonder echte scanwijziging blijven onaangeroerd (updated_at = AVG-bewaarklok).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  verwerkImport,
  leesCsv,
  besluitHerimport,
  SCAN_VELDEN,
  NIET_BENADEREN_REDEN,
  type NielsLead,
  type NielsStatus,
  type BestaandeLead,
} from '../lib/leads/import-opschonen';
import { normaliseerDomein } from '../lib/leads/normaliseren';
import { leesAllePaginas } from '../lib/leads/pagineren';
import { pakStand, STAND_KOLOMMEN, type Stand } from '../lib/leads/types';

function arg(naam: string): string | undefined {
  const i = process.argv.indexOf(naam);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const leadsPad = process.argv[2];
  if (!leadsPad || leadsPad.startsWith('--')) {
    console.error('Gebruik: npm run leads:import -- <leads.json> [--status <status.json>] [--csv-map <map>] [--toepassen]');
    process.exit(1);
  }
  const toepassen = process.argv.includes('--toepassen');
  const ruw = JSON.parse(readFileSync(leadsPad, 'utf8')) as NielsLead[];
  const statusPad = arg('--status');
  const status = statusPad ? (JSON.parse(readFileSync(statusPad, 'utf8')) as Record<string, NielsStatus>) : undefined;
  const csvMap = arg('--csv-map');
  const googleTelefoon = new Map<string, string>();
  if (csvMap) {
    for (const f of readdirSync(csvMap).filter((x) => /^gevonden_.*\.csv$/.test(x))) {
      for (const r of leesCsv(readFileSync(join(csvMap, f), 'utf8'))) {
        const d = normaliseerDomein(r.url);
        if (d && r.telefoon && !googleTelefoon.has(d)) googleTelefoon.set(d, r.telefoon);
      }
    }
  }

  const { leads, activiteiten, rapport } = verwerkImport(ruw, { googleTelefoon, status });
  console.log('Rapport:', JSON.stringify(rapport, null, 2));
  console.log(`Google-nummers uit CSV: ${googleTelefoon.size}`);
  const perStatus = leads.reduce<Record<string, number>>((m, l) => ((m[l.status] = (m[l.status] ?? 0) + 1), m), {});
  console.log('Per status:', perStatus);

  if (!toepassen) {
    console.log('\nPROEFRUN: niets geschreven. Voeg --toepassen toe om te schrijven (pas na akkoord).');
    return;
  }

  const db = createClient(process.env.NEXT_PUBLIC_V1_SUPABASE_URL!, process.env.V1_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Bestaande leads lezen, in blokken: PostgREST kapt een antwoord af op max_rows.
  const kolommen = ['id', 'domein', 'telefoon', 'bedrijfsnaam', ...STAND_KOLOMMEN, ...SCAN_VELDEN].join(', ');
  type Rij = BestaandeLead & Stand & { domein: string | null; telefoon: string | null };
  const bestaand = await leesAllePaginas(async (van, tot) => {
    const { data, error } = await db.from('leads').select(kolommen).order('id').range(van, tot);
    if (error) throw error;
    return (data ?? []) as unknown as Rij[];
  });
  const opDomein = new Map(bestaand.filter((b) => b.domein).map((b) => [b.domein as string, b]));
  const opTelefoon = new Map(bestaand.filter((b) => b.telefoon).map((b) => [b.telefoon as string, b]));

  const telling = { nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, overgeslagen: 0, naarNietBellen: 0 };

  for (const l of leads) {
    const b = (l.domein && opDomein.get(l.domein)) || (l.telefoon && opTelefoon.get(l.telefoon)) || null;
    if (b) {
      const nietBenaderen = !!(l.domein && status?.[l.domein]?.niet_benaderen);
      const besluit = besluitHerimport(b, l, nietBenaderen);
      if (besluit.soort === 'overslaan') telling.overgeslagen++;
      else if (besluit.soort === 'ongewijzigd') telling.ongewijzigd++;
      else if (besluit.soort === 'bijwerken') {
        // Alleen scanvelden; status en belvelden nooit.
        const { error } = await db.from('leads').update(besluit.patch).eq('id', b.id);
        if (error) throw error;
        telling.bijgewerkt++;
      } else {
        const { error } = await db
          .from('leads')
          .update({ status: 'niet_bellen', status_reden: NIET_BENADEREN_REDEN, volgende_actie_op: null, volgende_actie_notitie: null })
          .eq('id', b.id);
        if (error) throw error;
        const { error: ae } = await db.from('lead_activiteiten').insert({
          lead_id: b.id,
          soort: 'status',
          details: { van: b.status, naar: 'niet_bellen', reden: NIET_BENADEREN_REDEN, bron: 'import' },
          vorige_staat: pakStand(b),
        });
        if (ae) throw ae;
        telling.naarNietBellen++;
      }
      continue;
    }
    const { data, error } = await db.from('leads').insert(l).select('id').single();
    if (error) {
      console.error(`Overgeslagen (${l.domein ?? l.telefoon}): ${error.message}`);
      continue;
    }
    telling.nieuw++;
    const acts = l.domein ? activiteiten.get(l.domein) : undefined;
    if (acts?.length) {
      const { error: ae } = await db.from('lead_activiteiten').insert(acts.map((a) => ({ lead_id: data.id, soort: a.soort, details: a.details })));
      if (ae) throw ae;
    }
  }
  console.log(
    `\nKlaar: ${telling.nieuw} nieuw, ${telling.bijgewerkt} bijgewerkt, ${telling.ongewijzigd} ongewijzigd, ` +
      `${telling.overgeslagen} overgeslagen (afgesloten/verwijderd), ${telling.naarNietBellen} naar niet_bellen (niet benaderen).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
