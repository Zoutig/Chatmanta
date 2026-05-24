#!/usr/bin/env node
// Seed de V0-milestones (ChatManta V1-launch readiness) in cc_milestones.
//
// 19 milestones die samen de definition-of-done van V0 vormen: wanneer deze af
// zijn is ChatManta klaar om V1 live te zetten bij de eerste drie testklanten
// (ActionSpeedControl, Cleans Reinigingen, Maxus Studios). Verdeeld over drie
// eigenaren: Sebastiaan (product/tech), Niels (customer/launch), Samen (go/no-go).
//
// Idempotent: milestones waarvan de titel al in cc_milestones staat worden
// overgeslagen, dus herhaald draaien maakt geen duplicaten.
//
// Veiligheid: dry-run is de DEFAULT. Zonder --confirm wordt NIETS geschreven; het
// script telt alleen wat het zou invoegen en print de target-DB-host.
//
// Usage:
//   node scripts/cc/seed-v0-milestones.mjs              (dry-run, schrijft niets)
//   node scripts/cc/seed-v0-milestones.mjs --confirm    (voert de insert uit)

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CONFIRM = process.argv.includes('--confirm');

// ---------------------------------------------------------------------------
// .env.local loader (geen dotenv-dependency — zelfde patroon als clean-slate.mjs)
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Milestone-data. Fase + status zijn voor de hele set gelijk (zie statusregel:
// default 'Niet gestart'; geen enkele is "al zichtbaar bezig" want het zijn
// nieuwe items). Owner mapt op de toegestane OWNERS-enum ("Sebas" -> "Sebastiaan").
// ---------------------------------------------------------------------------
const PHASE = 'v0';
const STATUS = 'Niet gestart';

const MILESTONES = [
  // --- SEBASTIAAN — Product & Tech ---
  {
    title: 'Widget is V1-ready en embedbaar',
    owner: 'Sebastiaan',
    description:
      'De ChatManta-widget werkt als zelfstandig onderdeel dat op externe websites geplaatst kan worden. De widget moet professioneel aanvoelen voor echte bezoekers en bruikbaar zijn op desktop en mobiel.',
    acceptanceCriteria: [
      'Widget kan via embed-code/script op externe websites geplaatst worden.',
      'Widget werkt op desktop en mobiel.',
      'Widget opent, sluit en laadt soepel.',
      'Widget toont een duidelijke laadstatus tijdens het genereren van antwoorden.',
      'Widget toont een nette foutmelding wanneer iets misgaat.',
      'Widget ondersteunt minimaal klantnaam/chatbotnaam, welkomstbericht en basiskleur.',
      'Widget maakt duidelijk dat de bezoeker met een AI-chatbot praat.',
      'Widget voelt professioneel genoeg om live te zetten bij de eerste testklanten.',
    ],
  },
  {
    title: 'Kennisbank werkt met websitecontent en documenten',
    owner: 'Sebastiaan',
    description:
      'Per klant kunnen websitecontent en documenten worden ingeladen, verwerkt en gebruikt als kennisbasis voor de chatbot. De kennis moet per klant gescheiden blijven.',
    acceptanceCriteria: [
      'Websitecontent kan per klant worden opgehaald via crawler.',
      'Documenten/PDFs kunnen worden toegevoegd als extra kennisbron.',
      'Ingeladen content wordt verwerkt tot bruikbare kennis voor de chatbot.',
      'Bronnen zijn gekoppeld aan de juiste klant/workspace.',
      'Bronnen kunnen opnieuw verwerkt worden wanneer informatie wijzigt.',
      'Bronnen kunnen verwijderd of gedeactiveerd worden.',
      'De chatbot kan antwoorden geven op basis van websitecontent en documenten.',
      'Kennis van verschillende klanten loopt niet door elkaar.',
    ],
  },
  {
    title: 'Chatbot-antwoorden zijn betrouwbaar genoeg',
    owner: 'Sebastiaan',
    description:
      'De chatbot beantwoordt klantvragen op basis van de juiste kennis, blijft binnen zijn rol als website-assistent en geeft veilige fallback wanneer informatie ontbreekt.',
    acceptanceCriteria: [
      'Bot gebruikt alleen kennis uit de juiste klantomgeving.',
      'Bot geeft nuttige antwoorden op normale klantvragen.',
      'Bot geeft geen antwoord alsof iets zeker is wanneer de kennis ontbreekt.',
      'Bot gebruikt fallback wanneer informatie niet gevonden of onzeker is.',
      'Bot verwijst naar contactgegevens wanneer menselijke hulp nodig is.',
      'Bot verzint geen prijzen.',
      'Bot verzint geen openingstijden.',
      'Bot verzint geen voorwaarden.',
      'Bot verzint geen diensten of beloftes.',
      'Bot voert geen acties uit zoals boekingen, reserveringen of betalingen.',
      'Bot blijft duidelijk binnen de V1-scope: klantvragen beantwoorden.',
    ],
  },
  {
    title: 'Klantdashboard is bruikbaar voor basisbeheer',
    owner: 'Sebastiaan',
    description:
      'Testklanten kunnen zelf de belangrijkste chatbotinstellingen beheren zonder dat het dashboard overweldigend of technisch voelt.',
    acceptanceCriteria: [
      'Klant kan inloggen op eigen dashboard.',
      'Klant kan chatbotnaam aanpassen.',
      'Klant kan welkomstbericht aanpassen.',
      'Klant kan tone of voice instellen via simpele keuzes.',
      'Klant kan fallback-contactgegevens beheren.',
      'Klant kan bronnen/documenten bekijken.',
      'Klant kan documenten uploaden.',
      'Klant kan embed-code kopieren.',
      'Klant kan chatbot testen via preview/testomgeving.',
      'Dashboard bevat geen onnodige technische AI-instellingen.',
      'Dashboard is simpel genoeg voor een niet-technische testklant.',
    ],
  },
  {
    title: 'Klantomgevingen zijn veilig gescheiden en beheerbaar',
    owner: 'Sebastiaan',
    description:
      'Elke klant heeft eigen toegang, eigen workspace, eigen bronnen, eigen gesprekken en eigen instellingen. Intern kunnen klanten/workspaces beheerd worden.',
    acceptanceCriteria: [
      'Klantaccounts/login werken.',
      'Elke klant ziet alleen eigen dashboard.',
      'Elke klant ziet alleen eigen bronnen.',
      'Elke klant ziet alleen eigen documenten.',
      'Elke klant ziet alleen eigen chatlogs.',
      'Elke klant ziet alleen eigen instellingen.',
      'Admin/Sebas kan klanten of workspaces beheren.',
      'ActionSpeedControl, Cleans Reinigingen en Maxus Studios kunnen naast elkaar bestaan zonder dat data mengt.',
      'Er is geen datalek tussen klantomgevingen.',
    ],
  },
  {
    title: 'Chatlogs en basisanalytics zijn zichtbaar',
    owner: 'Sebastiaan',
    description:
      'Klanten kunnen gesprekken terugzien en basisgebruik bekijken. Sebas en Niels kunnen logs gebruiken om antwoorden te verbeteren en usage/kosten te monitoren.',
    acceptanceCriteria: [
      'Gesprekken worden opgeslagen.',
      'Klant kan eigen gesprekken bekijken.',
      'Klant kan vragen en antwoorden teruglezen.',
      'Chatlogs zijn gekoppeld aan de juiste klant.',
      'Chatlogs tonen minimaal datum/tijd.',
      'Basisanalytics tonen minimaal aantal gesprekken en/of berichten.',
      'Laatste activiteit is zichtbaar.',
      'Fallbacks of onbeantwoorde vragen zijn zichtbaar of herkenbaar.',
      'Intern is usage per klant inzichtelijk genoeg voor kostencontrole.',
    ],
  },
  {
    title: 'Productieomgeving is stabiel genoeg voor 3 live testklanten',
    owner: 'Sebastiaan',
    description:
      'De technische omgeving is betrouwbaar genoeg om 3 testklanten live te draaien zonder constante handmatige noodoplossingen.',
    acceptanceCriteria: [
      'Productieomgeving draait stabiel.',
      'Database is klaar voor echte testklanten.',
      'API keys staan veilig in environment variables.',
      'Development en production zijn gescheiden.',
      'Error logging werkt.',
      'Er is een backup- of herstelstrategie.',
      'Basisbescherming tegen misbruik of extreem gebruik is aanwezig.',
      'AI/API-errors geven een nette fallback.',
      'Usage/kosten kunnen worden gemonitord.',
      'Sebas durft technisch 3 klanten live te zetten.',
    ],
  },
  {
    title: 'Kwaliteitstest is meetbaar per klant',
    owner: 'Sebastiaan',
    description:
      'Per klant kan objectief worden getest of de chatbot goed genoeg is voor live gebruik.',
    acceptanceCriteria: [
      'Per klant kan een testset met klantvragen worden getest.',
      'Antwoorden kunnen worden gescoord als goed, deels goed of fout.',
      'Hallucinaties kunnen worden gemarkeerd.',
      'Kritieke hallucinaties worden apart bijgehouden.',
      'Per klant kan worden vastgesteld of minimaal 80% van antwoorden goed is.',
      'Per klant kan worden vastgesteld of er 0 kritieke hallucinaties zijn.',
      'Resultaten zijn duidelijk genoeg voor een Go/No-Go beslissing.',
      'Verbeterpunten uit de test kunnen worden teruggekoppeld naar kennisbank, prompt of product.',
    ],
  },
  {
    title: 'Publieke widget is beschermd tegen misbruik en kostenexplosie',
    owner: 'Sebastiaan',
    description:
      'De widget is een openbaar endpoint dat iedereen kan aanroepen. Voor livegang is hij beschermd tegen kosten-misbruik, ongeoorloofd hergebruik op vreemde domeinen en pogingen om de bot iets schadelijks te laten zeggen op de site van de klant.',
    acceptanceCriteria: [
      'Er geldt een rate-limit op het publieke widget-endpoint (per IP/origin).',
      'Er is een per-klant kosten- of gebruikslimiet zodat een klant of aanvaller de AI-rekening niet kan laten exploderen.',
      'De widget werkt alleen vanaf de toegestane domeinen van de klant (domain-allowlist / CORS).',
      'De bot blijft binnen zijn rol bij pogingen tot prompt-injection of jailbreak.',
      'Bij het bereiken van een limiet krijgt de bezoeker een nette melding in plaats van een crash.',
      'Verdacht of extreem gebruik is zichtbaar of herkenbaar voor Sebas.',
      'Sebas durft het publieke endpoint live te zetten zonder vrees voor een verrassingsrekening.',
    ],
  },

  // --- NIELS — Customer & Launch ---
  {
    title: 'Drie testklanten zijn bevestigd',
    owner: 'Niels',
    description:
      'ActionSpeedControl, Cleans Reinigingen en Maxus Studios zijn akkoord om als V1-testklant mee te doen.',
    acceptanceCriteria: [
      'ActionSpeedControl heeft akkoord gegeven als testklant.',
      'Cleans Reinigingen heeft akkoord gegeven als testklant.',
      'Maxus Studios heeft akkoord gegeven als testklant.',
      'Elke klant weet dat het om een V1-test gaat.',
      'Elke klant weet dat de eerste maand gratis is.',
      'Elke klant weet dat daarna een vriendenprijs van 20-30 euro per maand geldt.',
      'Elke klant weet dat feedback onderdeel is van de pilot.',
      'Elke klant weet dat ChatManta actief verbeterd wordt tijdens de testfase.',
    ],
  },
  {
    title: 'Verwachtingen zijn correct gemanaged',
    owner: 'Niels',
    description:
      'Elke testklant begrijpt precies wat ChatManta V1 wel doet, wat het nog niet doet en wat zij mogen verwachten van een testversie.',
    acceptanceCriteria: [
      'Klanten begrijpen dat V1 klantvragen beantwoordt.',
      'Klanten begrijpen dat V1 werkt op basis van websitecontent en documenten.',
      'Klanten begrijpen dat V1 nog geen boekingen doet.',
      'Klanten begrijpen dat V1 nog geen reserveringen doet.',
      'Klanten begrijpen dat V1 nog geen betalingen doet.',
      'Klanten begrijpen dat V1 nog geen complexe acties uitvoert.',
      'Klanten begrijpen dat de bot fouten kan maken.',
      'Klanten begrijpen dat feedback nodig is om het product beter te maken.',
      'Klanten weten wie hun aanspreekpunt is.',
    ],
  },
  {
    title: 'Onboardinginformatie is per klant compleet',
    owner: 'Niels',
    description:
      'Alle informatie die Sebas nodig heeft om de chatbot goed in te richten is per klant verzameld en overzichtelijk aangeleverd.',
    acceptanceCriteria: [
      'Website-URL per klant is verzameld.',
      'Bedrijfsnaam per klant is duidelijk.',
      'Gewenste chatbotnaam per klant is bekend.',
      'Gewenste tone of voice per klant is bekend.',
      'Contactgegevens per klant zijn verzameld.',
      'Belangrijkste diensten/producten per klant zijn verzameld.',
      'Veelgestelde klantvragen per klant zijn verzameld.',
      'Prijsinformatie of prijsbeleid per klant is duidelijk.',
      'Documenten/PDFs zijn verzameld indien beschikbaar.',
      'Onderwerpen waar de bot niet over mag antwoorden zijn bekend.',
      'Gewenste fallback/contactverwijzing is bekend.',
      'Dashboardgebruikers/contactpersonen zijn bekend.',
      'Sebas hoeft geen ontbrekende basisinformatie meer op te vragen voordat hij kan inrichten.',
    ],
  },
  {
    title: 'Testvragen zijn per klant verzameld',
    owner: 'Niels',
    description:
      'Voor elke testklant is er een realistische set klantvragen waarmee Sebas de antwoordkwaliteit kan testen.',
    acceptanceCriteria: [
      'Per klant is een set met echte klantvragen verzameld.',
      'De testset bevat normale veelgestelde vragen.',
      'De testset bevat vragen over diensten/producten.',
      'De testset bevat vragen over prijs, voorwaarden of openingstijden indien relevant.',
      'De testset bevat vragen waarop de bot mogelijk geen antwoord weet.',
      'De testset bevat lastig of onduidelijk geformuleerde vragen.',
      'Klantinput is meegenomen bij wat een goed antwoord zou zijn.',
      'Testvragen zijn duidelijk aangeleverd aan Sebas.',
      'De testset is geschikt om de 80%-kwaliteitsscore te meten.',
    ],
  },
  {
    title: 'Pilot- en commerciele afspraken zijn geregeld',
    owner: 'Niels',
    description:
      'De basisafspraken rond pilot, prijs, feedback, datagebruik en opzegbaarheid zijn duidelijk vastgelegd voor testklanten.',
    acceptanceCriteria: [
      'Eerste maand gratis is duidelijk afgesproken.',
      'Prijs na gratis maand is duidelijk: 20-30 euro per maand.',
      'Betaling verloopt voorlopig handmatig.',
      'Opzegbaarheid of pilotduur is duidelijk.',
      'Feedbackafspraken zijn duidelijk.',
      'Klant begrijpt wat inbegrepen is.',
      'Klant begrijpt wat niet inbegrepen is.',
      'Klant geeft toestemming dat chatlogs/feedback gebruikt mogen worden om het product te verbeteren.',
      'Basisafspraken over data en privacy zijn duidelijk.',
      'Klant begrijpt dat V1 geen perfecte garantie geeft.',
      'Afspraken zijn schriftelijk of aantoonbaar bevestigd.',
    ],
  },
  {
    title: 'Feedback- en supportproces staat klaar',
    owner: 'Niels',
    description:
      'Klanten weten hoe ze feedback of problemen melden. Niels is eerste aanspreekpunt en zorgt dat feedback gestructureerd terugkomt bij Sebas.',
    acceptanceCriteria: [
      'Klanten weten dat Niels eerste aanspreekpunt is.',
      'Klanten weten hoe ze foute antwoorden kunnen melden.',
      'Klanten weten hoe ze technische problemen kunnen melden.',
      'Niels weet welke vragen hij zelf afhandelt.',
      'Niels weet welke problemen naar Sebas moeten.',
      'Feedback wordt centraal verzameld.',
      'Feedback wordt gelabeld als bug, antwoordkwaliteit, dashboardverbetering, onboardingprobleem, V1.1-wens of later.',
      'Feedbackmoment na enkele dagen is voorbereid.',
      'Feedbackmoment na 1-2 weken is voorbereid.',
      'Evaluatie na 30 dagen is voorbereid.',
    ],
  },

  // --- SAMEN — Launch & Go/No-Go ---
  {
    title: 'V1-scope is definitief afgebakend',
    owner: 'Samen',
    description:
      'Sebas en Niels zijn het eens over wat V1 wel en niet bevat, zodat V0 niet blijft uitlopen door nieuwe wensen of extra functies.',
    acceptanceCriteria: [
      'V1-scope is samen besproken.',
      'V1 bevat alleen een betrouwbare website-chatbot voor klantvragen.',
      'V1 bevat widget, kennisbank, dashboard, chatlogs, basisanalytics en veilige fallback.',
      'V1 bevat geen boekingen.',
      'V1 bevat geen reserveringen.',
      'V1 bevat geen betalingen.',
      'V1 bevat geen CRM-koppelingen.',
      'V1 bevat geen complexe actieflows.',
      'Nieuwe klantwensen gaan naar V1.1-backlog of later.',
      'Sebas en Niels gebruiken dezelfde definitie van V1-ready.',
    ],
  },
  {
    title: 'Rollen en verantwoordelijkheden zijn vastgelegd',
    owner: 'Samen',
    description:
      'De samenwerking is duidelijk: Sebas is Product & Tech Lead, Niels is Customer & Launch Lead, en Go/No-Go beslissingen worden samen genomen.',
    acceptanceCriteria: [
      'Sebas is bevestigd als Product & Tech Lead.',
      'Niels is bevestigd als Customer & Launch Lead.',
      'Niels is eerste aanspreekpunt voor klanten.',
      'Sebas is tweede lijn voor technische problemen.',
      'Sebas bewaakt productkwaliteit.',
      'Niels bewaakt klantverwachtingen.',
      'Samen nemen jullie Go/No-Go beslissingen.',
      'Wekelijkse launchcheck is gepland of afgesproken.',
      'Iedereen weet wie waarvoor verantwoordelijk is.',
    ],
  },
  {
    title: 'Alle 3 klantomgevingen zijn launch-ready',
    owner: 'Samen',
    description:
      'Voor ActionSpeedControl, Cleans Reinigingen en Maxus Studios staat een complete werkende omgeving klaar.',
    acceptanceCriteria: [
      'Workspace voor ActionSpeedControl is klaar.',
      'Workspace voor Cleans Reinigingen is klaar.',
      'Workspace voor Maxus Studios is klaar.',
      'Websitecontent per klant is ingeladen.',
      'Documenten per klant zijn toegevoegd indien beschikbaar.',
      'Botinstellingen per klant zijn ingevuld.',
      'Dashboardlogin per klant werkt.',
      'Chatlogs per klant werken.',
      'Basisanalytics per klant werken.',
      'Embed-code per klant werkt.',
      'Widget is per klant getest.',
      'Klant heeft de chatbot getest of kan deze testen.',
      'Klant heeft akkoord gegeven voor livegang.',
    ],
  },
  {
    title: 'Go/No-Go kwaliteit is gehaald',
    owner: 'Samen',
    description:
      'De afgesproken kwaliteitsgrens is gehaald voordat V1 livegaat bij testklanten.',
    acceptanceCriteria: [
      'Elke klant heeft een kwaliteitstest gehad.',
      'Elke klant haalt minimaal 80% goede antwoorden op de testset.',
      'Elke klant heeft 0 kritieke hallucinaties.',
      'Bot verzint geen prijzen.',
      'Bot verzint geen openingstijden.',
      'Bot verzint geen voorwaarden.',
      'Bot verzint geen diensten.',
      'Fallback werkt bij onbekende of onzekere vragen.',
      'Klant vindt de toon acceptabel.',
      'Klant vindt de antwoorden bruikbaar genoeg voor een live test.',
      'Sebas en Niels geven samen akkoord op kwaliteit.',
    ],
  },
  {
    title: 'Eerste 30 dagen launchproces is klaar',
    owner: 'Samen',
    description:
      'Livegang, monitoring, support, feedback, verbeteringen en evaluatie zijn voorbereid voor de eerste maand na V1-launch.',
    acceptanceCriteria: [
      'Livegangproces per klant is duidelijk.',
      'Er is afgesproken wie widgetplaatsing begeleidt.',
      'Er is afgesproken wie de eerste week logs controleert.',
      'Er is afgesproken hoe foute antwoorden worden opgevolgd.',
      'Er is afgesproken hoe technische bugs worden opgevolgd.',
      'Er is afgesproken hoe klantfeedback wordt verzameld.',
      'Evaluatie na 30 dagen is gepland of voorbereid.',
      'Na 30 dagen wordt besproken of klant doorgaat tegen vriendenprijs.',
      'Positieve klanten kunnen worden gevraagd om testimonial of referral.',
      'V1.1-prioriteiten worden na de eerste feedbackronde bepaald.',
    ],
  },
  {
    title: 'Juridische en privacy-basis is geregeld voor livegang',
    owner: 'Samen',
    description:
      'Voordat de widget op echte publieke websites draait, zijn de AVG-verplichtingen rond het verwerken van bezoekersgegevens geregeld: een verwerkersovereenkomst per klant, transparante privacy-info voor bezoekers en duidelijke afspraken over opslag en verwijdering van gesprekdata.',
    acceptanceCriteria: [
      'Per testklant is een verwerkersovereenkomst afgesloten (klant = verwerkingsverantwoordelijke, ChatManta = verwerker).',
      'Sub-verwerkers (OpenAI, Supabase, Vercel) zijn benoemd, inclusief doorgifte van data naar buiten de EU.',
      'Er is een privacyverklaring of privacy-melding die de widgetbezoeker kan inzien.',
      'Vastgelegd is welke gesprekdata wordt opgeslagen en hoe lang (retentietermijn).',
      'Een verzoek tot inzage of verwijdering van persoonsgegevens kan worden afgehandeld.',
      'Vastgelegd is wat er met chatlogs gebeurt wanneer een testklant stopt.',
      'Een eventueel datalek heeft een duidelijk meld- en escalatiepad.',
      'Sebas en Niels durven juridisch gezien 3 klanten live te zetten.',
    ],
  },
];

function toRow(m) {
  return {
    title: m.title,
    description: m.description ?? null,
    roadmap_phase: PHASE,
    owner: m.owner,
    status: STATUS,
    deadline: null,
    acceptance_criteria: m.acceptanceCriteria ?? [],
    linked_task_ids: [],
  };
}

async function main() {
  const host = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return SUPABASE_URL;
    }
  })();
  console.log(`mode:     ${CONFIRM ? 'CONFIRM (schrijft!)' : 'DRY-RUN (schrijft niets)'}`);
  console.log(`database: ${host}`);
  console.log(`fase:     ${PHASE}   status: ${STATUS}`);
  console.log('---');

  // Bestaande titels ophalen voor idempotentie.
  const { data: existing, error: exErr } = await sb
    .from('cc_milestones')
    .select('title');
  if (exErr) throw new Error(`fetch bestaande milestones faalde: ${exErr.message}`);
  const existingTitles = new Set((existing ?? []).map((r) => r.title));

  const toInsert = [];
  for (const m of MILESTONES) {
    const present = existingTitles.has(m.title);
    const ownerTag = m.owner.padEnd(11);
    console.log(`[${present ? 'SKIP' : 'NEW '}] ${ownerTag} ${m.title}`);
    if (!present) toInsert.push(m);
  }

  console.log('---');
  console.log(`in lijst:        ${MILESTONES.length}`);
  console.log(`al aanwezig:     ${MILESTONES.length - toInsert.length} (overgeslagen)`);
  console.log(`toe te voegen:   ${toInsert.length}`);
  console.log('---');

  if (!CONFIRM) {
    console.log('DRY-RUN: er is niets geschreven. Draai met --confirm om door te zetten.');
    return;
  }

  if (toInsert.length === 0) {
    console.log('Niets te doen — alle milestones bestaan al.');
    return;
  }

  const rows = toInsert.map(toRow);
  const { data: inserted, error: insErr } = await sb
    .from('cc_milestones')
    .insert(rows)
    .select('id');
  if (insErr) throw new Error(`insert faalde: ${insErr.message}`);

  const { count: total } = await sb
    .from('cc_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('roadmap_phase', PHASE);

  console.log(`ingevoegd: ${inserted?.length ?? 0} milestones`);
  console.log(`totaal in fase ${PHASE}: ${total ?? '?'}`);
  console.log('Klaar.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
