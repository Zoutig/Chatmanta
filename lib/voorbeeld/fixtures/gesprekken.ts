// Vaste voorbeeldgesprekken voor /voorbeeld/gesprekken (en de cijfers op Overzicht).
//
// Pure module: geen server-imports, zodat zowel de server-pagina's als de
// client-"acties" (drilldown) hieruit kunnen lezen. Alle tijden worden RELATIEF
// aan nu berekend (Europe/Amsterdam), zodat de demo altijd vers oogt.
//
// Opbouw: ~45 uitgeschreven gesprekken (TEMPLATES). De lijst toont er 100
// (zoals de echte lijst, die op 100 capt): eerst alle uitgeschreven gesprekken,
// daarna korte herhalingen (alleen de eerste vraag + antwoord), want populaire
// vragen komen nu eenmaal vaak terug.

import type { V1ConversationDetail, V1ConversationListItem, V1ConversationMessage } from '@/lib/v1/dashboard/conversations';
import type { KlantFaqResult, KlantFaqRow } from '@/lib/v1/dashboard/faq';
import type { ThreadMessageSource } from '@/lib/v1/conversations/sources';
import type { TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';

// ---------------------------------------------------------------------------
// Tijd-helpers (Europe/Amsterdam)
// ---------------------------------------------------------------------------

const TZ = 'Europe/Amsterdam';
const DAY_MS = 86_400_000;

function tzOffsetMinutes(d: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part ?? '');
  if (!m) return 60;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -mins : mins;
}

function amsterdamYmd(d: Date): { y: number; m: number; d: number } {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .split('-')
    .map(Number);
  return { y, m, d: day };
}

/** n dagen geleden om hour:minute Nederlandse tijd. */
export function daysAgo(n: number, hour: number, minute = 0, now: Date = new Date()): Date {
  const { y, m, d } = amsterdamYmd(new Date(now.getTime() - n * DAY_MS));
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  return new Date(guess - tzOffsetMinutes(new Date(guess)) * 60_000);
}

export type Period = 'today' | 'last_7_days' | 'last_30_days';

/** Begin van de periode (middernacht NL-tijd), zelfde vensters als de echte lijst. */
export function periodStart(period: Period, now: Date = new Date()): Date {
  if (period === 'today') return daysAgo(0, 0, 0, now);
  if (period === 'last_7_days') return daysAgo(6, 0, 0, now);
  return daysAgo(29, 0, 0, now);
}

// ---------------------------------------------------------------------------
// Bronnen (pagina's van de voorbeeldwebsite)
// ---------------------------------------------------------------------------

// Feiten volgen lib/voorbeeld/site-content.ts (de voorbeeldwebsite); de bronnen
// wijzen naar de pagina's van die site.
const P = '/voorbeeld/website';
const SRC = {
  home: { title: 'Vakantie tussen duin en zee in Zeeland', url: P },
  strandhuisje: { title: 'Strandhuisje', url: `${P}/accommodaties/strandhuisje` },
  duinlodge: { title: 'Duinlodge', url: `${P}/accommodaties/duinlodge` },
  boshuis: { title: 'Boshuis', url: `${P}/accommodaties/boshuis` },
  safaritent: { title: 'Glamping safaritent', url: `${P}/accommodaties/safaritent` },
  tinyhouse: { title: 'Tiny house', url: `${P}/accommodaties/tiny-house` },
  hoeve: { title: 'Groepsaccommodatie De Hoeve', url: `${P}/accommodaties/groepsaccommodatie` },
  comfort: { title: 'Kampeerplaats Comfort', url: `${P}/accommodaties/kampeerplaats-comfort` },
  standaard: { title: 'Kampeerplaats Standaard', url: `${P}/accommodaties/kampeerplaats-standaard` },
  prijzen: { title: 'Prijzen en seizoenen 2027', url: `${P}/prijzen` },
  boeken: { title: 'Boeken en betalen', url: `${P}/boeken-en-betalen` },
  annuleren: { title: 'Annuleren en annuleringsverzekering', url: `${P}/annuleren` },
  aankomst: { title: 'Aankomst en vertrek', url: `${P}/aankomst-en-vertrek` },
  huisdieren: { title: 'Op vakantie met je hond', url: `${P}/huisdieren` },
  faciliteiten: { title: 'Faciliteiten op het park', url: `${P}/faciliteiten` },
  zwembad: { title: 'Zwembad De Golfslag en wellness Duinzout', url: `${P}/zwembad-en-wellness` },
  restaurant: { title: 'Restaurant De Duinpan en strandpaviljoen Zilt', url: `${P}/restaurant-en-strandpaviljoen` },
  activiteiten: { title: 'Activiteiten en animatieteam Helmgras', url: `${P}/activiteiten` },
  omgeving: { title: 'De omgeving van Westerduin', url: `${P}/omgeving` },
  bereikbaarheid: { title: 'Bereikbaarheid en parkeren', url: `${P}/bereikbaarheid` },
  groepen: { title: 'Groepen, families en bedrijfsuitjes', url: `${P}/groepen-en-bedrijven` },
  toegankelijkheid: { title: 'Toegankelijk op vakantie', url: `${P}/toegankelijkheid` },
  huisregels: { title: 'Huisregels', url: `${P}/huisregels` },
  faq: { title: 'Veelgestelde vragen', url: `${P}/veelgestelde-vragen` },
  contact: { title: 'Contact', url: `${P}/contact` },
} satisfies Record<string, { title: string; url?: string }>;
type SrcKey = keyof typeof SRC;

const FALLBACK =
  'Daar heb ik helaas geen informatie over. Bel of mail gerust met onze receptie, die helpt je graag verder.';

type Turn = { q: string; a: string; kind?: 'answer' | 'fallback' | 'smalltalk'; src?: SrcKey[] };
type Template = { topic?: Topic; turns: Turn[] };

type Topic =
  | 'hond'
  | 'inchecken'
  | 'zwembad'
  | 'annuleren'
  | 'fietsen'
  | 'wifi'
  | 'parkeren'
  | 'restaurant'
  | 'beddengoed'
  | 'vissen';

// ---------------------------------------------------------------------------
// Uitgeschreven gesprekken
// ---------------------------------------------------------------------------

const TEMPLATES: Template[] = [
  // 0
  {
    topic: 'hond',
    turns: [
      {
        q: 'Mag mijn hond mee?',
        a: 'Ja, in de meeste accommodaties is je hond welkom: in alle Duinlodges en tiny houses, in 12 van de 24 Strandhuisjes, in De Hoeve en op alle kampeerplaatsen. In het Boshuis en de safaritenten mogen geen huisdieren mee, behalve erkende assistentiehonden.\n\nEen hond kost € 6,50 per nacht in een vakantiehuis en € 4,50 per nacht op een kampeerplaats. Meld hem wel aan bij het boeken.',
        src: ['huisdieren', 'faq'],
      },
      {
        q: 'Mag hij los op het strand?',
        a: 'Op het hoofdstrand bij strandpaviljoen Zilt zijn honden van 1 mei tot en met 30 september tussen 10:00 en 19:00 uur niet welkom. Op het hondenstrand bij strandpaal Noord 7, op 1,2 kilometer van het park, mag je hond het hele jaar los. Op het park zelf blijft hij aangelijnd.',
        src: ['huisdieren'],
      },
    ],
  },
  // 1
  {
    topic: 'inchecken',
    turns: [
      {
        q: 'Hoe laat kan ik inchecken?',
        a: 'In een vakantiehuis kun je inchecken vanaf **15:00 uur**, op een kampeerplaats vanaf **13:00 uur**. Je bent wel al vanaf 10:00 uur welkom op het park, bijvoorbeeld om te zwemmen. Om 12:00 uur krijg je een sms met je huisnummer.',
        src: ['aankomst', 'faq'],
      },
      {
        q: 'En als we pas om half 11 aankomen?',
        a: 'Laat het dan vóór 16:00 uur op je aankomstdag weten, telefonisch of via WhatsApp. Na 22:00 uur haal je je sleutelpas uit de sleutelkluis naast de receptie, met een code die we je sturen. Dat kost € 15. Na 23:00 uur is de slagboom dicht en parkeer je op de nachtparkeerplaats ervoor.',
        src: ['aankomst'],
      },
    ],
  },
  // 2
  {
    topic: 'zwembad',
    turns: [
      {
        q: 'Is het zwembad ook open in de winter?',
        a: 'Ja, zwembad De Golfslag is overdekt en het hele jaar open. Buiten de schoolvakanties op werkdagen van 10:00 tot 18:00 uur en in het weekend van 09:00 tot 19:00 uur.\n\nLet op: van 29 november tot en met 10 december 2026 is het zwembad gesloten voor groot onderhoud.',
        src: ['zwembad'],
      },
    ],
  },
  // 3
  {
    topic: 'vissen',
    turns: [
      { q: 'Mag ik in de buurt vissen? Heb ik een vergunning nodig?', a: FALLBACK, kind: 'fallback' },
      {
        q: 'Wat is het nummer van de receptie?',
        a: 'Je bereikt de receptie op 0118 000 000 of via WhatsApp op 06 00 00 00 00. Mailen kan ook, naar info@duinhoeve.example.',
        src: ['contact'],
      },
      { q: 'Kan ik op het park vissen?', a: FALLBACK, kind: 'fallback' },
    ],
  },
  // 4
  {
    topic: 'annuleren',
    turns: [
      {
        q: 'Kan ik kosteloos annuleren?',
        a: 'Kosteloos annuleren kan helaas niet. Je betaalt een deel van de reissom:\n\n- tot 3 maanden voor aankomst: 15%\n- tussen 3 maanden en 1 maand: 50%\n- tussen 1 maand en 1 dag: 90%\n- op de dag van aankomst of later: 100%\n\nDe toeristenbelasting krijg je altijd terug. Wil je zekerheid, sluit dan een annuleringsverzekering af bij het boeken of tot 7 dagen daarna.',
        src: ['annuleren', 'faq'],
      },
      {
        q: 'Hoe annuleer ik?',
        a: 'Stuur een e-mail naar info@duinhoeve.example met je boekingsnummer en de naam van de hoofdboeker. Telefonisch annuleren kan ook, maar is pas geldig als we het per e-mail hebben bevestigd.',
        src: ['annuleren'],
      },
    ],
  },
  // 5
  {
    topic: 'fietsen',
    turns: [
      {
        q: 'Kunnen we fietsen huren op het park?',
        a: 'Ja, bij de fietsverhuur naast de receptie, open van 09:00 tot 17:30 uur. Een stadsfiets kost € 11 per dag en een e-bike € 27,50 per dag. Een helm krijg je er gratis bij.',
        src: ['faciliteiten', 'faq'],
      },
      {
        q: 'En voor een hele week?',
        a: 'Een stadsfiets kost € 55 per week en een e-bike € 135 per week. Een kinderfiets huur je voor € 37,50 per week.',
        src: ['faciliteiten'],
      },
    ],
  },
  // 6
  {
    turns: [
      {
        q: 'Wat kost een week in de Duinlodge?',
        a: 'Dat hangt af van het seizoen. Een week in de Duinlodge (6 personen) kost € 845 in het laagseizoen, € 1.095 in het middenseizoen en € 1.695 in het hoogseizoen.\n\nDaar komen nog bij: € 95 eindschoonmaak, € 17,50 reserveringskosten en € 2,10 toeristenbelasting per persoon per nacht.',
        src: ['duinlodge', 'prijzen'],
      },
      {
        q: 'Zit beddengoed er ook bij?',
        a: 'Nee, je neemt je eigen beddengoed mee of huurt een linnenpakket voor € 12,50 per persoon. Neem je eigen linnen mee, dan zijn een hoeslaken, dekbedovertrek en kussensloop verplicht.',
        src: ['prijzen', 'faq'],
      },
    ],
  },
  // 7
  {
    topic: 'wifi',
    turns: [
      {
        q: 'Is er wifi in de huisjes?',
        a: 'Ja, op het hele park heb je gratis wifi via het netwerk Duinhoeve-Gast. Het wachtwoord staat op je sleutelpas.',
        src: ['faciliteiten'],
      },
    ],
  },
  // 8
  {
    turns: [
      {
        q: 'Hebben jullie een groepsaccommodatie voor 16 personen?',
        a: 'Ja, Groepsaccommodatie De Hoeve is er voor maximaal 16 personen. Het hart van het huis is de deel, met een lange tafel en een open haard. In de afgesloten tuin staan een overdekte buitenkeuken, een grote barbecue en een vuurschaal.',
        src: ['hoeve', 'groepen'],
      },
      {
        q: 'Mogen we daar een vrijgezellenfeest houden?',
        a: 'Nee, vrijgezellenfeesten en jongerengroepen onder 25 jaar zonder volwassen begeleiding ontvangen we niet.',
        src: ['faq', 'groepen'],
      },
    ],
  },
  // 9
  {
    topic: 'parkeren',
    turns: [
      {
        q: 'Kan ik mijn auto bij het huisje parkeren?',
        a: 'Bij de Duinlodges, de Boshuizen, De Hoeve en de comfortplaatsen parkeer je bij je accommodatie. Bij de Strandhuisjes, safaritenten en tiny houses parkeer je op P1 of P2, op maximaal 150 meter. Daar staan bolderkarren klaar voor je bagage.',
        src: ['bereikbaarheid'],
      },
    ],
  },
  // 10
  {
    topic: 'restaurant',
    turns: [
      {
        q: 'Is er een restaurant op het park?',
        a: 'Ja, restaurant De Duinpan zit in het centrale gebouw naast het zwembad. Je eet er van een broodje kroket tot een driegangendiner met Zeeuwse producten, en er is pizza uit de steenoven. Aan zee zit ons eigen strandpaviljoen Zilt, op 400 meter via het duinpad.',
        src: ['restaurant'],
      },
      {
        q: 'Moet ik reserveren?',
        a: 'Op vrijdag- en zaterdagavond en in het hoogseizoen is reserveren aan te raden. Dat kan via de receptie of telefonisch.',
        src: ['restaurant'],
      },
    ],
  },
  // 11
  {
    topic: 'beddengoed',
    turns: [
      {
        q: 'Moeten we zelf beddengoed meenemen?',
        a: 'Je kunt je eigen beddengoed meenemen of een linnenpakket huren voor € 12,50 per persoon. Neem je eigen linnen mee, dan zijn een hoeslaken, dekbedovertrek en kussensloop verplicht; alleen een slaapzak is niet genoeg. In het tiny house is linnen inbegrepen.',
        src: ['faq', 'prijzen'],
      },
    ],
  },
  // 12
  {
    turns: [{ q: 'Is er een geldautomaat op het park?', a: FALLBACK, kind: 'fallback' }],
  },
  // 13
  {
    topic: 'hond',
    turns: [
      {
        q: 'Mogen honden in het strandhuisje?',
        a: 'Ja, in 12 van de 24 Strandhuisjes mag één hond mee. Geef bij het boeken aan dat je een huisdier meeneemt, dan krijg je een van deze huisjes.',
        src: ['strandhuisje', 'huisdieren'],
      },
      {
        q: 'Wat kost dat per nacht?',
        a: 'Een hond kost € 6,50 per nacht in een vakantiehuis.',
        src: ['huisdieren'],
      },
    ],
  },
  // 14
  {
    turns: [
      {
        q: 'Hoe groot is het tiny house?',
        a: 'Het tiny house is 24 m² en geschikt voor 2 personen. Beneden zit je in de woonkamer met keukenblok en een schuifpui naar het terras. Via een vaste trap kom je in de slaapvide met een tweepersoonsbed. Linnen en handdoeken zijn inbegrepen.',
        src: ['tinyhouse'],
      },
      {
        q: 'Kan onze baby mee?',
        a: 'Het tiny house is niet geschikt voor kinderen onder de 12 jaar, vanwege de open slaapvide. Er past ook geen kinderbedje in. Met een baby zit je beter in een Strandhuisje of een Duinlodge, met het babypakket voor € 25 per verblijf.',
        src: ['tinyhouse', 'prijzen'],
      },
    ],
  },
  // 15
  {
    topic: 'zwembad',
    turns: [
      {
        q: 'Hoe laat gaat het zwembad open?',
        a: 'In de schoolvakanties is zwembad De Golfslag dagelijks open van 09:00 tot 21:00 uur. Daarbuiten op werkdagen van 10:00 tot 18:00 uur en in het weekend van 09:00 tot 19:00 uur. Banenzwemmen voor volwassenen kan op maandag, woensdag en vrijdag van 08:00 tot 10:00 uur.',
        src: ['zwembad'],
      },
      {
        q: 'Is er toezicht?',
        a: 'Ja, er is altijd een gediplomeerde badmeester aanwezig. Kinderen onder 8 jaar of zonder zwemdiploma A zwemmen onder begeleiding van een volwassene in het water.',
        src: ['zwembad'],
      },
    ],
  },
  // 16
  {
    turns: [
      { q: 'Hoi', a: 'Hoi! Waarmee kan ik je helpen? Je kunt me alles vragen over je verblijf op De Duinhoeve.', kind: 'smalltalk' },
      {
        q: 'Hoe ver is het strand?',
        a: 'Het strand ligt op 400 meter, ongeveer vijf minuten lopen via het duinpad. Het dichtstbijzijnde vakantiehuis ligt op 250 meter van het strand, het verste op 900 meter.',
        src: ['faq', 'home'],
      },
    ],
  },
  // 17
  {
    topic: 'inchecken',
    turns: [
      {
        q: 'Kunnen we eerder inchecken?',
        a: 'De accommodatie is pas om 15:00 uur klaar, ook als hij eerder schoon is: we controleren elk huis voordat we de sleutel vrijgeven. Je bent wel vanaf 10:00 uur welkom om het zwembad, het restaurant en het strand te gebruiken, en je kunt je auto alvast op P1 parkeren.',
        src: ['aankomst'],
      },
    ],
  },
  // 18
  {
    turns: [
      { q: 'Kunnen jullie boodschappen in het huisje klaarzetten?', a: FALLBACK, kind: 'fallback' },
      {
        q: 'Is er een supermarkt in de buurt?',
        a: 'Op het park zit Het Winkeltje voor de dagelijkse boodschappen. Een grote supermarkt vind je in het dorp Westerduin, op 1,8 kilometer. Die is dagelijks open van 08:00 tot 21:00 uur.',
        src: ['faq', 'faciliteiten'],
      },
    ],
  },
  // 19
  {
    topic: 'annuleren',
    turns: [
      {
        q: 'Ik ben ziek geworden, kan ik mijn vakantie verzetten?',
        a: 'Wat vervelend, beterschap! Tot 8 weken voor aankomst kun je één keer gratis omboeken naar een andere periode in hetzelfde jaar, als er plek is. Daarna kost een wijziging € 25.\n\nHeb je een annuleringsverzekering, dan vergoedt die bij ernstige ziekte de annuleringskosten.',
        src: ['faq', 'annuleren'],
      },
    ],
  },
  // 20
  {
    turns: [
      {
        q: 'Wat is het verschil tussen de safaritent en de Duinlodge?',
        a: 'De safaritent is glamping voor 5 personen: je slaapt onder canvas, maar met echte bedden, een eigen badkamer en een keuken. Hij is open van eind maart tot eind oktober. De Duinlodge is een houten huis voor 6 personen met drie slaapkamers, twee badkamers, een houtkachel en een omheinde tuin, en is het hele jaar te huur.',
        src: ['safaritent', 'duinlodge'],
      },
      {
        q: 'Is het niet koud in de tent?',
        a: 'Er staat een elektrische kachel voor koude avonden en er liggen extra dekens in de kast. In april en oktober kan het \'s nachts afkoelen tot een graad of 5, dus neem warme kleding mee.',
        src: ['safaritent'],
      },
    ],
  },
  // 21
  {
    topic: 'fietsen',
    turns: [
      {
        q: 'Verhuren jullie fietsen met kinderzitje?',
        a: 'Ja, een kinderzitje of fietskar huur je voor € 4 per dag of € 20 per week. Er is ook een elektrische bakfiets voor 2 kinderen, voor € 35 per dag.',
        src: ['faciliteiten'],
      },
    ],
  },
  // 22
  {
    turns: [
      {
        q: 'Kan ik ergens suppen?',
        a: 'Ja, animatieteam Helmgras organiseert een sup-tocht op het Veerse Meer, vanaf 10 jaar, voor € 32,50 inclusief vervoer. Het Veerse Meer ligt op 14 kilometer van het park.',
        src: ['activiteiten', 'omgeving'],
      },
    ],
  },
  // 23
  {
    turns: [
      {
        q: 'Wat kun je in de omgeving doen met kinderen?',
        a: 'Genoeg! Een paar tips:\n\n- het strand, op 400 meter\n- de speeltuin en de kinderboerderij op het park\n- zwembad De Golfslag met een glijbaan van 42 meter\n- een fietstocht over de Duinroute (24 km)\n\nIn elke schoolvakantie staat animatieteam Helmgras klaar met een programma.',
        src: ['omgeving', 'activiteiten'],
      },
    ],
  },
  // 24
  {
    topic: 'wifi',
    turns: [
      {
        q: 'Is de wifi snel genoeg om thuis te werken?',
        a: 'De wifi haalt ongeveer 50 Mbit per seconde per accommodatie, genoeg om te streamen en te videobellen. Moet je echt werken, dan kun je terecht in de bibliotheek naast de receptie. Daar staan vier werkplekken.',
        src: ['faciliteiten'],
      },
    ],
  },
  // 25
  {
    topic: 'parkeren',
    turns: [
      {
        q: 'Mag ik een tweede auto meenemen?',
        a: 'Ja, een extra auto kost € 3 per dag.',
        src: ['prijzen'],
      },
    ],
  },
  // 26
  {
    topic: 'hond',
    turns: [
      {
        q: 'Kan ik een kampeerplaats met mijn hond boeken?',
        a: 'Zeker, op alle kampeerplaatsen zijn maximaal 2 honden welkom, voor € 4,50 per nacht. Uitlaten doe je in de hondenuitlaatzone achter parkeerplaats P2 of buiten het park.',
        src: ['huisdieren'],
      },
    ],
  },
  // 27
  {
    turns: [
      {
        q: 'Wat is het verschil tussen een comfortplaats en een standaardplaats?',
        a: 'Op een comfortplaats parkeer je je auto bij je plek. De standaardplaatsen liggen op het autovrije veld De Vlinderweide, vlak bij de speeltuin en de kinderboerderij; je auto staat dan op P2, op maximaal 150 meter.\n\nIn het middenseizoen kost een comfortplaats € 32,50 per nacht en een standaardplaats € 24,50.',
        src: ['comfort', 'standaard'],
      },
      {
        q: 'Met hoeveel mensen mag je op een plaats?',
        a: 'Maximaal 6 personen, met 1 kampeermiddel en 1 bijzettentje per plaats.',
        src: ['comfort'],
      },
    ],
  },
  // 28
  {
    topic: 'restaurant',
    turns: [
      {
        q: "Kun je bij Zilt ook 's avonds eten?",
        a: "Ja, van 1 april tot en met 31 oktober is Zilt dagelijks open vanaf 10:00 uur tot zonsondergang, uiterlijk 22:00 uur. Vanuit de glazen serre kijk je 's avonds naar de zonsondergang. Van november tot en met maart is Zilt alleen in het weekend open, van 11:00 tot 17:00 uur.",
        src: ['restaurant'],
      },
    ],
  },
  // 29
  {
    turns: [
      {
        q: 'Is het Boshuis geschikt voor iemand in een rolstoel?',
        a: 'Ja, de zes Boshuizen zijn volledig rolstoeltoegankelijk. Alle deuren zijn minimaal 95 cm breed en er zijn geen drempels. Op de begane grond liggen de woonkamer, de keuken, twee slaapkamers en een aangepaste badkamer. Direct naast het huis is een gehandicaptenparkeerplaats.',
        src: ['boshuis', 'toegankelijkheid'],
      },
    ],
  },
  // 30
  {
    turns: [{ q: 'Kunnen we op het park trouwen?', a: FALLBACK, kind: 'fallback' }],
  },
  // 31
  {
    topic: 'beddengoed',
    turns: [
      {
        q: 'Zijn er handdoeken?',
        a: 'Handdoeken zitten in het linnenpakket van € 12,50 per persoon. Een extra handdoekenset kost € 6,50. Strandlakens neem je zelf mee of koop je in Het Winkeltje.',
        src: ['faq'],
      },
    ],
  },
  // 32
  {
    turns: [
      {
        q: 'Mogen we barbecueën bij het huisje?',
        a: 'Ja, met een gas- of elektrische barbecue en een houtskoolbarbecue op poten. Open vuur en vuurkorven zijn niet toegestaan. Bij code oranje of rood voor natuurbrandrisico mag alleen gas en elektrisch.',
        src: ['faq', 'huisregels'],
      },
    ],
  },
  // 33
  {
    topic: 'inchecken',
    turns: [
      {
        q: 'Hoe laat moeten we vertrekken?',
        a: 'Uit een vakantiehuis vertrek je voor **10:00 uur**, van een kampeerplaats voor 12:00 uur. Een late check-out tot 14:00 uur kost € 35, als de accommodatie die dag niet opnieuw verhuurd is. Na het uitchecken mag je tot 18:00 uur nog op het park blijven en zwemmen.',
        src: ['aankomst'],
      },
    ],
  },
  // 34
  {
    turns: [
      {
        q: 'Hebben jullie nog een Strandhuisje vrij in de kerstvakantie?',
        a: 'Ik kan de beschikbaarheid niet live inzien. In de boekingsmodule op de website zie je direct welke Strandhuisjes er nog vrij zijn voor jouw data. Lukt het niet, dan helpt de receptie je graag via 0118 000 000.',
        src: ['strandhuisje', 'contact'],
      },
    ],
  },
  // 35
  {
    topic: 'zwembad',
    turns: [
      {
        q: 'Is het zwembad gratis?',
        a: 'Ja, voor gasten met een polsbandje is het zwembad gratis. Dat bandje krijg je bij het inchecken. Dagbezoekers betalen € 7,50.',
        src: ['zwembad', 'faq'],
      },
    ],
  },
  // 36
  {
    turns: [
      {
        q: 'Do you speak English?',
        a: 'Yes, of course! Feel free to ask me anything about your stay at De Duinhoeve, for example about our accommodations, check-in times or facilities.',
        kind: 'smalltalk',
      },
      {
        q: 'Are dogs allowed in the tiny house?',
        a: 'Yes, one dog or cat is welcome in every tiny house, for € 6.50 per night. Pets are not allowed on the sleeping loft.',
        src: ['tinyhouse', 'huisdieren'],
      },
    ],
  },
  // 37
  {
    turns: [
      {
        q: 'Is er een kinderbedje en kinderstoel?',
        a: 'Ja, via het babypakket voor € 25 per verblijf: een campingbedje met matras, een kinderstoel en een badje. In De Hoeve staan al twee kinderbedjes en kinderstoelen. In het tiny house past geen kinderbedje.',
        src: ['faq', 'prijzen'],
      },
    ],
  },
  // 38
  {
    turns: [
      {
        q: 'Kan ik een cadeaubon kopen voor mijn ouders?',
        a: 'Ja, een Duinhoeve-cadeaubon is te koop vanaf € 25 en 2 jaar geldig. Je gebruikt hem voor een verblijf, in het restaurant, het strandpaviljoen en de wellness. Bestellen gaat via de receptie of per e-mail.',
        src: ['boeken'],
      },
    ],
  },
  // 39
  {
    topic: 'annuleren',
    turns: [
      {
        q: 'Kan ik annuleren als het slecht weer is?',
        a: 'Slecht weer is helaas geen reden om kosteloos te annuleren; dan gelden de gewone annuleringskosten. Bij regen kun je gelukkig prima terecht in zwembad De Golfslag, wellness Duinzout en restaurant De Duinpan.',
        src: ['annuleren', 'zwembad'],
      },
    ],
  },
  // 40
  {
    turns: [
      {
        q: 'Hoe kom ik met het openbaar vervoer naar het park?',
        a: 'Neem de trein naar station Middelburg. Vanaf daar rijdt buslijn 52 naar Westerduin; stap uit bij halte Westerduin, Duinhoeve, op 200 meter van de receptie. In de zomer rijdt de bus elk half uur, de rest van het jaar elk uur.',
        src: ['bereikbaarheid'],
      },
    ],
  },
  // 41
  {
    topic: 'restaurant',
    turns: [
      {
        q: 'Hebben jullie vegan gerechten?',
        a: 'Ja, in De Duinpan staat onder meer een groene curry met tofu en jasmijnrijst op de kaart, voor € 17,50.',
        src: ['restaurant'],
      },
    ],
  },
  // 42
  {
    topic: 'fietsen',
    turns: [
      {
        q: 'Waar kan ik met de fiets naartoe?',
        a: 'Vanaf het park vertrekken drie bewegwijzerde routes: de Duinroute (24 km), de Polderroute (38 km) en de Kustroute naar de vuurtoren en terug (18 km). De kaarten krijg je gratis bij de receptie.',
        src: ['omgeving'],
      },
    ],
  },
  // 43
  {
    turns: [
      {
        q: 'Is er een wasmachine?',
        a: 'In de Duinlodges staat een wasmachine in de bijkeuken. Verder is er een wasserette in sanitairgebouw De Duinpieper, dagelijks open van 08:00 tot 22:00 uur. Een wasbeurt kost € 5 inclusief wasmiddel, de droger € 4 per 45 minuten.',
        src: ['faciliteiten', 'duinlodge'],
      },
    ],
  },
  // 44
  {
    turns: [
      { q: 'Zit er een tandarts in de buurt?', a: FALLBACK, kind: 'fallback' },
      {
        q: 'Is er wel een huisarts?',
        a: 'In het dorp Westerduin, op 1,8 kilometer, zit een huisartsenpost. Daar vind je ook een apotheek.',
        src: ['omgeving'],
      },
    ],
  },
  // 45
  {
    topic: 'hond',
    turns: [
      {
        q: 'Zijn honden welkom in de safaritent?',
        a: 'In de safaritenten zijn helaas geen huisdieren toegestaan, alleen erkende assistentiehonden. Met je hond kun je terecht in een Duinlodge, een tiny house, een van de hondvriendelijke Strandhuisjes of op een kampeerplaats.',
        src: ['safaritent', 'huisdieren'],
      },
    ],
  },
  // 46
  {
    turns: [{ q: 'Kan ik een huisje bekijken voordat ik boek?', a: FALLBACK, kind: 'fallback' }],
  },
];

// Herhalingen (alleen eerste vraag + antwoord) van populaire templates; de
// volgorde bepaalt de mix, zodat de FAQ-tellers en de lijst bij elkaar passen.
const REPEAT_ORDER = [
  0, 1, 2, 5, 4, 0, 17, 13, 7, 9, 2, 10, 33, 1, 25, 3, 11, 26, 0, 14, 35, 4, 5, 2, 10, 31, 12, 15, 1, 29, 24, 8, 0,
  19, 6, 42, 15, 21, 28, 2, 13, 9, 3, 1, 5, 37, 0, 17, 10, 7, 25, 22, 40, 11, 2, 46, 45,
];

const LIST_SIZE = 100;
/** Hoe lang geleden de gesprekken van vandaag begonnen (minuten). */
const TODAY_MINUTES = [14, 47, 96, 152, 233, 318];

// ---------------------------------------------------------------------------
// Opbouw
// ---------------------------------------------------------------------------

type Built = { id: string; template: Template; turns: Turn[]; startedAt: Date };

/** Deterministische, uuid-achtige ID per index. */
function fakeUuid(i: number): string {
  // mulberry32: kleine, deterministische pseudo-random reeks per index.
  let a = (i + 1) * 0x9e3779b9;
  const hex: string[] = [];
  for (let k = 0; k < 32; k++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    hex.push((((t ^ (t >>> 14)) >>> 0) & 15).toString(16));
  }
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function startFor(i: number, now: Date): Date {
  if (i < TODAY_MINUTES.length) return new Date(Math.floor(now.getTime() / 60_000 - TODAY_MINUTES[i]) * 60_000);
  const j = i - TODAY_MINUTES.length;
  // Recente dagen drukker dan de dagen ervoor: wortel-verdeling over 1..29.
  const day = 1 + Math.floor(Math.pow(j / (LIST_SIZE - TODAY_MINUTES.length), 1.25) * 29);
  const hour = 8 + ((i * 7) % 14);
  const minute = (i * 13) % 60;
  return daysAgo(Math.min(day, 29), hour, minute, now);
}

function buildAll(now: Date): Built[] {
  const out: Built[] = [];
  for (let i = 0; i < LIST_SIZE; i++) {
    const full = i < TEMPLATES.length;
    const template = full ? TEMPLATES[i] : TEMPLATES[REPEAT_ORDER[(i - TEMPLATES.length) % REPEAT_ORDER.length]];
    out.push({
      id: fakeUuid(i),
      template,
      turns: full ? template.turns : template.turns.slice(0, 1),
      startedAt: startFor(i, now),
    });
  }
  return out;
}

/** Eén bericht per ~40-90 seconden. */
function messageTimes(b: Built): Date[] {
  const times: Date[] = [];
  let t = b.startedAt.getTime();
  b.turns.forEach((_, k) => {
    times.push(new Date(t));
    t += 9_000 + (k % 3) * 2_000;
    times.push(new Date(t));
    t += 45_000 + ((k * 17) % 50) * 1_000;
  });
  return times;
}

function sourcesFor(keys: SrcKey[] | undefined, seed: number): ThreadMessageSource[] | null {
  if (!keys || keys.length === 0) return null;
  return keys.map((k, idx) => ({
    ...SRC[k],
    similarity: Math.round((0.83 - idx * 0.09 - ((seed * 7) % 5) * 0.01) * 100) / 100,
  }));
}

function isUnanswered(turns: Turn[]): boolean {
  return turns[turns.length - 1]?.kind === 'fallback';
}

function toListItem(b: Built): V1ConversationListItem {
  const times = messageTimes(b);
  return {
    id: b.id,
    firstQuestion: b.turns[0].q,
    messageCount: b.turns.length * 2,
    lastMessageAt: times[times.length - 1].toISOString(),
    unanswered: isUnanswered(b.turns),
  };
}

// ---------------------------------------------------------------------------
// Publieke API
// ---------------------------------------------------------------------------

/** Gesprekken in de periode, nieuwste eerst (zoals de echte lijst). */
export function listFixtureConversations(period: Period, now: Date = new Date()): V1ConversationListItem[] {
  const since = periodStart(period, now).getTime();
  return buildAll(now)
    .filter((b) => b.startedAt.getTime() >= since)
    .map(toListItem)
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

export function getFixtureConversation(id: string, now: Date = new Date()): V1ConversationDetail | null {
  const b = buildAll(now).find((x) => x.id === id);
  if (!b) return null;
  const times = messageTimes(b);
  const messages: V1ConversationMessage[] = [];
  b.turns.forEach((t, k) => {
    messages.push({ id: `${b.id}-${k}-u`, role: 'user', content: t.q, kind: null, createdAt: times[k * 2].toISOString(), sources: null });
    messages.push({
      id: `${b.id}-${k}-a`,
      role: 'assistant',
      content: t.a,
      kind: t.kind ?? 'answer',
      createdAt: times[k * 2 + 1].toISOString(),
      sources: t.kind === 'fallback' ? null : sourcesFor(t.src, k),
    });
  });
  return {
    thread: { id: b.id, firstQuestion: b.turns[0].q, status: 'open', createdAt: b.startedAt.toISOString() },
    messages,
  };
}

export type FixtureQuestionHit = { threadId: string; snippet: string; askedAt: string };

/** Drilldown: gesprekken waarin één van de varianten letterlijk is gevraagd. */
export function findFixtureConversationsForQuestions(memberQuestions: string[], now: Date = new Date()): FixtureQuestionHit[] {
  const wanted = new Set(memberQuestions.map((q) => q.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];
  const hits: FixtureQuestionHit[] = [];
  for (const b of buildAll(now)) {
    const times = messageTimes(b);
    const k = b.turns.findIndex((t) => wanted.has(t.q.trim().toLowerCase()));
    if (k === -1) continue;
    hits.push({ threadId: b.id, snippet: b.turns[k].q.slice(0, 160), askedAt: times[k * 2].toISOString() });
  }
  return hits.sort((a, b) => (a.askedAt < b.askedAt ? 1 : -1)).slice(0, 50);
}

// ---------------------------------------------------------------------------
// Meest gestelde vragen (FAQ-snapshot)
// ---------------------------------------------------------------------------

export const FIXTURE_FAQ_CONFIG: TopQuestionsConfig = { minCount: 2, topN: 10 };

const FAQ_TOPICS: { topic: Topic; question: string; count: number; extra?: string[] }[] = [
  { topic: 'hond', question: 'Mag mijn hond mee?', count: 41, extra: ['Mag de hond mee naar het park?'] },
  { topic: 'inchecken', question: 'Hoe laat kan ik inchecken?', count: 33, extra: ['Vanaf hoe laat kunnen we in het huisje?'] },
  { topic: 'zwembad', question: 'Is het zwembad ook open in de winter?', count: 27 },
  { topic: 'annuleren', question: 'Kan ik kosteloos annuleren?', count: 22 },
  { topic: 'fietsen', question: 'Kunnen we fietsen huren op het park?', count: 18 },
  { topic: 'wifi', question: 'Is er wifi in de huisjes?', count: 14 },
  { topic: 'parkeren', question: 'Kan ik mijn auto bij het huisje parkeren?', count: 12 },
  { topic: 'restaurant', question: 'Is er een restaurant op het park?', count: 11 },
  { topic: 'beddengoed', question: 'Moeten we zelf beddengoed meenemen?', count: 9 },
  { topic: 'vissen', question: 'Kan ik op het park vissen?', count: 7, extra: ['Mag je vissen bij het park?'] },
];

export function getFixtureFaq(now: Date = new Date()): KlantFaqResult {
  const built = buildAll(now);
  const items: KlantFaqRow[] = FAQ_TOPICS.map((f) => {
    const mine = built.filter((b) => b.template.topic === f.topic);
    const asked = [...new Set(mine.map((b) => b.turns[0].q))];
    const memberQuestions = [f.question, ...asked.filter((q) => q !== f.question), ...(f.extra ?? [])];
    const last = mine.reduce((max, b) => Math.max(max, b.startedAt.getTime()), 0);
    return {
      question: f.question,
      count: f.count,
      lastAskedAt: new Date(last || now.getTime()).toISOString(),
      lastStatus: f.topic === 'vissen' ? 'unanswered' : 'answered',
      memberQuestions,
      paraphraseCount: Math.max(0, memberQuestions.length - 1),
    };
  });
  return {
    items,
    totalUnique: 164,
    pending: false,
    // Snapshot draait 's nachts.
    generatedAt: daysAgo(0, 4, 12, now).getTime() <= now.getTime() ? daysAgo(0, 4, 12, now).toISOString() : daysAgo(1, 4, 12, now).toISOString(),
  };
}

/** Vragen die al als Q&A in de kennisbank staan (knop toont dan "In je Q&A"). */
export const FIXTURE_QA_QUESTIONS: string[] = [
  'Hoe laat kan ik inchecken?',
  'Kan ik kosteloos annuleren?',
  'Moeten we zelf beddengoed meenemen?',
];

/** Onbeantwoorde vragen voor Overzicht ("Hier wist je chatbot het niet"). */
export function getFixtureUnanswered(now: Date = new Date()): { question: string; occurrences: number; lastSeenAt: string }[] {
  const built = buildAll(now);
  const lastSeen = (q: string) => {
    const t = built
      .filter((b) => b.turns.some((x) => x.q === q))
      .reduce((max, b) => Math.max(max, b.startedAt.getTime()), 0);
    return new Date(t || now.getTime()).toISOString();
  };
  return [
    { question: 'Kan ik op het park vissen?', occurrences: 7 },
    { question: 'Is er een geldautomaat op het park?', occurrences: 4 },
    { question: 'Kan ik een huisje bekijken voordat ik boek?', occurrences: 3 },
  ].map((u) => ({ ...u, lastSeenAt: lastSeen(u.question) }));
}
