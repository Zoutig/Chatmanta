// Import van Niels' ChatbotScanner-data naar V1 (tabel leads).
//   npm run leads:import -- <leads.json> [--status <status.json>] [--csv-map <map met gevonden_*.csv>] [--toepassen]
// Standaard een PROEFRUN (schrijft niets). Bestanden staan buiten de repo.
// Idempotent: upsert op domein; status- en belvelden van bestaande leads worden nooit overschreven.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { verwerkImport, leesCsv, type NielsLead, type NielsStatus, type ImportLead } from '../lib/leads/import-opschonen';
import { normaliseerDomein } from '../lib/leads/normaliseren';

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

  // Bestaande leads: alleen scan/bronvelden bijwerken, nooit status/belvelden.
  const { data: bestaand, error: be } = await db.from('leads').select('id, domein, telefoon').limit(20000);
  if (be) throw be;
  const opDomein = new Map((bestaand ?? []).filter((b) => b.domein).map((b) => [b.domein as string, b.id as string]));
  const opTelefoon = new Map((bestaand ?? []).filter((b) => b.telefoon).map((b) => [b.telefoon as string, b.id as string]));

  let nieuw = 0;
  let bijgewerkt = 0;
  const SCAN_VELDEN: (keyof ImportLead)[] = ['google_rating', 'google_reviews', 'heeft_chatbot', 'chatbot_naam', 'platform', 'woorden', 'score', 'score_max', 'score_redenen', 'labels', 'bron_data'];

  for (const l of leads) {
    const id = (l.domein && opDomein.get(l.domein)) || (l.telefoon && opTelefoon.get(l.telefoon)) || null;
    if (id) {
      const patch = Object.fromEntries(SCAN_VELDEN.map((k) => [k, l[k]]));
      const { error } = await db.from('leads').update(patch).eq('id', id);
      if (error) throw error;
      bijgewerkt++;
      continue;
    }
    const { data, error } = await db.from('leads').insert(l).select('id').single();
    if (error) {
      console.error(`Overgeslagen (${l.domein ?? l.telefoon}): ${error.message}`);
      continue;
    }
    nieuw++;
    const acts = l.domein ? activiteiten.get(l.domein) : undefined;
    if (acts?.length) {
      const { error: ae } = await db.from('lead_activiteiten').insert(acts.map((a) => ({ lead_id: data.id, soort: a.soort, details: a.details })));
      if (ae) throw ae;
    }
  }
  console.log(`\nKlaar: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
