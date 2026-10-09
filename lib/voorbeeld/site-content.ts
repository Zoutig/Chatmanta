/**
 * Vakantiepark De Duinhoeve — FICTIEF bedrijf.
 *
 * Enige bron van waarheid voor de voorbeeldwebsite onder /voorbeeld/website.
 * Dezelfde data wordt (via pageToPlainText) als kennisbank in de demo-chatbot
 * geladen. Alles wat zichtbaar is als content op de site moet hier staan, zodat
 * de bot precies weet wat een bezoeker op de pagina kan lezen.
 *
 * Prijzen, tijden en regels worden zoveel mogelijk uit constanten opgebouwd,
 * zodat dezelfde waarde op elke pagina identiek is.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SiteTable {
  columns: string[];
  rows: string[][];
}

export interface SiteFaqItem {
  q: string;
  a: string;
}

export interface SiteQuote {
  text: string;
  author: string;
}

export interface SiteSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: SiteTable;
  faq?: SiteFaqItem[];
  /** Gastenreviews (alleen op de homepage gebruikt). */
  quotes?: SiteQuote[];
}

export type SitePageGroup = 'verblijf' | 'park' | 'praktisch' | 'over';

export type SceneVariant =
  | 'strand'
  | 'lodge'
  | 'bos'
  | 'tent'
  | 'tiny'
  | 'hoeve'
  | 'camping'
  | 'zwembad'
  | 'restaurant'
  | 'omgeving'
  | 'duinen';

export interface SitePage {
  /** '' voor de homepage, anders bijvoorbeeld 'prijzen' of 'accommodaties/duinlodge'. */
  slug: string;
  /** Volledig pad, bijvoorbeeld '/voorbeeld/website/prijzen'. */
  path: string;
  navLabel: string;
  title: string;
  intro: string;
  sections: SiteSection[];
  /** Voor de footer-sitemap. */
  group: SitePageGroup;
  /** Illustratie bovenaan de pagina. */
  scene: SceneVariant;
  /** Korte omschrijving voor metadata. */
  description: string;
  /** Alleen gezet op accommodatiepagina's. */
  accommodationSlug?: string;
}

export type SeasonKey = 'laag' | 'midden' | 'hoog';

export interface StayPrices {
  weekend: number;
  midweek: number;
  week: number;
}

export interface Accommodation {
  slug: string;
  name: string;
  kind: 'huis' | 'kamperen';
  persons: number;
  /** Aantal slaapkamers (0 bij kampeerplaatsen). */
  bedrooms: number;
  sizeM2: number;
  units: number;
  tagline: string;
  scene: SceneVariant;
  description: string[];
  layout: string[];
  amenities: string[];
  pets: { allowed: boolean; max: number; note: string };
  /** Verplichte eindschoonmaak in euro (0 = niet van toepassing). */
  cleaningFee: number;
  deposit: number;
  /** Open periode in tekst. */
  openPeriod: string;
  /** Huizen: prijs per verblijf. Ontbreekt een seizoen, dan is de accommodatie dan gesloten. */
  stayPrices?: Partial<Record<SeasonKey, StayPrices>>;
  /** Kampeerplaatsen: prijs per nacht voor 2 personen. */
  nightPrices?: Partial<Record<SeasonKey, number>>;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Nederlandse euronotatie: 1195 → "€ 1.195", 26.5 → "€ 26,50". */
export function euro(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - whole) * 100);
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = cents > 0 ? `${wholeStr},${String(cents).padStart(2, '0')}` : wholeStr;
  return `${negative ? '-' : ''}€ ${body}`;
}

export const BASE_PATH = '/voorbeeld/website';

export function pathFor(slug: string): string {
  return slug ? `${BASE_PATH}/${slug}` : BASE_PATH;
}

// ---------------------------------------------------------------------------
// Vaste bedrijfsgegevens (fictief)
// ---------------------------------------------------------------------------

export const COMPANY = {
  name: 'Vakantiepark De Duinhoeve',
  shortName: 'De Duinhoeve',
  street: 'Duinhoeveweg 12',
  postcode: '4370 XX',
  city: 'Westerduin',
  province: 'Zeeland',
  phone: '0118 000 000',
  emergencyPhone: '0118 000 001',
  whatsapp: '06 00 00 00 00',
  email: 'info@duinhoeve.example',
  groupsEmail: 'groepen@duinhoeve.example',
  jobsEmail: 'werken@duinhoeve.example',
  privacyEmail: 'privacy@duinhoeve.example',
  kvk: '00000000',
  founded: 1987,
  hectares: 28,
  fictionNotice: 'Fictief bedrijf — voorbeeldwebsite van ChatManta',
} as const;

export const SEASONS: Record<SeasonKey, { label: string; periods: string }> = {
  laag: {
    label: 'Laagseizoen',
    periods: '1 januari t/m 26 maart 2027 en 29 oktober t/m 24 december 2027',
  },
  midden: {
    label: 'Middenseizoen',
    periods:
      '26 maart t/m 9 juli 2027, 3 september t/m 29 oktober 2027 en de kerstvakantie van 24 december 2027 t/m 7 januari 2028',
  },
  hoog: {
    label: 'Hoogseizoen',
    periods: '9 juli t/m 3 september 2027 (zomervakantie)',
  },
};

export const FEES = {
  touristTax: 2.1,
  bookingFee: 17.5,
  linenPerPerson: 12.5,
  extraTowels: 6.5,
  babyPack: 25,
  petPerNight: 6.5,
  petPerNightCamping: 4.5,
  lateArrivalAfter22: 15,
  lateCheckout: 35,
  extraCar: 3,
  dayVisitor: 3.5,
  cancelInsurancePct: '5,5%',
  policyCosts: 4.95,
  rebooking: 25,
  extraPersonCamping: 5.5,
  extraChildCamping: 4,
  campingKeyCardDeposit: 25,
  poolDayPass: 7.5,
  wellness2h: 17.5,
  massage50: 65,
  massage25: 39,
  evPerKwh: 0.49,
  washer: 5,
  dryer: 4,
  breakfastAdult: 14.5,
  breakfastChild: 8.5,
} as const;

export const RECEPTION_HOURS: string[] = [
  'Laagseizoen: maandag t/m zaterdag 09:00 tot 17:00 uur, zondag 10:00 tot 16:00 uur',
  'Middenseizoen: dagelijks 09:00 tot 18:00 uur, op vrijdag tot 20:00 uur',
  'Hoogseizoen: dagelijks 08:30 tot 20:00 uur',
  '25 december en 1 januari: 10:00 tot 14:00 uur',
];

// ---------------------------------------------------------------------------
// Accommodaties
// ---------------------------------------------------------------------------

export const ACCOMMODATIONS: Accommodation[] = [
  {
    slug: 'strandhuisje',
    name: 'Strandhuisje',
    kind: 'huis',
    persons: 4,
    bedrooms: 2,
    sizeM2: 42,
    units: 24,
    tagline: 'Knus houten huisje op loopafstand van zee, ideaal voor een gezin met twee kinderen.',
    scene: 'strand',
    description: [
      'Onze strandhuisjes staan in twee rijen aan de zeekant van het park, op het veld De Zeereep. Vanaf je terras loop je in vijf minuten via het duinpad naar het strand. De huisjes zijn gebouwd van onbehandeld lariks dat met de jaren mooi zilvergrijs kleurt, en hebben grote ramen aan de zuidkant, zodat het binnen licht en warm aanvoelt.',
      'Binnen vind je een open woonkamer met keuken, twee slaapkamers en een badkamer met douche. Het huisje is compact maar slim ingedeeld, met veel bergruimte voor strandspullen. Op het overdekte terras staan een loungebank en een tuinset voor vier personen, en er is een buitendouche om het zand van je voeten te spoelen.',
      'Het strandhuisje is onze populairste accommodatie. Wil je in de zomervakantie komen, boek dan op tijd: de weken in juli en augustus zijn meestal in januari al grotendeels vol.',
    ],
    layout: [
      'Woonkamer met bank, eettafel voor 4 personen en smart-tv',
      'Open keuken met inductiekookplaat (2 pitten), combimagnetron, koelkast met vriesvak, vaatwasser, Nespresso-apparaat en waterkoker',
      'Slaapkamer 1: tweepersoonsbed van 160 x 200 cm',
      'Slaapkamer 2: twee eenpersoonsbedden van 80 x 200 cm',
      'Badkamer met douche, wastafel en toilet',
      'Overdekt terras met loungebank, tuinset en buitendouche',
    ],
    amenities: [
      'Gratis wifi',
      'Vloerverwarming',
      'Geen airco, wel een staande ventilator',
      'Parkeren op parkeerplaats P1 (circa 150 meter), bolderkar te leen voor je bagage',
      'Strandset met windscherm en twee strandstoelen te leen bij de receptie',
    ],
    pets: {
      allowed: true,
      max: 1,
      note: '12 van de 24 strandhuisjes zijn hondvriendelijk. Geef bij het boeken aan dat je een huisdier meeneemt, dan krijg je een van deze huisjes.',
    },
    cleaningFee: 75,
    deposit: 150,
    openPeriod: 'Het hele jaar geopend',
    stayPrices: {
      laag: { weekend: 285, midweek: 335, week: 595 },
      midden: { weekend: 365, midweek: 425, week: 795 },
      hoog: { weekend: 495, midweek: 575, week: 1195 },
    },
    notes: [
      'Een kinderbedje en kinderstoel zijn mogelijk via het babypakket; het bedje past in slaapkamer 1.',
      'Het strandhuisje is niet geschikt voor rolstoelgebruikers: er is een opstap van 20 cm naar het terras.',
      'Maximaal 4 personen, baby\'s tot 2 jaar tellen niet mee voor het maximum.',
    ],
  },
  {
    slug: 'duinlodge',
    name: 'Duinlodge',
    kind: 'huis',
    persons: 6,
    bedrooms: 3,
    sizeM2: 68,
    units: 18,
    tagline: 'Ruime lodge tussen de duinen met omheinde tuin, houtkachel en twee badkamers.',
    scene: 'lodge',
    description: [
      'De Duinlodges liggen verspreid over het glooiende duingebied aan de noordkant van het park, op het veld Helmgras. Elke lodge heeft een eigen omheinde tuin van ongeveer 150 m², zodat kinderen en honden veilig buiten kunnen spelen. Door de hoogteverschillen kijk je vanuit de meeste lodges uit over het helmgras, en vanuit een paar lodges zie je de zee.',
      'De lodge heeft een royale woonkamer met een grote raampartij, een houtkachel en een complete keuken. Er zijn drie slaapkamers en twee badkamers, dus ook met zes personen is het in de ochtend niet dringen. In de tuin staan een ruime loungeset, een tuintafel voor zes en een gas-barbecue.',
      'De Duinlodge is geschikt voor gezinnen, twee stellen samen of grootouders die met de kleinkinderen op vakantie gaan. Hout voor de kachel koop je bij de receptie voor € 7,50 per krat.',
    ],
    layout: [
      'Woonkamer met houtkachel, hoekbank en smart-tv',
      'Keuken met inductiekookplaat (4 pitten), oven, magnetron, vaatwasser, koelkast, aparte vriezer, koffiezetapparaat en Nespresso',
      'Slaapkamer 1: boxspring van 180 x 200 cm met eigen badkamer (douche, wastafel, toilet)',
      'Slaapkamer 2: twee eenpersoonsbedden van 90 x 200 cm',
      'Slaapkamer 3: stapelbed van 90 x 200 cm (bovenste bed vanaf 6 jaar)',
      'Tweede badkamer met ligbad, douche, wastafel en apart toilet',
      'Omheinde tuin met loungeset, tuintafel en gas-barbecue',
    ],
    amenities: [
      'Gratis wifi',
      'Houtkachel en vloerverwarming',
      'Wasmachine in de bijkeuken',
      'Eigen parkeerplaats naast de lodge',
      'Gas-barbecue (gasfles inbegrepen)',
    ],
    pets: {
      allowed: true,
      max: 2,
      note: 'Alle Duinlodges zijn hondvriendelijk. De tuin is volledig omheind met een hek van 1,20 meter hoog.',
    },
    cleaningFee: 95,
    deposit: 200,
    openPeriod: 'Het hele jaar geopend',
    stayPrices: {
      laag: { weekend: 395, midweek: 465, week: 845 },
      midden: { weekend: 495, midweek: 575, week: 1095 },
      hoog: { weekend: 695, midweek: 795, week: 1695 },
    },
    notes: [
      'In de Duinlodge mag je de houtkachel gebruiken, behalve als er een stookverbod geldt (bijvoorbeeld bij code oranje of rood voor droogte).',
      'Er zijn 4 Duinlodges met zeezicht (nummers 41 t/m 44). Voor een lodge met zeezicht betaal je € 75 per week extra, of € 40 per weekend of midweek.',
      'Maximaal 6 personen, baby\'s tot 2 jaar tellen niet mee voor het maximum.',
    ],
  },
  {
    slug: 'boshuis',
    name: 'Boshuis',
    kind: 'huis',
    persons: 8,
    bedrooms: 4,
    sizeM2: 112,
    units: 6,
    tagline: 'Rolstoeltoegankelijk familiehuis aan de bosrand, volledig gelijkvloers bruikbaar.',
    scene: 'bos',
    description: [
      'De zes Boshuizen staan aan de rand van het dennenbos aan de oostkant van het park, op het rustigste deel van De Duinhoeve. Ze zijn in 2022 nieuw gebouwd en volledig rolstoeltoegankelijk. Alle deuren zijn minimaal 95 cm breed, er zijn geen drempels en je kunt met een rolstoel overal draaien.',
      'Op de begane grond liggen de woonkamer, de keuken, twee slaapkamers en een aangepaste badkamer. Op de verdieping zijn nog twee slaapkamers en een tweede badkamer. Zo kan een gezin met iemand die rolstoel gebruikt prima samen met opa en oma of vrienden op vakantie.',
      'Het Boshuis is allergievriendelijk: er liggen geen vloerkleden, de matrassen hebben anti-allergeenhoezen en er komen geen huisdieren in. Erkende assistentiehonden zijn natuurlijk wel welkom, en daarvoor betaal je niets.',
    ],
    layout: [
      'Begane grond: woonkamer met eettafel voor 8 en smart-tv',
      'Begane grond: keuken met onderrijdbaar aanrecht, inductiekookplaat (4 pitten), oven op werkhoogte, vaatwasser, koelkast en vriezer',
      'Begane grond, slaapkamer 1: twee elektrisch verstelbare bedden van 90 x 200 cm (los of als tweepersoonsbed)',
      'Begane grond, slaapkamer 2: twee eenpersoonsbedden van 90 x 200 cm',
      'Begane grond: aangepaste badkamer met inloopdouche, douchezitje, beugels, verhoogd toilet en onderrijdbare wastafel',
      'Verdieping, slaapkamer 3: tweepersoonsbed van 160 x 200 cm',
      'Verdieping, slaapkamer 4: twee eenpersoonsbedden van 80 x 200 cm',
      'Verdieping: badkamer met douche, wastafel en toilet',
      'Terras met verharde, vlakke ondergrond en een tuinset voor 8 personen',
    ],
    amenities: [
      'Gratis wifi',
      'Vloerverwarming en airconditioning in de woonkamer',
      'Twee wasmachines en een droger in de berging',
      'Gehandicaptenparkeerplaats direct naast het huis, met laadpunt voor een scootmobiel',
      'Hoog-laagbed op aanvraag zonder extra kosten (één per huis)',
    ],
    pets: {
      allowed: false,
      max: 0,
      note: 'In het Boshuis zijn geen huisdieren toegestaan, omdat het huis allergievriendelijk is. Erkende assistentiehonden zijn altijd gratis welkom.',
    },
    cleaningFee: 125,
    deposit: 250,
    openPeriod: 'Het hele jaar geopend',
    stayPrices: {
      laag: { weekend: 545, midweek: 625, week: 1145 },
      midden: { weekend: 675, midweek: 775, week: 1495 },
      hoog: { weekend: 945, midweek: 1075, week: 2295 },
    },
    notes: [
      'Een tillift kun je huren bij een externe thuiszorgwinkel in Middelburg; zij bezorgen en halen op bij het park. De receptie regelt dit graag voor je.',
      'Het pad van de parkeerplaats naar de voordeur is verhard en vlak.',
      'Maximaal 8 personen, baby\'s tot 2 jaar tellen niet mee voor het maximum.',
    ],
  },
  {
    slug: 'safaritent',
    name: 'Glamping safaritent',
    kind: 'huis',
    persons: 5,
    bedrooms: 2,
    sizeM2: 45,
    units: 12,
    tagline: 'Kamperen met comfort: echte bedden, eigen badkamer en een houten veranda.',
    scene: 'tent',
    description: [
      'De safaritenten staan op houten vlonders in de luwte van het duinbos, op het veld De Vlinderweide. Je slaapt onder canvas, hoort ’s nachts de wind in de dennen en de vogels in de ochtend, maar je hebt wel echte bedden, een eigen badkamer en een keuken.',
      'De tent heeft een woon- en kookgedeelte, een slaapkamer met tweepersoonsbed, een slaapkamer met een stapelbed en een bedstee voor een vijfde persoon. Op de overdekte veranda staan een tafel met banken en twee luie stoelen. Een kampvuurplek is er niet, maar je mag de vuurschaal bij het gezamenlijke kampvuur op De Vlinderweide gebruiken op de vaste avonden.',
      'De safaritent is alleen geopend van 26 maart tot 29 oktober 2027. In de tent is wifi, maar er is bewust geen tv.',
    ],
    layout: [
      'Woon- en kookgedeelte met eettafel, gaskookstel (2 pitten), koelkast, waterkoker en Bialetti',
      'Slaapkamer 1: tweepersoonsbed van 160 x 200 cm',
      'Slaapkamer 2: stapelbed van 80 x 190 cm (bovenste bed vanaf 6 jaar)',
      'Bedstee van 90 x 190 cm in het woongedeelte',
      'Eigen badkamer met douche, wastafel en toilet (in een houten unit aan de tent)',
      'Overdekte veranda met tafel, banken en twee luie stoelen',
    ],
    amenities: [
      'Gratis wifi, geen tv',
      'Elektrische kachel voor koude avonden',
      'Stroom (geen magnetron of waterkoker tegelijk met de kachel gebruiken)',
      'Parkeren op parkeerplaats P2 (circa 100 meter)',
    ],
    pets: {
      allowed: false,
      max: 0,
      note: 'In de safaritenten zijn geen huisdieren toegestaan. Erkende assistentiehonden zijn welkom.',
    },
    cleaningFee: 65,
    deposit: 100,
    openPeriod: 'Geopend van 26 maart t/m 29 oktober 2027',
    stayPrices: {
      midden: { weekend: 295, midweek: 345, week: 645 },
      hoog: { weekend: 425, midweek: 495, week: 995 },
    },
    notes: [
      'In het laagseizoen is de safaritent gesloten.',
      'Neem warme kleding mee: in april en oktober kan het ’s nachts afkoelen tot een graad of 5. Extra dekens liggen in de kast.',
      'Maximaal 5 personen, baby\'s tot 2 jaar tellen niet mee voor het maximum.',
    ],
  },
  {
    slug: 'tiny-house',
    name: 'Tiny house',
    kind: 'huis',
    persons: 2,
    bedrooms: 1,
    sizeM2: 24,
    units: 8,
    tagline: 'Klein en compleet, met een slaapvide onder het dakraam. Voor twee personen.',
    scene: 'tiny',
    description: [
      'De acht tiny houses staan aan de rand van de vlinderweide, elk met een eigen stukje tuin en een vrij uitzicht over het grasland. Ze zijn bedoeld voor twee personen die het simpel en gezellig willen houden: stellen, vrienden of iemand die even alleen wil uitwaaien.',
      'Beneden zit je in de woonkamer met keukenblok en een grote schuifpui naar het terras. Via een vaste trap met leuning kom je in de slaapvide, waar je met het dakraam open naar de sterren kijkt. De badkamer met douche en toilet ligt op de begane grond.',
      'Bij het tiny house is het linnenpakket al inbegrepen: de bedden zijn opgemaakt als je aankomt en er liggen handdoeken voor twee personen klaar.',
    ],
    layout: [
      'Woonkamer met bank, klein eettafeltje en smart-tv',
      'Keukenblok met inductiekookplaat (2 pitten), combimagnetron, koelkast, waterkoker en koffiezetapparaat (geen vaatwasser)',
      'Slaapvide met tweepersoonsbed van 160 x 200 cm, bereikbaar via een vaste trap',
      'Badkamer met douche, wastafel en toilet',
      'Terras met twee ligstoelen en een bistrosetje',
    ],
    amenities: [
      'Gratis wifi',
      'Infraroodpanelen en airconditioning',
      'Linnenpakket en handdoeken inbegrepen',
      'Parkeren op parkeerplaats P2 (circa 80 meter)',
    ],
    pets: {
      allowed: true,
      max: 1,
      note: 'In alle tiny houses mag één hond of kat mee. De slaapvide is niet toegankelijk voor huisdieren.',
    },
    cleaningFee: 55,
    deposit: 100,
    openPeriod: 'Het hele jaar geopend',
    stayPrices: {
      laag: { weekend: 189, midweek: 229, week: 409 },
      midden: { weekend: 239, midweek: 279, week: 519 },
      hoog: { weekend: 315, midweek: 365, week: 745 },
    },
    notes: [
      'Het tiny house is niet geschikt voor kinderen onder de 12 jaar, vanwege de open slaapvide.',
      'Een kinderbedje past niet in het tiny house.',
      'Maximaal 2 personen.',
    ],
  },
  {
    slug: 'groepsaccommodatie',
    name: 'Groepsaccommodatie De Hoeve',
    kind: 'huis',
    persons: 16,
    bedrooms: 8,
    sizeM2: 340,
    units: 1,
    tagline: 'De gerestaureerde boerderij uit 1912, voor families en bedrijven tot 16 personen.',
    scene: 'hoeve',
    description: [
      'De Hoeve is de oude boerderij waar het park ooit mee begon. Het pand uit 1912 is in 2019 helemaal gerestaureerd en verbouwd tot een groepsaccommodatie voor maximaal 16 personen. De oude balken, de tegelvloer in de deel en de hooizolder zijn bewaard gebleven, met daaronder een moderne keuken en acht slaapkamers met elk een eigen badkamer.',
      'Het hart van het huis is de deel: een grote ruimte met een lange tafel voor 18 personen, een open haard en een zithoek. Via de dubbele staldeuren loop je de afgesloten tuin in met een overdekte buitenkeuken, een grote barbecue en een vuurschaal. De Hoeve ligt iets apart van de andere accommodaties, zodat je met een groep wat meer ruimte hebt.',
      'De Hoeve verhuren we aan families, vriendengroepen vanaf 25 jaar en bedrijven. Jongerengroepen en vrijgezellenfeesten ontvangen we niet. Voor bedrijven kun je de deel ook overdag als vergaderruimte gebruiken, zie de pagina Groepen en bedrijven.',
    ],
    layout: [
      'De deel: eettafel voor 18 personen, open haard, zithoek en beamer met scherm',
      'Keuken met twee inductiekookplaten, twee ovens, twee vaatwassers, Amerikaanse koelkast, extra koel- en vriesruimte en servies voor 24 personen',
      'Begane grond: 3 slaapkamers met elk twee eenpersoonsbedden en eigen badkamer, waarvan 1 rolstoeltoegankelijk',
      'Verdieping: 5 slaapkamers met elk een tweepersoonsbed of twee eenpersoonsbedden en eigen badkamer',
      'Speelzolder met tafelvoetbal en een kast vol spelletjes',
      'Afgesloten tuin met buitenkeuken, barbecue en vuurschaal',
    ],
    amenities: [
      'Gratis wifi (glasvezel)',
      'Open haard (hout inbegrepen)',
      'Wasmachine en droger',
      'Zes parkeerplaatsen naast het huis, extra auto\'s op P1',
      'Twee kinderbedjes en twee kinderstoelen aanwezig',
    ],
    pets: {
      allowed: true,
      max: 2,
      note: 'In De Hoeve zijn maximaal 2 honden welkom. Honden mogen niet op de verdieping en niet op de speelzolder.',
    },
    cleaningFee: 295,
    deposit: 500,
    openPeriod: 'Het hele jaar geopend, ook in het hoogseizoen per weekend of midweek te boeken',
    stayPrices: {
      laag: { weekend: 1395, midweek: 1595, week: 2795 },
      midden: { weekend: 1695, midweek: 1995, week: 3495 },
      hoog: { weekend: 2395, midweek: 2795, week: 4995 },
    },
    notes: [
      'Bij De Hoeve is het linnenpakket verplicht.',
      'De vuurschaal in de tuin mag je gebruiken tot 23:00 uur, behalve als er een stookverbod geldt.',
      'Muziek in de tuin is toegestaan tot 22:00 uur. Binnen geldt vanaf 23:00 uur dat er buiten de Hoeve niets te horen mag zijn.',
      'Maximaal 16 personen, baby\'s tot 2 jaar tellen niet mee voor het maximum.',
    ],
  },
  {
    slug: 'kampeerplaats-comfort',
    name: 'Kampeerplaats Comfort',
    kind: 'kamperen',
    persons: 6,
    bedrooms: 0,
    sizeM2: 120,
    units: 60,
    tagline: 'Ruime plaats van 120 m² met eigen water, afvoer en 10 ampère stroom.',
    scene: 'camping',
    description: [
      'De comfortplaatsen liggen op de velden De Zeereep en Duindoorn, met hagen van duindoorn en liguster tussen de plaatsen. Elke plaats is ongeveer 120 m² groot en heeft een eigen wateraansluiting, afvoer voor grijs water, een stroomaansluiting van 10 ampère en een tv-aansluiting. Je kunt met je auto op je plaats parkeren.',
      'Op loopafstand vind je het sanitairgebouw De Duinpieper, met verwarmde douches, een familiedouche, een babyruimte, een aangepaste sanitaire ruimte en afwasplekken. Warm water bij het douchen en afwassen is gratis.',
      'Tien comfortplaatsen op het veld Duindoorn zijn het hele jaar open voor winterkamperen. In de winter is het sanitair in het kleine sanitairgebouw Het Torentje verwarmd en open.',
    ],
    layout: [
      'Plaatsgrootte circa 120 m², vlak en met gras',
      'Eigen wateraansluiting en afvoer voor grijs water',
      'Stroom 10 ampère (CEE-aansluiting, verloopkabel te leen bij de receptie)',
      'Tv-aansluiting',
      'Auto op de eigen plaats',
    ],
    amenities: [
      'Gratis wifi op het hele veld',
      'Verwarmd sanitair met gratis warme douches',
      'Chemisch toilet legen bij het servicestation naast De Duinpieper',
      'Gasflessen te koop of te ruilen bij de receptie',
    ],
    pets: {
      allowed: true,
      max: 2,
      note: 'Op alle kampeerplaatsen zijn maximaal 2 huisdieren welkom.',
    },
    cleaningFee: 0,
    deposit: 25,
    openPeriod: 'Geopend van 26 maart t/m 29 oktober 2027. Tien plaatsen op veld Duindoorn zijn het hele jaar open (winterkamperen).',
    nightPrices: { laag: 26.5, midden: 32.5, hoog: 44.5 },
    notes: [
      'De prijs per nacht is voor 2 personen, inclusief stroom, water, warme douches en één auto.',
      'Minimale verblijfsduur is 2 nachten. In het hoogseizoen is dat 5 nachten.',
      'Maximaal 6 personen en 1 kampeermiddel plus 1 bijzettentje per plaats.',
      'De borg van € 25 is voor de slagboompas. Je krijgt hem terug als je de pas inlevert bij vertrek.',
    ],
  },
  {
    slug: 'kampeerplaats-standaard',
    name: 'Kampeerplaats Standaard',
    kind: 'kamperen',
    persons: 6,
    bedrooms: 0,
    sizeM2: 90,
    units: 45,
    tagline: 'Gezellige plaats van 90 m² op het autovrije veld, met 6 ampère stroom.',
    scene: 'camping',
    description: [
      'De standaardplaatsen liggen op het autovrije veld De Vlinderweide, vlak bij de speeltuin en de kinderboerderij. Omdat er geen auto\'s rijden, kunnen kinderen hier vrij rondfietsen en spelen. Je parkeert je auto op parkeerplaats P2, op maximaal 150 meter van je plaats.',
      'Elke plaats is ongeveer 90 m² en heeft een stroomaansluiting van 6 ampère. Water tap je bij een van de vier watertappunten op het veld. Het sanitairgebouw De Duinpieper ligt op maximaal 120 meter.',
      'De standaardplaatsen zijn geschikt voor tenten, vouwwagens en kleine caravans tot 6 meter. Een camper kan hier niet staan, omdat het veld autovrij is.',
    ],
    layout: [
      'Plaatsgrootte circa 90 m², gras',
      'Stroom 6 ampère (CEE-aansluiting)',
      'Watertappunt op het veld, niet op de plaats',
      'Auto op parkeerplaats P2, maximaal 150 meter',
    ],
    amenities: [
      'Gratis wifi op het hele veld',
      'Verwarmd sanitair met gratis warme douches',
      'Bolderkarren te leen bij de ingang van het veld',
      'Speeltuin en kinderboerderij op loopafstand',
    ],
    pets: {
      allowed: true,
      max: 2,
      note: 'Op alle kampeerplaatsen zijn maximaal 2 huisdieren welkom.',
    },
    cleaningFee: 0,
    deposit: 25,
    openPeriod: 'Geopend van 26 maart t/m 29 oktober 2027',
    nightPrices: { midden: 24.5, hoog: 34.5 },
    notes: [
      'De prijs per nacht is voor 2 personen, inclusief stroom, water, warme douches en één auto op P2.',
      'Minimale verblijfsduur is 2 nachten. In het hoogseizoen is dat 5 nachten.',
      'Caravans langer dan 6 meter en campers kunnen niet op een standaardplaats staan; kies dan een comfortplaats.',
      'De borg van € 25 is voor de slagboompas. Je krijgt hem terug als je de pas inlevert bij vertrek.',
    ],
  },
];

export function getAccommodation(slug: string): Accommodation | undefined {
  return ACCOMMODATIONS.find((a) => a.slug === slug);
}

/** Laagste prijs voor teaser-kaarten. */
export function fromPrice(acc: Accommodation): { amount: number; unit: string } {
  if (acc.nightPrices) {
    const values = Object.values(acc.nightPrices).filter((v): v is number => typeof v === 'number');
    return { amount: Math.min(...values), unit: 'per nacht (2 personen)' };
  }
  const weeks = Object.values(acc.stayPrices ?? {}).map((p) => p.week);
  return { amount: Math.min(...weeks), unit: 'per week' };
}

function stayPriceTable(acc: Accommodation): SiteTable {
  const keys: SeasonKey[] = ['laag', 'midden', 'hoog'];
  return {
    columns: ['Seizoen', 'Weekend (3 nachten)', 'Midweek (4 nachten)', 'Week (7 nachten)'],
    rows: keys.map((k) => {
      const p = acc.stayPrices?.[k];
      if (!p) return [SEASONS[k].label, 'Gesloten', 'Gesloten', 'Gesloten'];
      return [SEASONS[k].label, euro(p.weekend), euro(p.midweek), euro(p.week)];
    }),
  };
}

function nightPriceTable(acc: Accommodation): SiteTable {
  const keys: SeasonKey[] = ['laag', 'midden', 'hoog'];
  return {
    columns: ['Seizoen', 'Prijs per nacht (2 personen)'],
    rows: keys.map((k) => {
      const p = acc.nightPrices?.[k];
      return [SEASONS[k].label, typeof p === 'number' ? euro(p) : 'Gesloten'];
    }),
  };
}

function accommodationPage(acc: Accommodation): SitePage {
  const isHouse = acc.kind === 'huis';
  const facts: string[] = [
    `Maximaal ${acc.persons} personen`,
    isHouse ? `${acc.bedrooms} ${acc.bedrooms === 1 ? 'slaapkamer' : 'slaapkamers'}` : 'Kampeerplaats',
    `Oppervlakte: circa ${acc.sizeM2} m²`,
    `Aantal op het park: ${acc.units}`,
    acc.pets.allowed ? `Huisdieren toegestaan: ja, maximaal ${acc.pets.max}` : 'Huisdieren toegestaan: nee (assistentiehonden wel welkom)',
    acc.openPeriod,
  ];

  const costBullets: string[] = isHouse
    ? [
        `Verplichte eindschoonmaak: ${euro(acc.cleaningFee)} per verblijf`,
        `Borg: ${euro(acc.deposit)}, terug binnen 7 werkdagen na vertrek`,
        acc.slug === 'tiny-house'
          ? 'Linnenpakket: inbegrepen'
          : `Linnenpakket: ${euro(FEES.linenPerPerson)} per persoon${acc.slug === 'groepsaccommodatie' ? ' (verplicht)' : ' (of neem je eigen linnen mee)'}`,
        `Toeristenbelasting: ${euro(FEES.touristTax)} per persoon per nacht`,
        `Reserveringskosten: ${euro(FEES.bookingFee)} per boeking`,
        acc.pets.allowed ? `Huisdier: ${euro(FEES.petPerNight)} per huisdier per nacht` : 'Huisdieren: niet toegestaan',
      ]
    : [
        `Extra persoon vanaf 12 jaar: ${euro(FEES.extraPersonCamping)} per nacht`,
        `Extra kind van 2 t/m 11 jaar: ${euro(FEES.extraChildCamping)} per nacht`,
        `Huisdier: ${euro(FEES.petPerNightCamping)} per huisdier per nacht`,
        `Extra auto: ${euro(FEES.extraCar)} per dag`,
        `Toeristenbelasting: ${euro(FEES.touristTax)} per persoon per nacht`,
        `Reserveringskosten: ${euro(FEES.bookingFee)} per boeking`,
        `Borg slagboompas: ${euro(FEES.campingKeyCardDeposit)}`,
        'Geen schoonmaakkosten',
      ];

  const sections: SiteSection[] = [
    { heading: isHouse ? 'Over deze accommodatie' : 'Over deze kampeerplaats', paragraphs: acc.description },
    { heading: 'Kenmerken in het kort', bullets: facts },
    { heading: isHouse ? 'Indeling' : 'De plaats', bullets: acc.layout },
    { heading: 'Voorzieningen', bullets: acc.amenities },
    {
      heading: isHouse ? 'Prijzen 2027 per verblijf' : 'Prijzen 2027 per nacht',
      paragraphs: isHouse
        ? [
            `Een weekend is van vrijdag tot maandag, een midweek van maandag tot vrijdag en een week van vrijdag tot vrijdag of maandag tot maandag. ${acc.slug === 'groepsaccommodatie' ? 'De Hoeve kun je ook in het hoogseizoen per weekend of midweek boeken.' : 'In het hoogseizoen verhuren we alleen hele weken met aankomst op vrijdag. Weekenden en midweken in het hoogseizoen zijn pas boekbaar vanaf 14 dagen voor aankomst, als er nog plek is.'}`,
          ]
        : [
            'De prijs geldt per nacht voor 2 personen, inclusief stroom, water, warme douches en één auto.',
          ],
      table: isHouse ? stayPriceTable(acc) : nightPriceTable(acc),
    },
    { heading: 'Bijkomende kosten', bullets: costBullets },
    { heading: 'Huisdieren', paragraphs: [acc.pets.note] },
    { heading: 'Goed om te weten', bullets: acc.notes },
  ];

  return {
    slug: `accommodaties/${acc.slug}`,
    path: pathFor(`accommodaties/${acc.slug}`),
    navLabel: acc.name,
    title: acc.name,
    intro: acc.tagline,
    sections,
    group: 'verblijf',
    scene: acc.scene,
    description: `${acc.name} bij Vakantiepark De Duinhoeve: ${acc.tagline}`,
    accommodationSlug: acc.slug,
  };
}

// ---------------------------------------------------------------------------
// Pagina's
// ---------------------------------------------------------------------------

function makePage(p: Omit<SitePage, 'path'>): SitePage {
  return { ...p, path: pathFor(p.slug) };
}

const HOUSES = ACCOMMODATIONS.filter((a) => a.kind === 'huis');
const PITCHES = ACCOMMODATIONS.filter((a) => a.kind === 'kamperen');

const HOME = makePage({
  slug: '',
  navLabel: 'Home',
  title: `Vakantie tussen duin en zee in Zeeland`,
  intro: `Vakantiepark De Duinhoeve is een familiepark van ${COMPANY.hectares} hectare in de duinen bij Westerduin, op 400 meter van het strand. Sinds ${COMPANY.founded} ontvangen we gezinnen, stellen, groepen en kampeerders in strandhuisjes, lodges, safaritenten en op ruime kampeerplaatsen. Met een overdekt zwembad, een eigen strandpaviljoen en een animatieteam dat in elke schoolvakantie klaarstaat.`,
  group: 'over',
  scene: 'duinen',
  description: `Familiepark in de Zeeuwse duinen bij Westerduin, op 400 meter van het strand. Strandhuisjes, lodges, glamping en kamperen.`,
  sections: [
    {
      heading: `Waarom gasten voor De Duinhoeve kiezen`,
      bullets: [
        `Het strand ligt op 400 meter, je loopt er in vijf minuten via het duinpad naartoe`,
        `Overdekt zwembad De Golfslag met een glijbaan van 42 meter, gratis voor gasten`,
        `Strandpaviljoen Zilt en restaurant De Duinpan, allebei van het park zelf`,
        `Animatieteam Helmgras met een kinderclub in alle schoolvakanties`,
        `Autoluw park: auto's staan op de parkeerplaatsen, kinderen spelen veilig buiten`,
        `Familiebedrijf sinds ${COMPANY.founded}, nu in handen van de tweede generatie`,
      ],
    },
    {
      heading: `Overnachten op De Duinhoeve`,
      paragraphs: [
        `We hebben ${HOUSES.reduce((n, a) => n + a.units, 0)} accommodaties en ${PITCHES.reduce((n, a) => n + a.units, 0)} kampeerplaatsen. Van het tiny house voor twee personen tot de groepsaccommodatie De Hoeve voor zestien personen. Alle accommodaties hebben gratis wifi, en in de meeste zijn honden welkom.`,
        `Een week in een strandhuisje voor vier personen boek je in het laagseizoen al vanaf ${euro(595)}. Een kampeerplaats kost vanaf ${euro(24.5)} per nacht voor twee personen. Op de pagina Prijzen en seizoenen vind je alle tarieven voor 2027.`,
      ],
    },
    {
      heading: `Wat gasten zeggen`,
      paragraphs: [
        `Gasten geven ons gemiddeld een 8,9 uit 1.214 beoordelingen in 2026 (eigen gastenenquête).`,
      ],
      quotes: [
        {
          text: `We zaten in een Duinlodge met zeezicht en hebben elke avond op het terras de zon in zee zien zakken. De kinderen waren niet weg te slaan bij de kinderboerderij.`,
          author: `Familie Hendriks uit Amersfoort, augustus 2026`,
        },
        {
          text: `Het Boshuis is echt goed doordacht. Mijn zoon zit in een rolstoel en kon overal zelf komen, ook in de badkamer. Dat hebben we nog niet vaak meegemaakt.`,
          author: `Marieke uit Tilburg, mei 2026`,
        },
        {
          text: `Met twee honden een week in het strandhuisje. Het hondenstrand ligt om de hoek en bij Zilt stond gewoon een waterbak klaar.`,
          author: `Peter en Anouk uit Arnhem, oktober 2026`,
        },
        {
          text: `De broodjesservice is een aanrader. Om acht uur verse croissants aan de deur en dan rustig ontbijten in de safaritent.`,
          author: `Sanne uit Den Haag, juli 2026`,
        },
      ],
    },
    {
      heading: `Nieuws van het park`,
      bullets: [
        `Nieuw in 2027: twee padelbanen naast de tennisbanen, te reserveren via de receptie`,
        `Restaurant De Duinpan is van 4 t/m 29 januari 2027 gesloten voor een verbouwing`,
        `Het zwembad is van 29 november t/m 10 december 2026 gesloten voor groot onderhoud`,
        `Boek je zomerweek 2027 vóór 1 februari 2027 en krijg 10% vroegboekkorting`,
      ],
    },
  ],
});

const ACCOMMODATIONS_OVERVIEW = makePage({
  slug: 'accommodaties',
  navLabel: 'Accommodaties',
  title: `Onze accommodaties`,
  intro: `Kies uit zes soorten vakantiehuizen en twee soorten kampeerplaatsen. Alle accommodaties liggen binnen 900 meter van het strand en hebben gratis wifi.`,
  group: 'verblijf',
  scene: 'lodge',
  description: `Overzicht van alle accommodaties en kampeerplaatsen op Vakantiepark De Duinhoeve.`,
  sections: [
    {
      heading: `Vakantiehuizen`,
      paragraphs: [
        `Onze vakantiehuizen huur je per weekend, midweek of week. In het hoogseizoen verhuren we de huizen alleen per week, met aankomst op vrijdag. Uitzondering is De Hoeve, die je het hele jaar per weekend of midweek kunt boeken.`,
      ],
      table: {
        columns: ['Accommodatie', 'Personen', 'Slaapkamers', 'Huisdieren', 'Week vanaf'],
        rows: HOUSES.map((a) => [
          a.name,
          `max. ${a.persons}`,
          String(a.bedrooms),
          a.pets.allowed ? `ja, max. ${a.pets.max}` : 'nee',
          euro(fromPrice(a).amount),
        ]),
      },
    },
    {
      heading: `Kampeerplaatsen`,
      paragraphs: [
        `Kamperen kan van 26 maart t/m 29 oktober 2027. Tien comfortplaatsen zijn het hele jaar open voor winterkamperen. De prijs per nacht is voor twee personen inclusief stroom, water en warme douches.`,
      ],
      table: {
        columns: ['Kampeerplaats', 'Grootte', 'Stroom', 'Auto op de plaats', 'Per nacht vanaf'],
        rows: [
          ['Kampeerplaats Comfort', 'circa 120 m²', '10 ampère', 'ja', euro(26.5)],
          ['Kampeerplaats Standaard', 'circa 90 m²', '6 ampère', 'nee, op P2', euro(24.5)],
        ],
      },
    },
    {
      heading: `Welke accommodatie past bij jou?`,
      bullets: [
        `Met z'n tweeën: het tiny house, met een slaapvide onder het dakraam en linnen inbegrepen`,
        `Gezin met jonge kinderen: het strandhuisje, het dichtst bij zee`,
        `Gezin met honden: de Duinlodge, met een volledig omheinde tuin`,
        `Iemand die rolstoel gebruikt: het Boshuis, volledig drempelvrij met aangepaste badkamer`,
        `Avontuurlijk maar comfortabel: de glamping safaritent`,
        `Familieweekend of teamuitje: groepsaccommodatie De Hoeve voor 16 personen`,
        `Eigen caravan, camper of tent: een kampeerplaats Comfort of Standaard`,
      ],
    },
    {
      heading: `Wat is overal inbegrepen?`,
      bullets: [
        `Gratis wifi`,
        `Gratis toegang tot zwembad De Golfslag`,
        `Deelname aan het animatieprogramma (sommige workshops tegen een kleine bijdrage)`,
        `Eén auto per accommodatie of kampeerplaats`,
        `Gebruik van speeltuin, kinderboerderij, multisportveld en jeu-de-boulesbaan`,
      ],
    },
  ],
});

const PRICES = makePage({
  slug: 'prijzen',
  navLabel: 'Prijzen',
  title: `Prijzen en seizoenen 2027`,
  intro: `Hier vind je alle tarieven voor 2027, wanneer welk seizoen geldt en welke bijkomende kosten je kunt verwachten. Zo weet je vooraf precies waar je aan toe bent.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Tarieven 2027 voor alle accommodaties en kampeerplaatsen, seizoenen en bijkomende kosten.`,
  sections: [
    {
      heading: `Seizoenen 2027`,
      table: {
        columns: ['Seizoen', 'Periode'],
        rows: (['laag', 'midden', 'hoog'] as SeasonKey[]).map((k) => [SEASONS[k].label, SEASONS[k].periods]),
      },
      paragraphs: [
        `Tijdens Hemelvaart (6 t/m 9 mei 2027) en Pinksteren (14 t/m 17 mei 2027) geldt voor weekenden en midweken het hoogseizoentarief. Met Pasen (26 t/m 29 maart 2027) en Koningsdag (27 april 2027) geldt gewoon het middenseizoentarief.`,
      ],
    },
    {
      heading: `Vakantiehuizen per week`,
      paragraphs: [`Prijzen per accommodatie per week (7 nachten), exclusief bijkomende kosten.`],
      table: {
        columns: ['Accommodatie', 'Laagseizoen', 'Middenseizoen', 'Hoogseizoen'],
        rows: HOUSES.map((a) => [
          `${a.name} (${a.persons}p)`,
          a.stayPrices?.laag ? euro(a.stayPrices.laag.week) : 'Gesloten',
          a.stayPrices?.midden ? euro(a.stayPrices.midden.week) : 'Gesloten',
          a.stayPrices?.hoog ? euro(a.stayPrices.hoog.week) : 'Gesloten',
        ]),
      },
    },
    {
      heading: `Vakantiehuizen per weekend en midweek`,
      paragraphs: [
        `Een weekend is van vrijdag 15:00 uur tot maandag 10:00 uur (3 nachten). Een midweek is van maandag 15:00 uur tot vrijdag 10:00 uur (4 nachten). In het hoogseizoen zijn weekenden en midweken pas boekbaar vanaf 14 dagen voor aankomst, behalve bij De Hoeve.`,
      ],
      table: {
        columns: ['Accommodatie', 'Weekend laag / midden / hoog', 'Midweek laag / midden / hoog'],
        rows: HOUSES.map((a) => {
          const fmt = (k: SeasonKey, f: keyof StayPrices) => (a.stayPrices?.[k] ? euro(a.stayPrices[k]![f]) : 'gesloten');
          return [
            a.name,
            `${fmt('laag', 'weekend')} / ${fmt('midden', 'weekend')} / ${fmt('hoog', 'weekend')}`,
            `${fmt('laag', 'midweek')} / ${fmt('midden', 'midweek')} / ${fmt('hoog', 'midweek')}`,
          ];
        }),
      },
    },
    {
      heading: `Kortverblijf in het laagseizoen`,
      paragraphs: [
        `In het laagseizoen kun je de strandhuisjes, Duinlodges en tiny houses ook voor 2 nachten boeken (vrijdag tot zondag of zondag tot dinsdag). Je betaalt dan 85% van de weekendprijs. Een extra nacht aan een weekend of midweek vastplakken kan in het laag- en middenseizoen voor 30% van de weekendprijs per nacht, als de accommodatie vrij is.`,
      ],
    },
    {
      heading: `Kampeerplaatsen per nacht`,
      paragraphs: [
        `Prijs per nacht voor 2 personen, inclusief stroom, water, warme douches en één auto. Minimaal 2 nachten, in het hoogseizoen minimaal 5 nachten.`,
      ],
      table: {
        columns: ['Kampeerplaats', 'Laagseizoen', 'Middenseizoen', 'Hoogseizoen'],
        rows: PITCHES.map((a) => [
          a.name,
          a.nightPrices?.laag ? `${euro(a.nightPrices.laag)} (alleen winterkamperen)` : 'Gesloten',
          a.nightPrices?.midden ? euro(a.nightPrices.midden) : 'Gesloten',
          a.nightPrices?.hoog ? euro(a.nightPrices.hoog) : 'Gesloten',
        ]),
      },
    },
    {
      heading: `Bijkomende kosten`,
      table: {
        columns: ['Wat', 'Prijs', 'Toelichting'],
        rows: [
          ['Reserveringskosten', euro(FEES.bookingFee), 'Per boeking, ook bij kamperen'],
          ['Toeristenbelasting', euro(FEES.touristTax), 'Per persoon per nacht, kinderen t/m 3 jaar gratis (Gemeente Westerduin, 2027)'],
          ['Eindschoonmaak', `${euro(55)} tot ${euro(295)}`, 'Verplicht bij alle vakantiehuizen, bedrag per accommodatie zie hieronder'],
          ['Linnenpakket', euro(FEES.linenPerPerson), 'Per persoon: opgemaakte bedden, badhanddoek, handdoek en theedoek. Inbegrepen bij het tiny house'],
          ['Extra handdoekenset', euro(FEES.extraTowels), 'Per set, te bestellen bij de receptie'],
          ['Babypakket', euro(FEES.babyPack), 'Per verblijf: campingbedje met matras, kinderstoel en badje'],
          ['Huisdier in accommodatie', euro(FEES.petPerNight), 'Per huisdier per nacht'],
          ['Huisdier op kampeerplaats', euro(FEES.petPerNightCamping), 'Per huisdier per nacht'],
          ['Extra persoon kamperen', euro(FEES.extraPersonCamping), 'Per nacht, vanaf 12 jaar'],
          ['Extra kind kamperen', euro(FEES.extraChildCamping), 'Per nacht, 2 t/m 11 jaar'],
          ['Extra auto', euro(FEES.extraCar), 'Per dag'],
          ['Dagbezoeker', euro(FEES.dayVisitor), 'Per persoon per dag, kinderen t/m 3 jaar gratis'],
          ['Late check-in na 22:00 uur', euro(FEES.lateArrivalAfter22), 'Via de sleutelkluis'],
          ['Late check-out tot 14:00 uur', euro(FEES.lateCheckout), 'Op aanvraag, alleen als de accommodatie niet dezelfde dag weer verhuurd is'],
          ['Annuleringsverzekering', FEES.cancelInsurancePct, `Van de reissom, plus ${euro(FEES.policyCosts)} poliskosten`],
        ],
      },
    },
    {
      heading: `Schoonmaakkosten en borg per accommodatie`,
      table: {
        columns: ['Accommodatie', 'Eindschoonmaak', 'Borg'],
        rows: ACCOMMODATIONS.map((a) => [
          a.name,
          a.cleaningFee > 0 ? euro(a.cleaningFee) : 'Niet van toepassing',
          a.kind === 'kamperen' ? `${euro(a.deposit)} (slagboompas)` : euro(a.deposit),
        ]),
      },
      paragraphs: [
        `De borg betaal je bij aankomst met je pinpas of creditcard. Binnen 7 werkdagen na vertrek storten we de borg terug, min eventuele kosten voor schade of extra schoonmaak. De verplichte eindschoonmaak betekent niet dat je niets hoeft te doen: we vragen je de vaat te doen, de koelkast leeg te maken en het afval weg te brengen.`,
      ],
    },
    {
      heading: `Rekenvoorbeeld`,
      paragraphs: [
        `Je boekt met vier personen een week in een Duinlodge in het middenseizoen en neemt vier linnenpakketten. Dan betaal je ${euro(1095)} huur, ${euro(95)} eindschoonmaak, ${euro(50)} voor de linnenpakketten, ${euro(58.8)} toeristenbelasting (4 personen x 7 nachten x ${euro(FEES.touristTax)}) en ${euro(17.5)} reserveringskosten. Samen is dat ${euro(1316.3)}. De borg van ${euro(200)} komt daar tijdelijk bij en krijg je terug.`,
      ],
    },
  ],
});

const BOOKING = makePage({
  slug: 'boeken-en-betalen',
  navLabel: 'Boeken en betalen',
  title: `Boeken en betalen`,
  intro: `Je boekt het makkelijkst online, maar bellen of mailen mag natuurlijk ook. Hieronder lees je hoe het boeken werkt, wanneer je wat betaalt en hoe je je boeking wijzigt.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Zo boek je bij De Duinhoeve: aanbetaling, restbetaling, betaalmethoden en wijzigen.`,
  sections: [
    {
      heading: `Zo boek je`,
      bullets: [
        `Online via de knop Boek nu, 24 uur per dag. Je ziet direct wat er vrij is en je krijgt meteen een bevestiging per e-mail.`,
        `Telefonisch via ${COMPANY.phone} tijdens de openingstijden van de receptie.`,
        `Per e-mail via ${COMPANY.email}. We reageren binnen één werkdag met een voorstel. Pas als je dat voorstel bevestigt, is de boeking definitief.`,
        `Groepen vanaf 20 personen en bedrijven boeken via ${COMPANY.groupsEmail}.`,
      ],
      paragraphs: [
        `De hoofdboeker moet minimaal 21 jaar oud zijn en zelf tijdens het verblijf aanwezig zijn. Een specifiek huisnummer of kampeerplaats kun je aanvragen voor ${euro(19.5)} per boeking. We doen ons best, maar kunnen het niet garanderen tot het moment van bevestiging.`,
      ],
    },
    {
      heading: `Aanbetaling en restbetaling`,
      bullets: [
        `Binnen 7 dagen na het boeken betaal je een aanbetaling van 30% van de reissom.`,
        `Het restbedrag betaal je uiterlijk 6 weken voor aankomst.`,
        `Boek je binnen 6 weken voor aankomst, dan betaal je het hele bedrag direct.`,
        `De toeristenbelasting zit in de reissom en betaal je dus vooraf.`,
        `De borg betaal je bij aankomst, met pinpas of creditcard.`,
      ],
      paragraphs: [
        `Je ontvangt de factuur en een betaallink per e-mail. Heb je 14 dagen na de vervaldatum nog niet betaald, dan sturen we een herinnering. Blijft betaling daarna uit, dan mogen we de boeking annuleren en gelden de annuleringskosten.`,
      ],
    },
    {
      heading: `Betaalmethoden`,
      bullets: [
        `iDEAL`,
        `Creditcard (Visa en Mastercard, geen American Express)`,
        `Bankoverschrijving (vermeld je boekingsnummer)`,
        `Bij de receptie: pinpas, creditcard of contant`,
      ],
      paragraphs: [
        `Op het hele park, dus ook in het restaurant, het strandpaviljoen en de winkel, kun je pinnen en contactloos betalen. Contant betalen kan alleen bij de receptie en in Het Winkeltje.`,
      ],
    },
    {
      heading: `Wijzigen en omboeken`,
      paragraphs: [
        `Wil je je boeking wijzigen, bijvoorbeeld een andere datum of een andere accommodatie? Tot 8 weken voor aankomst kun je één keer kosteloos omboeken naar een andere periode in hetzelfde kalenderjaar, als er plek is. Daarna rekenen we ${euro(FEES.rebooking)} wijzigingskosten per wijziging. Zit de nieuwe periode in een duurder seizoen, dan betaal je het verschil bij. Is het goedkoper, dan krijg je het verschil niet terug.`,
        `Personen toevoegen kan altijd, zolang het maximum van de accommodatie niet wordt overschreden. Personen afmelden geldt als gedeeltelijke annulering; daarover lees je meer op de pagina Annuleren.`,
      ],
    },
    {
      heading: `Cadeaubonnen`,
      paragraphs: [
        `Een Duinhoeve-cadeaubon is te koop vanaf ${euro(25)} en is 2 jaar geldig. Je kunt hem gebruiken voor een verblijf, in het restaurant, het strandpaviljoen of bij de wellness. Bestellen gaat via de receptie of per e-mail. Het bedrag kan in delen worden gebruikt.`,
      ],
    },
  ],
});

const CANCELLATION = makePage({
  slug: 'annuleren',
  navLabel: 'Annuleren',
  title: `Annuleren en annuleringsverzekering`,
  intro: `Soms gaat een vakantie niet door. Hier lees je wat annuleren kost, hoe je het doet en waarom een annuleringsverzekering verstandig kan zijn.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Annuleringskosten, annuleringsverzekering en hoe je je boeking annuleert bij De Duinhoeve.`,
  sections: [
    {
      heading: `Annuleringskosten`,
      paragraphs: [
        `Annuleer je je boeking, dan rekenen we annuleringskosten. Hoe dichter bij de aankomstdatum, hoe hoger de kosten. De kosten zijn een percentage van de reissom (huur plus alle bijkomende kosten, behalve toeristenbelasting, die krijg je altijd terug).`,
      ],
      table: {
        columns: ['Moment van annuleren', 'Annuleringskosten'],
        rows: [
          ['Tot 3 maanden voor aankomst', '15% van de reissom'],
          ['Tussen 3 maanden en 1 maand voor aankomst', '50% van de reissom'],
          ['Tussen 1 maand en 1 dag voor aankomst', '90% van de reissom'],
          ['Op de dag van aankomst of later', '100% van de reissom'],
        ],
      },
    },
    {
      heading: `Zo annuleer je`,
      bullets: [
        `Stuur een e-mail naar ${COMPANY.email} met je boekingsnummer en de naam van de hoofdboeker.`,
        `Annuleren kan ook telefonisch, maar is pas geldig als we het per e-mail hebben bevestigd.`,
        `De datum waarop wij je e-mail ontvangen, telt als annuleringsdatum.`,
        `Heb je al meer betaald dan de annuleringskosten, dan storten we het verschil binnen 14 dagen terug.`,
      ],
    },
    {
      heading: `Gedeeltelijk annuleren en eerder vertrekken`,
      paragraphs: [
        `Meld je één of meer personen af, maar komt de rest wel? Dan rekenen we voor de huur geen korting, maar je krijgt de toeristenbelasting en de linnenpakketten van die personen terug. Vertrek je eerder dan gepland, dan is er geen recht op teruggave van de huur. Bij kamperen betaal je de nachten die je niet blijft voor 50%, als je het minimaal 24 uur van tevoren bij de receptie meldt.`,
      ],
    },
    {
      heading: `Annuleringsverzekering`,
      paragraphs: [
        `Je kunt bij het boeken een annuleringsverzekering afsluiten via onze verzekeringspartner Kustzeker (fictief). De premie is ${FEES.cancelInsurancePct} van de reissom, plus ${euro(FEES.policyCosts)} poliskosten per boeking. De verzekering moet je bij het boeken of uiterlijk 7 dagen daarna afsluiten.`,
        `De verzekering vergoedt de annuleringskosten bij onder meer ernstige ziekte, een ongeval of overlijden van jou, een reisgenoot of een familielid in de eerste of tweede graad, bij ernstige schade aan je huis, bij onvrijwillige werkloosheid en bij een nieuwe baan. Ook als je door een gedekte reden eerder naar huis moet, krijg je de niet gebruikte dagen vergoed.`,
        `Een coronabesmetting zonder ernstige ziekte, slecht weer of het simpelweg geen zin meer hebben, valt niet onder de dekking. Lees altijd de polisvoorwaarden die je bij de bevestiging ontvangt. Een schade meld je rechtstreeks bij Kustzeker, niet bij ons.`,
      ],
    },
    {
      heading: `Annuleren door het park`,
      paragraphs: [
        `Moeten wij jouw boeking annuleren, bijvoorbeeld omdat de accommodatie door een calamiteit niet bruikbaar is, dan bieden we je een vergelijkbare accommodatie aan of krijg je het volledige bedrag terug. Sluiten we het park op last van de overheid, dan mag je kosteloos omboeken binnen 12 maanden of krijg je een tegoedbon.`,
      ],
    },
  ],
});

const ARRIVAL = makePage({
  slug: 'aankomst-en-vertrek',
  navLabel: 'Aankomst en vertrek',
  title: `Aankomst en vertrek`,
  intro: `Alles over inchecken, uitchecken, de sleutel, de slagboom en wat je moet doen als je later aankomt.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Aankomst- en vertrektijden, late check-in, late check-out en de slagboom bij De Duinhoeve.`,
  sections: [
    {
      heading: `Tijden`,
      table: {
        columns: ['', 'Vakantiehuizen', 'Kampeerplaatsen'],
        rows: [
          ['Aankomst', 'Vanaf 15:00 uur', 'Vanaf 13:00 uur'],
          ['Vertrek', 'Voor 10:00 uur', 'Voor 12:00 uur'],
          ['Aankomstdagen', 'Vrijdag (weekend en week) of maandag (midweek en week)', 'Elke dag'],
        ],
      },
      paragraphs: [
        `Kom je eerder aan? Je bent vanaf 10:00 uur welkom om het zwembad, het restaurant en het strand te gebruiken. Je auto kun je dan alvast op P1 parkeren. De accommodatie is pas om 15:00 uur klaar, ook als hij eerder schoon is: we controleren elk huis voordat we de sleutel vrijgeven.`,
      ],
    },
    {
      heading: `Inchecken`,
      bullets: [
        `Op de aankomstdag ontvang je om 12:00 uur een sms met je huisnummer of plaatsnummer.`,
        `Meld je bij de receptie. Neem een geldig legitimatiebewijs mee van de hoofdboeker.`,
        `Je krijgt de sleutelpas (die ook de slagboom opent), een plattegrond en de polsbandjes voor het zwembad.`,
        `De borg wordt bij het inchecken afgerekend met pinpas of creditcard.`,
        `Op vrijdagen in het hoogseizoen kan het tussen 15:00 en 17:00 uur druk zijn. Online inchecken via de link in je bevestigingsmail scheelt wachttijd: je haalt dan alleen je sleutelpas op bij de snelbalie.`,
      ],
    },
    {
      heading: `Later aankomen`,
      paragraphs: [
        `Kom je na sluitingstijd van de receptie aan? Laat het ons vóór 16:00 uur op de aankomstdag weten, telefonisch of via WhatsApp. Tot 22:00 uur staat er dan iemand van de avonddienst klaar bij de receptie, zonder extra kosten. Na 22:00 uur haal je je sleutelpas uit de sleutelkluis naast de receptie met een code die we je sturen. Hiervoor rekenen we ${euro(FEES.lateArrivalAfter22)}. Na 23:00 uur is de slagboom dicht voor auto's; je parkeert dan op de nachtparkeerplaats voor de slagboom en loopt naar je accommodatie.`,
      ],
    },
    {
      heading: `Vertrekken`,
      bullets: [
        `Lever de sleutelpas in bij de receptie of gooi hem in de brievenbus naast de deur.`,
        `Laat de accommodatie netjes achter: vaat gedaan, koelkast leeg, afval naar de containers bij de parkeerplaats.`,
        `Gebruikt linnengoed laat je in de hoes op het bed liggen.`,
        `Late check-out tot 14:00 uur kost ${euro(FEES.lateCheckout)} en kan alleen als de accommodatie die dag niet opnieuw verhuurd is. Vraag het uiterlijk de dag voor vertrek bij de receptie.`,
        `Na het uitchecken mag je tot 18:00 uur op het park blijven en gebruikmaken van het zwembad.`,
      ],
    },
    {
      heading: `Slagboom en verkeer op het park`,
      paragraphs: [
        `De slagboom gaat open met je sleutelpas. Tussen 23:00 en 07:00 uur is de slagboom dicht voor alle auto's, ook voor gasten. Op het park rijd je stapvoets (maximaal 5 km per uur). De velden De Vlinderweide en het strandhuisjesveld De Zeereep zijn autovrij; je mag er alleen in- en uitladen tussen 15:00 en 16:00 uur op de aankomstdag en voor 10:00 uur op de vertrekdag.`,
      ],
    },
  ],
});

const PETS = makePage({
  slug: 'huisdieren',
  navLabel: 'Huisdieren',
  title: `Op vakantie met je hond`,
  intro: `Honden zijn welkom op De Duinhoeve. In de meeste accommodaties en op alle kampeerplaatsen mag je huisdier mee. Wel hebben we een paar afspraken, zodat iedereen een fijne vakantie heeft.`,
  group: 'praktisch',
  scene: 'strand',
  description: `Welke accommodaties hondvriendelijk zijn, wat het kost en de regels voor huisdieren op het park en het strand.`,
  sections: [
    {
      heading: `Waar mag je huisdier mee?`,
      table: {
        columns: ['Accommodatie', 'Huisdier toegestaan', 'Maximaal', 'Kosten'],
        rows: ACCOMMODATIONS.map((a) => [
          a.name,
          a.pets.allowed ? (a.slug === 'strandhuisje' ? 'Ja, in 12 van de 24 huisjes' : 'Ja') : 'Nee',
          a.pets.allowed ? String(a.pets.max) : '-',
          a.pets.allowed
            ? `${euro(a.kind === 'kamperen' ? FEES.petPerNightCamping : FEES.petPerNight)} per nacht`
            : '-',
        ]),
      },
      paragraphs: [
        `We ontvangen alleen honden en katten. Voor andere huisdieren, zoals een konijn in een kooi, kun je contact opnemen met de receptie. Erkende assistentiehonden zijn in elke accommodatie welkom, ook in het Boshuis en de safaritent, en daarvoor betaal je niets.`,
        `Meld je huisdier altijd aan bij het boeken. Neem je een huisdier mee zonder het te melden, dan rekenen we de dubbele prijs per nacht plus ${euro(75)} extra schoonmaakkosten.`,
      ],
    },
    {
      heading: `Regels op het park`,
      bullets: [
        `Honden zijn op het hele park aangelijnd, ook op je eigen terras als dat niet omheind is.`,
        `Ruim poep altijd op. Poepzakjes zijn gratis bij de receptie en bij de hondenuitlaatpalen.`,
        `Laat je hond uit in de hondenuitlaatzone achter parkeerplaats P2 of buiten het park.`,
        `Honden mogen niet in het zwembad, de wellness, de speeltuin, de kinderboerderij, Het Winkeltje en het sanitairgebouw.`,
        `Honden mogen niet op bedden en banken. Neem je eigen mand of kleed mee.`,
        `Laat je hond niet langer dan 2 uur alleen in de accommodatie, en alleen als hij daar rustig blijft.`,
        `Je hond moet ingeënt zijn en vrij van vlooien. Een geldig vaccinatieboekje kan gevraagd worden.`,
      ],
    },
    {
      heading: `Honden in het restaurant en strandpaviljoen`,
      paragraphs: [
        `In restaurant De Duinpan zijn honden welkom op het terras en in de serre, niet in het hoofdrestaurant. Bij strandpaviljoen Zilt mogen aangelijnde honden overal mee naar binnen. Er staan waterbakken en er is een hondensnack voor ${euro(1.5)}.`,
      ],
    },
    {
      heading: `Honden op het strand`,
      paragraphs: [
        `Op het hoofdstrand van Westerduin, bij strandpaviljoen Zilt, zijn honden van 1 mei tot en met 30 september niet welkom tussen 10:00 en 19:00 uur. Buiten die tijden en buiten die periode mogen ze er aangelijnd lopen.`,
        `Het hondenstrand bij strandpaal Noord 7 ligt op 1,2 kilometer lopen van het park. Daar mag je hond het hele jaar loslopen, ook in de zomer. Een makkelijke route ernaartoe is het duinpad richting zee en dan rechtsaf langs de vloedlijn.`,
        `In het duingebied van Stichting Westerduinen (fictief) moeten honden altijd aangelijnd zijn, vanwege broedende vogels en grazende Schotse hooglanders.`,
      ],
    },
    {
      heading: `Dierenarts in de buurt`,
      paragraphs: [
        `Dierenkliniek Westerduin (fictief) zit aan de Dorpsstraat in Westerduin, op 1,8 kilometer. Ze zijn op werkdagen open van 08:30 tot 17:30 uur en hebben een spoednummer dat je bij de receptie kunt opvragen.`,
      ],
    },
  ],
});

const FACILITIES = makePage({
  slug: 'faciliteiten',
  navLabel: 'Faciliteiten',
  title: `Faciliteiten op het park`,
  intro: `Van fietsverhuur tot laadpalen en van de wasserette tot de kinderboerderij: dit vind je allemaal op De Duinhoeve. Voor het zwembad en de wellness hebben we een aparte pagina.`,
  group: 'park',
  scene: 'duinen',
  description: `Fietsverhuur, laadpalen, wifi, wasserette, winkel, speeltuin en sport op Vakantiepark De Duinhoeve.`,
  sections: [
    {
      heading: `Fietsverhuur`,
      paragraphs: [
        `Zeeland ontdek je het best op de fiets. Bij Fietsverhuur De Duinhoeve, naast de receptie, huur je fietsen voor het hele gezin. De verhuur is open van 09:00 tot 17:30 uur, in het laagseizoen alleen op vrijdag, zaterdag en zondag. In het hoogseizoen raden we aan om je fietsen vooraf te reserveren via de receptie of bij het boeken. Een helm leen je gratis.`,
      ],
      table: {
        columns: ['Fiets', 'Per dag', 'Per week'],
        rows: [
          ['Stadsfiets (met versnellingen)', euro(11), euro(55)],
          ['Elektrische fiets', euro(27.5), euro(135)],
          ['Kinderfiets (16 t/m 26 inch)', euro(7.5), euro(37.5)],
          ['Bakfiets (elektrisch, 2 kinderen)', euro(35), euro(165)],
          ['Tandem', euro(22.5), euro(110)],
          ['Kinderzitje of fietskar', euro(4), euro(20)],
        ],
      },
    },
    {
      heading: `Elektrisch laden`,
      paragraphs: [
        `Op parkeerplaats P1 staan 12 laadpunten van 22 kW. Laden kost ${euro(FEES.evPerKwh)} per kWh, zonder starttarief. Je betaalt met een laadpas of via de QR-code op de paal met iDEAL of creditcard. Haal je auto weg als hij vol is, zodat een ander ook kan laden; na 4 uur aan de paal rekenen we ${euro(0.1)} per minuut blokkeertarief. Het Boshuis heeft een eigen laadpunt voor een scootmobiel.`,
        `Je auto opladen bij je accommodatie of kampeerplaats is niet toegestaan, ook niet met een gewone stekker of een verlengsnoer. De bekabeling is daar niet op berekend.`,
      ],
    },
    {
      heading: `Wifi`,
      paragraphs: [
        `Op het hele park heb je gratis wifi via het netwerk Duinhoeve-Gast. Het wachtwoord staat op je sleutelpas. De snelheid is ongeveer 50 Mbit per seconde per accommodatie, genoeg om te streamen en te videobellen. Moet je echt werken? In de bibliotheek naast de receptie staan vier werkplekken met glasvezel en een printer (${euro(0.25)} per pagina).`,
      ],
    },
    {
      heading: `Wasserette`,
      paragraphs: [
        `De wasserette zit in sanitairgebouw De Duinpieper en is dagelijks open van 08:00 tot 22:00 uur. Er staan vier wasmachines en drie drogers. Een wasbeurt kost ${euro(FEES.washer)} inclusief wasmiddel, een droger ${euro(FEES.dryer)} per 45 minuten. Je betaalt met je pinpas aan de automaat. Een strijkplank en strijkijzer zijn gratis te gebruiken.`,
      ],
    },
    {
      heading: `Het Winkeltje en de broodjesservice`,
      paragraphs: [
        `In Het Winkeltje naast de receptie koop je de dagelijkse boodschappen, verse broodjes, streekproducten, strandspeelgoed, gasflessen en kranten. Openingstijden: dagelijks 08:00 tot 18:00 uur, in het hoogseizoen tot 20:00 uur. In januari is Het Winkeltje alleen in het weekend open.`,
        `Met de broodjesservice heb je elke ochtend vers brood. Bestel uiterlijk om 18:00 uur de dag ervoor via de receptie of het bestelformulier in je accommodatie. Ophalen kan tussen 08:00 en 10:00 uur in Het Winkeltje. Bezorging aan de deur tussen 08:00 en 09:00 uur kost ${euro(1.5)} per bestelling.`,
      ],
      table: {
        columns: ['Product', 'Prijs'],
        rows: [
          ['Wit of bruin stokbrood', euro(2.25)],
          ['Zeeuws volkorenbrood (heel)', euro(3.95)],
          ['Croissant', euro(1.35)],
          ['Krentenbol', euro(0.95)],
          ['Witte of bruine bol', euro(0.6)],
          ['Zeeuwse bolus', euro(2.1)],
          ['Glutenvrij brood (6 sneetjes, op bestelling)', euro(4.5)],
        ],
      },
    },
    {
      heading: `Ontbijtservice`,
      paragraphs: [
        `Liever helemaal niets doen? Bestel een ontbijtmand. Daarin zitten brood en croissants, beleg, eitjes, yoghurt met granola, vers sinaasappelsap en koffie of thee. Een ontbijtmand kost ${euro(FEES.breakfastAdult)} per volwassene en ${euro(FEES.breakfastChild)} per kind van 4 t/m 11 jaar. Kinderen tot 4 jaar eten gratis mee. We bezorgen de mand tussen 08:00 en 09:30 uur. Bestellen kan tot 18:00 uur de dag ervoor. Een vegetarische, veganistische of glutenvrije mand is mogelijk.`,
      ],
    },
    {
      heading: `Spelen en sporten`,
      bullets: [
        `Grote speeltuin De Duinvallei met een piratenschip, kabelbaan en een aparte peuterhoek, dagelijks open van 08:00 tot 21:00 uur`,
        `Overdekte speelschuur De Schuur met klimtoestel, ballenbak en een hoek voor kinderen tot 4 jaar, dagelijks van 09:00 tot 19:00 uur`,
        `Kinderboerderij met geiten, kippen, konijnen en twee ezels. Samen voeren om 10:30 en 16:00 uur`,
        `Twee gravel-tennisbanen, ${euro(10)} per uur, rackets te leen bij de receptie`,
        `Twee padelbanen (nieuw in 2027), ${euro(20)} per uur per baan, inclusief rackets en ballen`,
        `Multisportveld voor voetbal en basketbal, gratis`,
        `Jeu-de-boulesbaan bij restaurant De Duinpan, ballen te leen`,
        `Midgetgolfbaan met 18 holes, ${euro(4.5)} per persoon, open van april tot en met oktober`,
      ],
    },
    {
      heading: `Overige voorzieningen`,
      bullets: [
        `Afvalstraat bij P1 en P2 voor restafval, plastic, glas, papier, gft en statiegeldflessen`,
        `AED bij de receptie, in het zwembad en bij strandpaviljoen Zilt`,
        `Gratis kluisjes in het zwembad (met je sleutelpas)`,
        `Bolderkarren te leen bij P1 en P2`,
        `Fietsenstalling en fietsreparatieset bij de fietsverhuur`,
        `Pakketpunt bij de receptie: je kunt pakketjes laten bezorgen op het parkadres met je naam en huisnummer`,
      ],
    },
  ],
});

const POOL = makePage({
  slug: 'zwembad-en-wellness',
  navLabel: 'Zwembad en wellness',
  title: `Zwembad De Golfslag en wellness Duinzout`,
  intro: `Ook als het weer niet meezit, kun je bij ons zwemmen. Zwembad De Golfslag is overdekt en verwarmd, en in de zomer is ook het buitenbad open. Voor ontspanning ga je naar wellness Duinzout.`,
  group: 'park',
  scene: 'zwembad',
  description: `Openingstijden en regels van overdekt zwembad De Golfslag en wellness Duinzout, inclusief prijzen en massages.`,
  sections: [
    {
      heading: `Het zwembad`,
      bullets: [
        `Wedstrijdbad van 25 meter, 28 graden, diepte 1,10 tot 2,10 meter`,
        `Peuterbad van 32 graden met een kleine glijbaan en speelfonteinen`,
        `Glijbaan van 42 meter met lichteffecten (vanaf 1,20 meter lengte)`,
        `Wildwaterbaan en een bubbelbad`,
        `Buitenbad van 1 juni t/m 15 september, met ligweide en zonnebedden`,
        `Tillift voor zwemmers met een beperking, en een aangepaste kleedruimte`,
      ],
    },
    {
      heading: `Openingstijden zwembad`,
      table: {
        columns: ['Periode', 'Openingstijden'],
        rows: [
          ['Laag- en middenseizoen, maandag t/m vrijdag', '10:00 tot 18:00 uur'],
          ['Laag- en middenseizoen, zaterdag en zondag', '09:00 tot 19:00 uur'],
          ['Hoogseizoen en schoolvakanties', 'dagelijks 09:00 tot 21:00 uur'],
          ['Banenzwemmen (alleen volwassenen)', 'maandag, woensdag en vrijdag 08:00 tot 10:00 uur'],
          ['Buitenbad (1 juni t/m 15 september)', 'dagelijks 10:00 tot 18:00 uur, bij mooi weer'],
        ],
      },
      paragraphs: [
        `In 2026 is het zwembad gesloten van 29 november t/m 10 december voor groot onderhoud. Op 25 december en 1 januari is het zwembad open van 12:00 tot 17:00 uur.`,
      ],
    },
    {
      heading: `Regels in het zwembad`,
      bullets: [
        `Toegang is gratis voor gasten met het polsbandje dat je bij het inchecken krijgt.`,
        `Dagbezoekers betalen ${euro(FEES.poolDayPass)} per persoon, kinderen tot 2 jaar gratis.`,
        `Kinderen onder 8 jaar of zonder zwemdiploma A zwemmen alleen onder begeleiding van een volwassene in het water.`,
        `Kinderen zonder zwemdiploma dragen zwembandjes. Die zijn gratis te leen.`,
        `Een zwemluier is verplicht voor kinderen die nog niet zindelijk zijn. Zwemluiers koop je bij de kassa voor ${euro(1.5)}.`,
        `Alleen zwemkleding is toegestaan, geen gewone kleding of ondergoed. Een boerkini of zwemshirt mag wel.`,
        `Er is altijd een gediplomeerde badmeester aanwezig.`,
        `Eten en drinken in de zwemzaal is niet toegestaan. In de zwembadbar Splash kun je wat drinken met uitzicht op het bad.`,
      ],
    },
    {
      heading: `Wellness Duinzout`,
      paragraphs: [
        `Wellness Duinzout ligt boven het zwembad en heeft een Finse sauna, een bio-sauna, een stoomcabine, een infraroodcabine, een dompelbad, een buitentuin met hottub en een rustruimte met uitzicht over de duinen. De wellness is dagelijks open van 10:00 tot 22:00 uur en is toegankelijk vanaf 16 jaar.`,
        `Je reserveert een dagdeel van 2 uur via de receptie of de zwembadkassa. Dat kost ${euro(FEES.wellness2h)} per persoon, inclusief badjas, saunalaken en thee. Voor een hele dag betaal je ${euro(32.5)}. Op woensdag is badkleding verplicht, op de andere dagen is de wellness textielvrij. Dinsdagavond van 18:00 tot 22:00 uur is een damesavond.`,
      ],
    },
    {
      heading: `Massages en behandelingen`,
      table: {
        columns: ['Behandeling', 'Duur', 'Prijs'],
        rows: [
          ['Ontspanningsmassage', '25 minuten', euro(FEES.massage25)],
          ['Ontspanningsmassage', '50 minuten', euro(FEES.massage50)],
          ['Hotstone-massage', '75 minuten', euro(89)],
          ['Zwangerschapsmassage', '50 minuten', euro(69)],
          ['Gezichtsbehandeling met Zeeuws zeezout', '45 minuten', euro(59)],
          ['Kindermassage (6 t/m 12 jaar, met ouder erbij)', '25 minuten', euro(29)],
        ],
      },
      paragraphs: [
        `Massages boek je minimaal 24 uur van tevoren via de receptie. Kun je niet komen, laat het ons dan minimaal 12 uur van tevoren weten; anders rekenen we de volledige prijs. Bij een massage van 50 minuten of langer mag je gratis 2 uur gebruikmaken van de wellness.`,
      ],
    },
  ],
});

const FOOD = makePage({
  slug: 'restaurant-en-strandpaviljoen',
  navLabel: 'Eten en drinken',
  title: `Restaurant De Duinpan en strandpaviljoen Zilt`,
  intro: `Op het park eet je in restaurant De Duinpan, en aan zee zit ons eigen strandpaviljoen Zilt. In allebei kook je niet zelf en hoef je ook niet ver te lopen.`,
  group: 'park',
  scene: 'restaurant',
  description: `Openingstijden, menu en allergenen van restaurant De Duinpan en strandpaviljoen Zilt bij Westerduin.`,
  sections: [
    {
      heading: `Restaurant De Duinpan`,
      paragraphs: [
        `De Duinpan zit in het centrale gebouw naast het zwembad, met een serre en een groot terras aan de speeltuin. Je eet er van eenvoudig tot uitgebreid: een broodje kroket als lunch, een pizza uit de steenoven of een driegangendiner met Zeeuwse producten. Kinderen spelen ondertussen in het speelhoekje of op de speeltuin voor het terras.`,
      ],
      table: {
        columns: ['Periode', 'Openingstijden'],
        rows: [
          ['Laag- en middenseizoen', 'woensdag t/m zondag 12:00 tot 21:30 uur, keuken tot 21:00 uur'],
          ['Laag- en middenseizoen, maandag en dinsdag', 'gesloten, behalve in schoolvakanties'],
          ['Hoogseizoen en schoolvakanties', 'dagelijks 11:00 tot 22:00 uur, keuken tot 21:30 uur'],
          ['Januari 2027', 'gesloten van 4 t/m 29 januari (verbouwing)'],
        ],
      },
    },
    {
      heading: `Van de kaart in De Duinpan`,
      bullets: [
        `Zeeuwse mosselen met frites en salade, ${euro(26.5)} (in het mosselseizoen, van juli tot april)`,
        `Vis van de dag uit Vlissingen, dagprijs rond ${euro(24.5)}`,
        `Duinhoeve-burger van rund uit de Zak van Zuid-Beveland, ${euro(18.5)}`,
        `Groene curry met tofu en jasmijnrijst (vegan), ${euro(17.5)}`,
        `Dagschotel, ${euro(17.5)}`,
        `Pizza uit de steenoven, vanaf ${euro(13.5)}, ook om af te halen`,
        `Kindermenu met frietjes, appelmoes, een snack of visstickjes en een ijsje, ${euro(9.5)}`,
        `Zeeuwse bolus met boerenijs als dessert, ${euro(7.5)}`,
      ],
      paragraphs: [
        `Reserveren is aan te raden op vrijdag- en zaterdagavond en in het hoogseizoen. Dat kan via de receptie of telefonisch. Pizza's afhalen bestel je aan de bar of telefonisch; ze zijn binnen 20 minuten klaar.`,
      ],
    },
    {
      heading: `Strandpaviljoen Zilt`,
      paragraphs: [
        `Zilt staat op het strand van Westerduin, op 400 meter van het park via het duinpad. Overdag zit je op het terras met je voeten bijna in het zand, en 's avonds kijk je vanuit de glazen serre naar de zonsondergang. Bij Zilt huur je ook strandbedjes en windschermen.`,
      ],
      table: {
        columns: ['Periode', 'Openingstijden'],
        rows: [
          ['1 april t/m 31 oktober', 'dagelijks vanaf 10:00 uur tot zonsondergang (uiterlijk 22:00 uur)'],
          ['1 november t/m 31 maart', 'alleen zaterdag en zondag 11:00 tot 17:00 uur'],
          ['Kerstvakantie', 'dagelijks 11:00 tot 17:00 uur, behalve 25 december'],
        ],
      },
    },
    {
      heading: `Van de kaart bij Zilt`,
      bullets: [
        `Uitsmijter met Zeeuws spek, ${euro(11.5)}`,
        `Tosti ham-kaas, ${euro(6.5)}`,
        `Kibbeling met remouladesaus, ${euro(13.5)}`,
        `Oesters uit de Oosterschelde, per 6 stuks ${euro(18)} (van september t/m april)`,
        `Platte kaas met verse frietjes (kindergerecht), ${euro(8.5)}`,
        `Appeltaart met slagroom, ${euro(4.75)}`,
        `Strandbedje met parasol voor een dag, ${euro(12.5)}`,
        `Windscherm voor een dag, ${euro(5)}`,
      ],
    },
    {
      heading: `Allergenen en dieetwensen`,
      paragraphs: [
        `In allebei de zaken ligt een allergenenkaart waarop per gerecht staat welke van de 14 wettelijke allergenen erin zitten. Vraag ernaar bij de bediening. We hebben altijd glutenvrij brood, glutenvrije pizzabodems en lactosevrije melk in huis, en op elke kaart staan vegetarische en veganistische gerechten.`,
        `Let op: onze keukens zijn niet volledig noten- en glutenvrij. We werken zorgvuldig, maar kunnen kruisbesmetting niet helemaal uitsluiten. Heb je een ernstige allergie, overleg dan vooraf met de chef via de receptie. Halal vlees hebben we niet standaard op de kaart; dat kunnen we met drie dagen voorbereiding wel regelen voor groepen.`,
      ],
    },
    {
      heading: `Andere eetgelegenheden`,
      bullets: [
        `Zwembadbar Splash: snacks, ijs en drankjes, open tijdens de openingstijden van het zwembad`,
        `Ijskar bij de speeltuin: in het hoogseizoen dagelijks van 13:00 tot 18:00 uur`,
        `Visrestaurant en snackbar in het dorp Westerduin, op 1,8 kilometer`,
      ],
    },
  ],
});

const ACTIVITIES = makePage({
  slug: 'activiteiten',
  navLabel: 'Activiteiten',
  title: `Activiteiten en animatieteam Helmgras`,
  intro: `In elke schoolvakantie staat animatieteam Helmgras klaar met een programma voor kinderen, tieners en volwassenen. Ons konijn Duinie is er natuurlijk ook bij.`,
  group: 'park',
  scene: 'duinen',
  description: `Animatieprogramma per seizoen, kinderclub, tieneractiviteiten en workshops op De Duinhoeve.`,
  sections: [
    {
      heading: `Wanneer is er animatie?`,
      table: {
        columns: ['Periode', 'Programma'],
        rows: [
          ['Zomervakantie (9 juli t/m 3 september 2027)', 'Dagelijks volledig programma voor alle leeftijden, 7 dagen per week'],
          ['Meivakantie, herfstvakantie en Pinksteren', 'Dagelijks programma van 10:00 tot 16:00 uur plus een avondactiviteit op woensdag en zaterdag'],
          ['Voorjaarsvakantie en kerstvakantie', 'Programma op zaterdag, zondag, dinsdag en donderdag'],
          ['Buiten de schoolvakanties', 'Op zaterdag de kinderclub van 10:00 tot 12:00 uur en op zondag de boswandeling'],
        ],
      },
      paragraphs: [
        `Het weekprogramma hangt bij de receptie, in De Schuur en in je accommodatie. Elke ochtend om 09:30 uur zet het animatieteam het dagprogramma in de WhatsApp-groep van het park; aanmelden voor die groep gaat met de QR-code op de plattegrond.`,
      ],
    },
    {
      heading: `Kinderclub`,
      bullets: [
        `Duinie's Kidsclub voor 4 t/m 7 jaar: knutselen, spelletjes, schminken en een mini-disco om 19:00 uur`,
        `Strandjutters voor 8 t/m 12 jaar: speurtochten, zandkastelen bouwen, vlotten bouwen en vossenjacht`,
        `Kinderen onder 4 jaar mogen meedoen als een ouder erbij blijft`,
        `Je kunt je kinderen bij de kinderclub afzetten. Wel vragen we je bereikbaar te blijven en op het park te blijven`,
      ],
    },
    {
      heading: `Tieners en volwassenen`,
      bullets: [
        `Tienerclub The Dunes (12 t/m 16 jaar): beachvolleybal, dropping in het bos, silent disco en een kampvuuravond`,
        `Bootcamp op het strand, dinsdag en vrijdag 08:30 uur (gratis)`,
        `Yoga in de duinen, zondag 09:00 uur (${euro(7.5)}, mat te leen)`,
        `Quizavond in De Duinpan, donderdag 20:30 uur (gratis, teams tot 6 personen)`,
        `Wijnproeverij met Zeeuwse wijnen, eens per twee weken op vrijdag (${euro(19.5)})`,
      ],
    },
    {
      heading: `Workshops en uitjes met een bijdrage`,
      table: {
        columns: ['Activiteit', 'Leeftijd', 'Prijs'],
        rows: [
          ['Boogschieten', 'vanaf 8 jaar', euro(7.5)],
          ['Broodjes bakken boven het kampvuur', 'vanaf 4 jaar', euro(3.5)],
          ['Krabben vangen bij de dijk', 'vanaf 5 jaar', euro(4)],
          ['Kitesurf-proefles (met externe kiteschool)', 'vanaf 12 jaar', euro(59)],
          ['Sup-tocht op het Veerse Meer (vervoer inbegrepen)', 'vanaf 10 jaar', euro(32.5)],
          ['Natuurwandeling met de boswachter', 'alle leeftijden', 'gratis (dinsdag 10:00 uur)'],
        ],
      },
      paragraphs: [
        `Workshops met een bijdrage reserveer je bij de receptie of het animatieteam, uiterlijk de dag van tevoren om 17:00 uur. Bij slecht weer gaan buitenactiviteiten niet door en krijg je je geld terug of mag je omboeken.`,
      ],
    },
    {
      heading: `Gezamenlijk kampvuur`,
      paragraphs: [
        `Op dinsdag en vrijdag om 20:00 uur stookt het animatieteam het kampvuur op De Vlinderweide, behalve bij een stookverbod. Iedereen is welkom, er zijn marshmallows en we sluiten om 22:30 uur af.`,
      ],
    },
  ],
});

const AREA = makePage({
  slug: 'omgeving',
  navLabel: 'Omgeving',
  title: `De omgeving van Westerduin`,
  intro: `De Duinhoeve ligt midden in het duingebied tussen de zee en de Zeeuwse polders. Het strand, het dorp en een hoop uitstapjes liggen op fietsafstand.`,
  group: 'park',
  scene: 'omgeving',
  description: `Strand, dorp Westerduin en uitjes in de omgeving met afstanden vanaf Vakantiepark De Duinhoeve.`,
  sections: [
    {
      heading: `Het strand`,
      paragraphs: [
        `Het strand van Westerduin ligt op 400 meter van de parkingang. Via het duinpad loop je er in vijf minuten naartoe, met een bolderkar is het iets langer omdat het laatste stuk over de duinovergang gaat. Het duinpad is verhard tot aan strandpaviljoen Zilt, daarna loop je over een mat op het zand.`,
        `Van 1 mei tot en met 15 september is het strand bij Zilt bewaakt door de reddingsbrigade, dagelijks van 10:00 tot 18:00 uur. Zwem alleen tussen de vlaggen en let op de stroming bij de strandhoofden. Het hondenstrand ligt bij strandpaal Noord 7, op 1,2 kilometer.`,
      ],
    },
    {
      heading: `Het dorp Westerduin`,
      paragraphs: [
        `Het dorp Westerduin ligt op 1,8 kilometer, een kwartier fietsen of 25 minuten lopen. Er is een supermarkt (dagelijks open van 08:00 tot 21:00 uur, ook op zondag), een bakker, een apotheek, een huisartsenpost, een ijssalon, een visrestaurant en een snackbar. Op woensdagochtend is er een weekmarkt op het Kerkplein.`,
      ],
    },
    {
      heading: `Uitjes in de buurt`,
      table: {
        columns: ['Uitje', 'Afstand', 'Tip'],
        rows: [
          ['Strand van Westerduin', '400 meter', 'Zonsondergang vanaf het terras van Zilt'],
          ['Dorp Westerduin', '1,8 km', 'Weekmarkt op woensdagochtend'],
          ['Vuurtoren Westerkaap (fictief)', '4,5 km', 'Beklimmen kan van april t/m oktober, 112 treden'],
          ['Middelburg', '16 km', 'Historische binnenstad, Abdij en Lange Jan'],
          ['Veere en het Veerse Meer', '14 km', 'Suppen, zeilen en een vestingstadje'],
          ['Vlissingen', '19 km', 'Boulevard, havens en de veerboot naar Breskens'],
          ['Domburg', '11 km', 'Gezellige badplaats met veel winkels'],
          ['Deltapark Neeltje Jans', '24 km', 'Deltawerken, zeehonden en waterspeeltuin'],
          ['Zierikzee', '38 km', 'Oude havenstad met de Dikke Toren'],
          ['Brugge (België)', '70 km', 'Via de Westerscheldetunnel, ongeveer een uur rijden'],
          ['Antwerpen (België)', '85 km', 'Winkelen en de dierentuin'],
        ],
      },
    },
    {
      heading: `Fietsen en wandelen`,
      paragraphs: [
        `Vanaf het park vertrekken drie bewegwijzerde fietsroutes: de Duinroute (24 km), de Polderroute (38 km) en de Kustroute naar de vuurtoren en terug (18 km). De kaarten krijg je gratis bij de receptie. Het fietsknooppunt 41 ligt direct bij de parkingang.`,
        `Een mooie wandeling is het Helmgraspad: een rondje van 6 kilometer door de duinen, met een uitzichtpunt op de hoogste duintop van Westerduin (24 meter). Het pad begint achter de tennisbanen en is gemarkeerd met groene paaltjes. Bij het uitzichtpunt staat een bankje en een infobord over de Schotse hooglanders die in het gebied grazen.`,
      ],
    },
    {
      heading: `Bij slecht weer`,
      bullets: [
        `Zwembad De Golfslag en speelschuur De Schuur op het park`,
        `Zeeuws Museum in Middelburg (16 km)`,
        `Bioscoop in Middelburg (16 km)`,
        `Indoor speelparadijs in Vlissingen (19 km)`,
        `Deltapark Neeltje Jans heeft ook overdekte attracties (24 km)`,
      ],
    },
  ],
});

const DIRECTIONS = makePage({
  slug: 'bereikbaarheid',
  navLabel: 'Route en parkeren',
  title: `Bereikbaarheid en parkeren`,
  intro: `Je bereikt De Duinhoeve makkelijk met de auto, maar ook met trein en bus. Hieronder lees je hoe je bij ons komt en waar je parkeert.`,
  group: 'praktisch',
  scene: 'omgeving',
  description: `Route met de auto en het openbaar vervoer naar De Duinhoeve, en alles over parkeren en laden.`,
  sections: [
    {
      heading: `Adres`,
      paragraphs: [
        `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.postcode} ${COMPANY.city} (${COMPANY.province}). Gebruik voor je navigatie het adres Duinhoeveweg 12. Navigeer niet op postcode, want dan kom je bij de achteringang voor leveranciers uit.`,
      ],
    },
    {
      heading: `Met de auto`,
      bullets: [
        `Vanuit Rotterdam: via de A29 en de N57 over de Haringvlietdam en de Zeelandbrug, ongeveer 1 uur en 30 minuten`,
        `Vanuit Utrecht en Brabant: A58 richting Vlissingen, afslag Middelburg, dan de borden Westerduin volgen, vanaf Breda ongeveer 1 uur en 15 minuten`,
        `Vanuit België: via Antwerpen en de Westerscheldetunnel (tol), ongeveer 1 uur vanaf Antwerpen`,
        `Vanaf de rotonde bij Westerduin is De Duinhoeve aangegeven met bruine toeristische borden`,
      ],
    },
    {
      heading: `Met het openbaar vervoer`,
      paragraphs: [
        `Neem de trein naar station Middelburg. Vanaf daar rijdt buslijn 52 (fictief) naar Westerduin. Stap uit bij halte Westerduin, Duinhoeve; die ligt op 200 meter van de receptie. De bus rijdt in de zomer elk half uur en de rest van het jaar elk uur, van 07:00 tot 23:00 uur. De reistijd van het station naar het park is 25 minuten.`,
        `Liever een taxi? Een taxi van station Middelburg naar het park kost ongeveer ${euro(38)}. De receptie kan een taxi voor je bestellen. Met veel bagage kun je ook de bagageservice gebruiken: we halen je bagage op het station op voor ${euro(15)} per rit, als je dat 48 uur van tevoren aanvraagt.`,
      ],
    },
    {
      heading: `Parkeren`,
      bullets: [
        `Parkeren is gratis voor één auto per accommodatie of kampeerplaats.`,
        `Een extra auto kost ${euro(FEES.extraCar)} per dag. Je meldt hem aan bij de receptie.`,
        `Bij de strandhuisjes, safaritenten en tiny houses parkeer je op P1 of P2, op maximaal 150 meter. Bolderkarren voor je bagage staan bij de parkeerplaatsen.`,
        `Bij de Duinlodges, Boshuizen, De Hoeve en de comfortplaatsen parkeer je bij je accommodatie.`,
        `Er zijn 4 gehandicaptenparkeerplaatsen bij de receptie en bij elk Boshuis een eigen gehandicaptenparkeerplaats.`,
        `Aanhangers, boten en extra caravans kunnen op de stallingsplaats bij P2 voor ${euro(5)} per dag.`,
        `Laadpalen voor elektrische auto's staan op P1, zie de pagina Faciliteiten.`,
      ],
    },
    {
      heading: `Parkeren bij het strand`,
      paragraphs: [
        `Bij het strand van Westerduin is betaald parkeren (${euro(2.5)} per uur, maximaal ${euro(15)} per dag in de zomer). Omdat het strand op loopafstand ligt, raden we je aan om je auto op het park te laten staan.`,
      ],
    },
  ],
});

const GROUPS = makePage({
  slug: 'groepen-en-bedrijven',
  navLabel: 'Groepen en bedrijven',
  title: `Groepen, families en bedrijfsuitjes`,
  intro: `Met de hele familie een weekend weg, een teamdag met vergadering en strandactiviteit, of een reünie met vrienden: op De Duinhoeve is ruimte voor groepen tot 60 personen.`,
  group: 'verblijf',
  scene: 'hoeve',
  description: `Groepsaccommodatie De Hoeve, vergaderzaal De Zeereep en bedrijfsuitjes bij De Duinhoeve.`,
  sections: [
    {
      heading: `Overnachten met een groep`,
      paragraphs: [
        `Voor groepen tot 16 personen is groepsaccommodatie De Hoeve de mooiste keuze: één huis met een grote deel, acht slaapkamers met eigen badkamer en een afgesloten tuin. Ben je met meer, dan combineren we De Hoeve met Duinlodges of strandhuisjes in de buurt. Zo kun je met maximaal 60 personen bij elkaar slapen.`,
        `Bij groepsboekingen van 4 accommodaties of meer krijg je 5% korting op de huur. We vragen bij groepen vanaf 20 personen een groepsverantwoordelijke van minimaal 25 jaar die tijdens het hele verblijf aanwezig is.`,
      ],
    },
    {
      heading: `Wie we wel en niet ontvangen`,
      bullets: [
        `Welkom: families, vriendengroepen vanaf 25 jaar, verenigingen, scholen met begeleiding en bedrijven`,
        `Niet welkom: jongerengroepen onder 25 jaar zonder volwassen begeleiding, vrijgezellenfeesten en groepen die alleen komen voor een feest`,
        `Feesten met een dj of liveband zijn alleen mogelijk in restaurant De Duinpan, in overleg`,
      ],
    },
    {
      heading: `Vergaderen in De Zeereep`,
      paragraphs: [
        `Vergaderzaal De Zeereep ligt op de eerste verdieping van het centrale gebouw, met daglicht en uitzicht over de duinen. De zaal is geschikt voor 40 personen in theateropstelling, 24 personen in U-vorm of 30 personen aan tafels. Er zijn een beamer, een groot scherm met HDMI en USB-C, een flip-over, een whiteboard en snelle wifi.`,
        `De arrangementen hieronder gelden vanaf 10 personen. Voor kleinere groepen maken we een prijs op maat. De zaal alleen huren kost ${euro(295)} per dag of ${euro(175)} per dagdeel. Prijzen zijn exclusief btw.`,
      ],
      table: {
        columns: ['Arrangement', 'Inhoud', 'Prijs per persoon'],
        rows: [
          ['Dagdeel vergaderen', 'Zaal 4 uur, koffie, thee, water en iets lekkers', euro(32.5)],
          ['Vergaderdag', 'Zaal 8 uur, koffie en thee onbeperkt, lunch in De Duinpan', euro(49.5)],
          ['Vergaderdag met uitje', 'Vergaderdag plus een strandactiviteit van 2 uur en een borrel bij Zilt', euro(84.5)],
          ['Tweedaags met overnachting', 'Twee vergaderdagen, diner, overnachting in De Hoeve of een Duinlodge, ontbijt', 'vanaf ' + euro(229)],
        ],
      },
    },
    {
      heading: `Uitjes voor groepen`,
      bullets: [
        `Strandspelen met een eigen begeleider, 2 uur, ${euro(24.5)} per persoon`,
        `Vlotten bouwen op het Veerse Meer, 3 uur, ${euro(39.5)} per persoon`,
        `Kookworkshop Zeeuwse keuken met de chef van De Duinpan, ${euro(65)} per persoon inclusief diner`,
        `Fietstocht met e-bikes en een lunch onderweg, ${euro(55)} per persoon`,
        `Mosselen eten met een proeverij van Zeeuwse wijnen, ${euro(52.5)} per persoon`,
      ],
    },
    {
      heading: `Offerte aanvragen`,
      paragraphs: [
        `Stuur je wensen naar ${COMPANY.groupsEmail}: het aantal personen, de datum, het soort overnachting en wat je wilt doen. Onze groepscoördinator Esther maakt binnen twee werkdagen een offerte. Bij bedrijven betaal je 50% aanbetaling bij bevestiging en de rest na afloop op factuur, met een betaaltermijn van 14 dagen.`,
      ],
    },
  ],
});

const DEALS = makePage({
  slug: 'aanbiedingen',
  navLabel: 'Aanbiedingen',
  title: `Aanbiedingen en arrangementen`,
  intro: `Met een van onze aanbiedingen of arrangementen ben je voordeliger uit. Kortingen zijn niet bij elkaar op te tellen, tenzij het er expliciet bij staat.`,
  group: 'verblijf',
  scene: 'strand',
  description: `Vroegboekkorting, 55+ korting, last-minutes en arrangementen bij De Duinhoeve.`,
  sections: [
    {
      heading: `Vroegboekkorting zomer 2027`,
      paragraphs: [
        `Boek je een week in het hoogseizoen vóór 1 februari 2027, dan krijg je 10% korting op de huur. De korting geldt voor alle vakantiehuizen en voor kampeerplaatsen bij een verblijf van minimaal 7 nachten. De korting wordt automatisch verrekend bij online boeken.`,
      ],
    },
    {
      heading: `55+ korting`,
      paragraphs: [
        `Ben je 55 jaar of ouder en reis je buiten de schoolvakanties, dan krijg je 10% korting op de huur van een vakantiehuis. Minimaal één van de gasten moet 55 jaar of ouder zijn en er mogen geen schoolgaande kinderen mee. Je geeft je geboortedatum op bij het boeken.`,
      ],
    },
    {
      heading: `Last-minute`,
      paragraphs: [
        `Vanaf 14 dagen voor aankomst zetten we vrije accommodaties met 15% korting in de last-minutelijst op de website. In het hoogseizoen zijn dan ook weekenden en midweken boekbaar. Last-minutes kun je niet omboeken.`,
      ],
    },
    {
      heading: `Langer verblijf`,
      paragraphs: [
        `Blijf je twee weken of langer in een vakantiehuis, dan krijg je 10% korting op de tweede en volgende weken. In het laagseizoen geldt bij vier weken of langer een maandtarief: dat vragen we op aanvraag aan bij de receptie. Deze korting is te combineren met de 55+ korting.`,
      ],
    },
    {
      heading: `Arrangementen`,
      table: {
        columns: ['Arrangement', 'Wat zit erin', 'Prijs'],
        rows: [
          ['Wellnessweekend', 'Weekend in een Duinlodge of tiny house, 2x dagentree wellness Duinzout en een massage van 50 minuten per persoon, voor 2 personen', `vanaf ${euro(549)} (laagseizoen, tiny house)`],
          ['Fietsen langs de kust', 'Midweek in een strandhuisje, 4 dagen e-bikes voor 2 personen, routekaarten en een lunchpakket per dag', `vanaf ${euro(549)} (laagseizoen)`],
          ['Kerst aan zee', 'Midweek vanaf maandag 20 december 2027 in elk vakantiehuis, kerstdiner in De Duinpan en een kerstbrunch bij Zilt', `toeslag ${euro(69)} per persoon op de midweekprijs`],
          ['Oud en nieuw', 'Week van 31 december 2027 t/m 7 januari 2028, nieuwjaarsduik met erwtensoep en een oliebollenpakket', 'middenseizoentarief, geen toeslag'],
          ['Hondenweek', 'Week in een Duinlodge, geen huisdierkosten voor 1 hond, hondenpakket en een les van de hondentrainer op het strand', `vanaf ${euro(845)} (laagseizoen)`],
        ],
      },
      paragraphs: [
        `Arrangementen boek je online of via de receptie. Bijkomende kosten zoals schoonmaak, linnen en toeristenbelasting komen bij de arrangementsprijs, tenzij anders vermeld.`,
      ],
    },
  ],
});

const SUSTAINABILITY = makePage({
  slug: 'duurzaamheid',
  navLabel: 'Duurzaamheid',
  title: `Duurzaam op vakantie`,
  intro: `We werken in een kwetsbaar duingebied en willen dat het park er over vijftig jaar nog net zo mooi bij ligt. Daarom investeren we flink in duurzaamheid.`,
  group: 'over',
  scene: 'duinen',
  description: `Zonnepanelen, warmtepompen, afvalscheiding en natuurbeheer op Vakantiepark De Duinhoeve.`,
  sections: [
    {
      heading: `Energie`,
      bullets: [
        `1.400 zonnepanelen op de daken en op de overkapping van P1 leveren ongeveer 70% van onze stroom`,
        `Alle Boshuizen, Duinlodges en tiny houses zijn sinds 2024 gasloos en verwarmd met een warmtepomp`,
        `Het zwembad wordt voor een groot deel verwarmd met restwarmte van de wellness en een warmtepomp`,
        `Overal ledverlichting met bewegingssensoren in de sanitairgebouwen`,
        `De rest van onze stroom is groene stroom uit Nederlandse windmolens`,
      ],
    },
    {
      heading: `Water en afval`,
      bullets: [
        `Waterbesparende douchekoppen en kranen in alle accommodaties`,
        `Regenwater wordt opgevangen voor de toiletten in sanitairgebouw De Duinpieper`,
        `Afval scheiden in zes stromen: restafval, plastic en blik, glas, papier, gft en statiegeld`,
        `Geen plastic wegwerpbekers en -rietjes in het restaurant en het strandpaviljoen`,
        `Lever je statiegeldflessen in bij Het Winkeltje; de opbrengst gaat naar de strandopruimactie`,
      ],
    },
    {
      heading: `Natuur`,
      paragraphs: [
        `Een derde van het park is natuurgebied dat we samen met Stichting Westerduinen (fictief) beheren. We maaien laat in het seizoen zodat bloemen kunnen uitzaaien, en we hebben 40 nestkasten opgehangen voor mezen, spreeuwen en vleermuizen. Elke eerste zaterdag van de maand is er van 10:00 tot 12:00 uur een strandopruimactie waarbij gasten gratis kunnen meedoen; na afloop krijg je koffie en een stuk bolus bij Zilt.`,
      ],
    },
    {
      heading: `Keurmerk`,
      paragraphs: [
        `Sinds 2021 hebben we het keurmerk Groen Kustpark (fictief) op het hoogste niveau, goud. Elk jaar controleert een onafhankelijke auditor of we nog aan alle eisen voldoen. Ons doel is om in 2030 volledig energieneutraal te zijn.`,
      ],
    },
    {
      heading: `Wat kun jij doen?`,
      bullets: [
        `Kom met de trein en bus, of laat je auto staan en pak de fiets`,
        `Gebruik je handdoeken meer dan één keer`,
        `Zet de verwarming lager als je de deur uitgaat`,
        `Blijf in de duinen op de paden, ook met de hond`,
      ],
    },
  ],
});

const ACCESSIBILITY = makePage({
  slug: 'toegankelijkheid',
  navLabel: 'Toegankelijkheid',
  title: `Toegankelijk op vakantie`,
  intro: `Iedereen moet bij ons een fijne vakantie kunnen hebben. Hier lees je wat we doen voor gasten met een beperking, en waar het nog niet perfect is.`,
  group: 'praktisch',
  scene: 'bos',
  description: `Rolstoeltoegankelijke accommodaties, aangepast sanitair en hulpmiddelen op De Duinhoeve.`,
  sections: [
    {
      heading: `Aangepaste accommodaties`,
      paragraphs: [
        `De zes Boshuizen zijn volledig rolstoeltoegankelijk. Ze hebben brede deuren van minimaal 95 cm, geen drempels, een onderrijdbaar aanrecht, een aangepaste badkamer met inloopdouche en beugels, en twee slaapkamers op de begane grond. Een hoog-laagbed is op aanvraag beschikbaar, zonder extra kosten. In groepsaccommodatie De Hoeve is één slaapkamer met badkamer op de begane grond rolstoeltoegankelijk.`,
        `De strandhuisjes, safaritenten en tiny houses zijn niet geschikt voor rolstoelgebruikers. De Duinlodges hebben een opstap van twee treden.`,
      ],
    },
    {
      heading: `Op het park`,
      bullets: [
        `Alle hoofdpaden zijn verhard en vlak`,
        `De receptie, het restaurant, Het Winkeltje en het zwembad zijn drempelvrij`,
        `Het zwembad heeft een tillift en een aangepaste kleedruimte met douche`,
        `Sanitairgebouw De Duinpieper heeft een aangepaste sanitaire ruimte, te openen met je sleutelpas`,
        `De wellness is bereikbaar met een lift`,
        `Gehandicaptenparkeerplaatsen bij de receptie (4 stuks) en bij elk Boshuis`,
        `Erkende assistentiehonden zijn overal welkom, gratis`,
      ],
    },
    {
      heading: `Naar het strand`,
      paragraphs: [
        `Het duinpad is tot aan strandpaviljoen Zilt verhard en heeft een helling van maximaal 6%. Bij Zilt kun je gratis een strandrolstoel met ballonbanden lenen; reserveer hem een dag van tevoren bij Zilt of de receptie. Op het strand ligt van mei tot en met september een mat tot 30 meter van de vloedlijn.`,
      ],
    },
    {
      heading: `Hulpmiddelen huren`,
      table: {
        columns: ['Hulpmiddel', 'Prijs'],
        rows: [
          ['Scootmobiel', `${euro(25)} per dag, ${euro(125)} per week`],
          ['Rolstoel (duwrolstoel)', `${euro(5)} per dag, ${euro(25)} per week`],
          ['Douchestoel of toiletverhoger', 'gratis'],
          ['Strandrolstoel', 'gratis, te reserveren bij Zilt'],
          ['Tillift', 'via een externe thuiszorgwinkel in Middelburg, prijs op aanvraag'],
        ],
      },
    },
    {
      heading: `Wat nog niet goed is`,
      paragraphs: [
        `De speeltuin heeft nog geen speeltoestellen voor kinderen in een rolstoel. In 2027 vervangen we de kabelbaan door een rolstoelschommel en een verhoogde zandtafel. De vergaderzaal is alleen bereikbaar met de trap; een lift staat op de planning voor 2028. Heb je specifieke vragen, bel dan met de receptie: we denken graag met je mee.`,
      ],
    },
  ],
});

const HOUSE_RULES = makePage({
  slug: 'huisregels',
  navLabel: 'Huisregels',
  title: `Huisregels`,
  intro: `Met veel mensen bij elkaar op een park is het fijn als iedereen zich aan dezelfde afspraken houdt. Dit zijn onze huisregels. Overtreed je ze ernstig of herhaaldelijk, dan kunnen we je vragen het park te verlaten, zonder teruggave van de huur.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Huisregels van De Duinhoeve: nachtrust, barbecueën, roken, bezoek, verkeer en vuurwerk.`,
  sections: [
    {
      heading: `Rust`,
      bullets: [
        `Tussen 23:00 en 07:00 uur is het stil op het park. Dan mag je je buren niet horen.`,
        `Muziek mag alleen zacht en binnen, nooit met een buitenspeaker.`,
        `Op zondag tot 09:00 uur geen grasmaaiers of klusactiviteiten van het park zelf; wij houden ons er ook aan.`,
      ],
    },
    {
      heading: `Barbecueën en vuur`,
      bullets: [
        `Barbecueën mag met een gas- of elektrische barbecue en met een houtskoolbarbecue op poten, op minimaal 1 meter van tenten, hagen en gebouwen.`,
        `Een emmer water of een blusdeken moet binnen handbereik staan.`,
        `Open vuur, vuurkorven en vuurschalen zijn niet toegestaan, behalve de vuurschaal bij De Hoeve en het gezamenlijke kampvuur.`,
        `Bij code oranje of rood voor natuurbrandrisico geldt een stookverbod op het hele park, ook voor houtskoolbarbecues en de houtkachel. Gas en elektrisch barbecueën mag dan wel. We hangen dit op bij de receptie en sturen een bericht in de WhatsApp-groep.`,
        `Gebruikte houtskool laat je volledig afkoelen en gooi je in de grijze containers bij P1 en P2.`,
      ],
    },
    {
      heading: `Roken`,
      bullets: [
        `In alle accommodaties, sanitairgebouwen, het zwembad, het restaurant en de speeltuin is roken verboden. Dat geldt ook voor e-sigaretten.`,
        `Op je eigen terras en op je kampeerplaats mag je roken. Gooi peuken niet in de duinen.`,
        `Is er in de accommodatie gerookt, dan rekenen we ${euro(150)} extra schoonmaakkosten.`,
      ],
    },
    {
      heading: `Bezoek`,
      bullets: [
        `Bezoek is welkom tussen 09:00 en 23:00 uur. Meld je bezoekers aan bij de receptie.`,
        `Dagbezoekers betalen ${euro(FEES.dayVisitor)} per persoon per dag, kinderen tot en met 3 jaar gratis. Daarmee mogen ze ook naar het zwembad.`,
        `Bezoekers parkeren op P1, niet bij de accommodatie.`,
        `Blijft bezoek overnachten, dan betaal je de toeristenbelasting en mag het maximale aantal personen van de accommodatie niet worden overschreden.`,
      ],
    },
    {
      heading: `Verkeer`,
      bullets: [
        `Op het park rijd je maximaal 5 km per uur.`,
        `Tussen 23:00 en 07:00 uur is de slagboom dicht.`,
        `Op De Vlinderweide en De Zeereep rijden geen auto's, behalve bij in- en uitladen op de aankomst- en vertrekdag.`,
        `E-steps, hoverboards en brommers zijn op het park niet toegestaan. Fietsen mag wel, stapvoets op de paden.`,
      ],
    },
    {
      heading: `Overige regels`,
      bullets: [
        `Vuurwerk is het hele jaar verboden, ook rond oud en nieuw. Op 31 december organiseren we om 00:00 uur een lichtshow op het strand.`,
        `Drones vliegen is niet toegestaan boven het park en het naastgelegen natuurgebied.`,
        `Zwemmen in de vijver is niet toegestaan.`,
        `Planten in de duinen niet plukken en niet buiten de paden lopen.`,
        `Schade meld je zo snel mogelijk bij de receptie. Opzettelijke schade verhalen we op de veroorzaker.`,
        `Glas en eten mag je niet meenemen in het zwembad.`,
        `Tenten en partytenten op het terras van een vakantiehuis zijn niet toegestaan. Een strandschelp of windscherm wel.`,
      ],
    },
  ],
});

const ABOUT = makePage({
  slug: 'over-ons',
  navLabel: 'Over ons',
  title: `Over De Duinhoeve`,
  intro: `De Duinhoeve is een familiebedrijf. Wat in 1987 begon met twaalf kampeerplaatsen in de boomgaard van een boerderij, is uitgegroeid tot een park waar elk jaar zo'n 40.000 gasten logeren.`,
  group: 'over',
  scene: 'hoeve',
  description: `Het verhaal van familiebedrijf De Duinhoeve, van boerderij in 1987 tot vakantiepark in de Zeeuwse duinen.`,
  sections: [
    {
      heading: `Hoe het begon`,
      paragraphs: [
        `De boerderij De Duinhoeve werd in 1912 gebouwd door de familie Verhage, die er koeien en akkerbouw had. In 1987 besloten Kees en Marianne Verhage het over een andere boeg te gooien. Ze zetten twaalf kampeerplaatsen in de boomgaard en verkochten eieren en melk aan de kampeerders. De gasten bleven komen, en elk jaar kwamen er een paar plaatsen bij.`,
        `In 1995 bouwden Kees en Marianne de eerste tien strandhuisjes, in 2003 kwam het overdekte zwembad en in 2011 strandpaviljoen Zilt. Sinds 2018 staat hun dochter Lotte Verhage samen met haar partner Joris de Wit aan het roer. Kees komt nog bijna elke dag langs, meestal bij de kinderboerderij.`,
      ],
    },
    {
      heading: `Het park in cijfers`,
      bullets: [
        `${COMPANY.hectares} hectare, waarvan een derde natuurgebied`,
        `${HOUSES.reduce((n, a) => n + a.units, 0)} vakantiehuizen en ${PITCHES.reduce((n, a) => n + a.units, 0)} kampeerplaatsen`,
        `Zo'n 40.000 gasten per jaar`,
        `65 vaste medewerkers en in de zomer nog eens 80 seizoenskrachten`,
        `Gemiddeld cijfer van gasten in 2026: 8,9`,
      ],
    },
    {
      heading: `Waar we voor staan`,
      paragraphs: [
        `We willen een park zijn waar je je meteen thuis voelt. Geen grote keten, maar een plek waar de receptie je naam onthoudt en waar je kinderen na een paar dagen hun eigen weg weten. We kiezen bewust voor rust en ruimte: onze velden zijn niet volgebouwd en we hebben geen discotheek of grote horecaketen op het park.`,
        `We kopen zoveel mogelijk in bij Zeeuwse leveranciers: het brood komt van bakkerij Westerduin, de mosselen uit Yerseke en het vlees van boeren uit de buurt.`,
      ],
    },
    {
      heading: `Mijlpalen`,
      table: {
        columns: ['Jaar', 'Wat gebeurde er'],
        rows: [
          ['1912', 'De boerderij De Duinhoeve wordt gebouwd'],
          ['1987', 'Kees en Marianne Verhage openen een camping met 12 plaatsen'],
          ['1995', 'De eerste 10 strandhuisjes'],
          ['2003', 'Overdekt zwembad De Golfslag'],
          ['2011', 'Strandpaviljoen Zilt opent'],
          ['2018', 'Lotte Verhage en Joris de Wit nemen het park over'],
          ['2019', 'De oude boerderij wordt groepsaccommodatie De Hoeve'],
          ['2021', 'Keurmerk Groen Kustpark goud'],
          ['2022', 'Zes nieuwe rolstoeltoegankelijke Boshuizen'],
          ['2027', 'Twee padelbanen en een nieuwe speeltuin'],
        ],
      },
    },
  ],
});

const JOBS = makePage({
  slug: 'vacatures',
  navLabel: 'Werken bij',
  title: `Werken bij De Duinhoeve`,
  intro: `Werken waar een ander vakantie viert. We zoeken collega's die gastvrij zijn, aanpakken en het leuk vinden om mensen een mooie vakantie te geven.`,
  group: 'over',
  scene: 'duinen',
  description: `Vacatures en seizoenswerk bij Vakantiepark De Duinhoeve in Westerduin.`,
  sections: [
    {
      heading: `Wat we je bieden`,
      bullets: [
        `Salaris volgens de cao Recreatie`,
        `Gratis gebruik van het zwembad en de wellness, ook voor je partner en kinderen`,
        `25% personeelskorting in De Duinpan en bij Zilt`,
        `Een week per jaar gratis in een van onze accommodaties (voor vaste medewerkers)`,
        `Seizoenskrachten kunnen in de zomer een plek krijgen in ons personeelsverblijf voor ${euro(65)} per week`,
      ],
    },
    {
      heading: `Openstaande vacatures`,
      bullets: [
        `Medewerker receptie (24 tot 32 uur per week, jaarrond). Je spreekt Nederlands, Duits en Engels en werkt ook in het weekend.`,
        `Animatiemedewerker zomer 2027 (fulltime van 1 juli t/m 5 september). Vanaf 18 jaar, ervaring met kinderen is een pre.`,
        `Kok De Duinpan (32 tot 38 uur per week). Je hebt een vakdiploma en minimaal twee jaar ervaring.`,
        `Schoonmaakmedewerker weekend (vrijdag en maandag, 10:00 tot 15:00 uur). Ook geschikt als bijbaan vanaf 16 jaar.`,
        `Badmeester (oproepbasis, met diploma Zwembadmedewerker en geldig EHBO).`,
      ],
    },
    {
      heading: `Solliciteren`,
      paragraphs: [
        `Stuur je cv en een korte motivatie naar ${COMPANY.jobsEmail}. We reageren binnen een week. Een open sollicitatie is ook welkom. Voor seizoenswerk in de zomer houden we in maart en april kennismakingsdagen op het park.`,
      ],
    },
  ],
});

const FAQ = makePage({
  slug: 'veelgestelde-vragen',
  navLabel: 'Veelgestelde vragen',
  title: `Veelgestelde vragen`,
  intro: `Hier vind je de antwoorden op de vragen die we het vaakst krijgen. Staat je vraag er niet bij? Stel hem aan onze chatbot rechtsonder of neem contact op met de receptie.`,
  group: 'praktisch',
  scene: 'strand',
  description: `Antwoorden op veelgestelde vragen over boeken, aankomst, huisdieren, faciliteiten en het park.`,
  sections: [
    {
      heading: `Boeken en betalen`,
      faq: [
        {
          q: `Hoe oud moet ik zijn om te boeken?`,
          a: `De hoofdboeker moet minimaal 21 jaar zijn en zelf tijdens het verblijf aanwezig zijn. Voor groepen vanaf 20 personen moet de groepsverantwoordelijke minimaal 25 jaar zijn.`,
        },
        {
          q: `Wanneer moet ik betalen?`,
          a: `Binnen 7 dagen na het boeken betaal je 30% aanbetaling. Het restbedrag betaal je uiterlijk 6 weken voor aankomst. Boek je binnen 6 weken voor aankomst, dan betaal je alles direct.`,
        },
        {
          q: `Welke kosten komen er bovenop de huurprijs?`,
          a: `Reserveringskosten (${euro(FEES.bookingFee)} per boeking), toeristenbelasting (${euro(FEES.touristTax)} per persoon per nacht), de verplichte eindschoonmaak bij vakantiehuizen en eventueel linnenpakketten (${euro(FEES.linenPerPerson)} per persoon) en huisdieren. Bij aankomst betaal je ook een borg, die je terugkrijgt.`,
        },
        {
          q: `Kan ik een specifiek huisje of een plek naast vrienden aanvragen?`,
          a: `Ja, voor ${euro(19.5)} per boeking kun je een voorkeursnummer aanvragen. Wil je naast vrienden staan, zet dan in de opmerkingen bij het boeken met wie je samen wilt staan. We doen ons best, maar kunnen het niet garanderen.`,
        },
        {
          q: `Kan ik met een cadeaubon betalen?`,
          a: `Ja, een Duinhoeve-cadeaubon kun je gebruiken voor een verblijf, in het restaurant, het strandpaviljoen en de wellness. Hij is 2 jaar geldig. Andere cadeaukaarten nemen we niet aan.`,
        },
        {
          q: `Is de toeristenbelasting inbegrepen in de prijs?`,
          a: `Nee, de toeristenbelasting komt bovenop de huurprijs. Je betaalt hem wel vooraf, samen met de reissom. Kinderen tot en met 3 jaar betalen geen toeristenbelasting.`,
        },
      ],
    },
    {
      heading: `Annuleren en wijzigen`,
      faq: [
        {
          q: `Wat kost annuleren?`,
          a: `Tot 3 maanden voor aankomst 15% van de reissom, tussen 3 maanden en 1 maand 50%, tussen 1 maand en 1 dag 90% en op de dag van aankomst of later 100%. De toeristenbelasting krijg je altijd terug.`,
        },
        {
          q: `Kan ik nog een annuleringsverzekering afsluiten?`,
          a: `Dat kan bij het boeken of tot 7 dagen daarna. De premie is ${FEES.cancelInsurancePct} van de reissom plus ${euro(FEES.policyCosts)} poliskosten.`,
        },
        {
          q: `Kan ik mijn vakantie verzetten naar een andere datum?`,
          a: `Tot 8 weken voor aankomst kun je één keer gratis omboeken naar een andere periode in hetzelfde jaar, als er plek is. Daarna kost een wijziging ${euro(FEES.rebooking)}. Last-minuteboekingen kun je niet omboeken.`,
        },
      ],
    },
    {
      heading: `Aankomst en vertrek`,
      faq: [
        {
          q: `Hoe laat kan ik inchecken?`,
          a: `In een vakantiehuis vanaf 15:00 uur, op een kampeerplaats vanaf 13:00 uur. Je bent wel al vanaf 10:00 uur welkom op het park om bijvoorbeeld te zwemmen.`,
        },
        {
          q: `Hoe laat moet ik vertrekken?`,
          a: `Uit een vakantiehuis voor 10:00 uur en van een kampeerplaats voor 12:00 uur. Een late check-out tot 14:00 uur kost ${euro(FEES.lateCheckout)}, als de accommodatie die dag niet opnieuw verhuurd is.`,
        },
        {
          q: `Ik kom pas laat aan. Wat nu?`,
          a: `Laat het vóór 16:00 uur op de aankomstdag weten. Tot 22:00 uur staat de avonddienst voor je klaar, zonder extra kosten. Na 22:00 uur haal je je sleutelpas uit de sleutelkluis voor ${euro(FEES.lateArrivalAfter22)}. Na 23:00 uur is de slagboom dicht en parkeer je op de nachtparkeerplaats.`,
        },
        {
          q: `Op welke dagen kan ik aankomen?`,
          a: `In de vakantiehuizen op vrijdag (weekend en week) of maandag (midweek en week). In het hoogseizoen alleen op vrijdag, behalve bij last-minutes. Op de kampeerplaatsen kun je elke dag aankomen.`,
        },
      ],
    },
    {
      heading: `In de accommodatie`,
      faq: [
        {
          q: `Moet ik zelf beddengoed meenemen?`,
          a: `Je kunt je eigen beddengoed meenemen of een linnenpakket huren voor ${euro(FEES.linenPerPerson)} per persoon. Neem je eigen linnen mee, dan zijn een hoeslaken, dekbedovertrek en kussensloop verplicht; alleen een slaapzak is niet genoeg. In het tiny house is linnen inbegrepen, en bij De Hoeve is het linnenpakket verplicht.`,
        },
        {
          q: `Zijn er handdoeken?`,
          a: `Handdoeken zitten in het linnenpakket. Een extra handdoekenset kost ${euro(FEES.extraTowels)}. Strandlakens moet je zelf meenemen of kopen in Het Winkeltje.`,
        },
        {
          q: `Is er een kinderbedje?`,
          a: `Ja, via het babypakket voor ${euro(FEES.babyPack)} per verblijf: een campingbedje met matras, een kinderstoel en een badje. In De Hoeve staan al twee kinderbedjes en kinderstoelen. In het tiny house past geen kinderbedje.`,
        },
        {
          q: `Moet ik schoonmaken bij vertrek?`,
          a: `De eindschoonmaak is verplicht en doen wij. Jij doet de vaat, maakt de koelkast leeg en brengt het afval weg. Laat je de accommodatie erg vies achter, dan rekenen we extra kosten van de borg af.`,
        },
        {
          q: `Is er airconditioning?`,
          a: `In het Boshuis (woonkamer) en het tiny house wel. In de strandhuisjes staat een ventilator. De Duinlodges en safaritenten hebben geen airco.`,
        },
        {
          q: `Is er een vaatwasser?`,
          a: `In alle vakantiehuizen behalve het tiny house en de safaritent.`,
        },
      ],
    },
    {
      heading: `Huisdieren`,
      faq: [
        {
          q: `Mag mijn hond mee?`,
          a: `Ja, in 12 van de 24 strandhuisjes (max. 1), in alle Duinlodges (max. 2), tiny houses (max. 1), De Hoeve (max. 2) en op alle kampeerplaatsen (max. 2). In het Boshuis en de safaritenten zijn geen huisdieren toegestaan, behalve erkende assistentiehonden.`,
        },
        {
          q: `Wat kost een huisdier?`,
          a: `${euro(FEES.petPerNight)} per huisdier per nacht in een vakantiehuis en ${euro(FEES.petPerNightCamping)} per nacht op een kampeerplaats. Assistentiehonden zijn gratis.`,
        },
        {
          q: `Mag mijn hond op het strand?`,
          a: `Op het hoofdstrand bij Zilt niet van 1 mei t/m 30 september tussen 10:00 en 19:00 uur. Op het hondenstrand bij strandpaal Noord 7, op 1,2 kilometer, mag je hond het hele jaar los.`,
        },
      ],
    },
    {
      heading: `Faciliteiten`,
      faq: [
        {
          q: `Is het zwembad gratis?`,
          a: `Ja, voor gasten met een polsbandje is het zwembad gratis. Dagbezoekers betalen ${euro(FEES.poolDayPass)}. De wellness kost ${euro(FEES.wellness2h)} per persoon per 2 uur.`,
        },
        {
          q: `Hoe laat is het zwembad open?`,
          a: `In het hoogseizoen en de schoolvakanties dagelijks van 09:00 tot 21:00 uur. Daarbuiten op werkdagen van 10:00 tot 18:00 uur en in het weekend van 09:00 tot 19:00 uur.`,
        },
        {
          q: `Is er wifi?`,
          a: `Ja, gratis op het hele park via het netwerk Duinhoeve-Gast. Het wachtwoord staat op je sleutelpas.`,
        },
        {
          q: `Kan ik mijn elektrische auto opladen?`,
          a: `Ja, bij de 12 laadpunten op P1 voor ${euro(FEES.evPerKwh)} per kWh. Laden bij je accommodatie of kampeerplaats is niet toegestaan.`,
        },
        {
          q: `Kan ik fietsen huren?`,
          a: `Ja, bij de fietsverhuur naast de receptie. Een stadsfiets kost ${euro(11)} per dag en een e-bike ${euro(27.5)} per dag. Een helm is gratis.`,
        },
        {
          q: `Hoe werkt de broodjesservice?`,
          a: `Bestel voor 18:00 uur de dag ervoor bij de receptie of met het formulier in je accommodatie. Ophalen tussen 08:00 en 10:00 uur in Het Winkeltje, of laten bezorgen tussen 08:00 en 09:00 uur voor ${euro(1.5)}.`,
        },
        {
          q: `Is er een supermarkt in de buurt?`,
          a: `Op het park zit Het Winkeltje voor de dagelijkse boodschappen. Een grote supermarkt vind je in het dorp Westerduin, op 1,8 kilometer, dagelijks open van 08:00 tot 21:00 uur.`,
        },
      ],
    },
    {
      heading: `Overig`,
      faq: [
        {
          q: `Mag ik barbecueën?`,
          a: `Ja, met een gas- of elektrische barbecue en een houtskoolbarbecue op poten. Open vuur en vuurkorven zijn niet toegestaan. Bij code oranje of rood voor natuurbrandrisico mag alleen gas en elektrisch.`,
        },
        {
          q: `Mag ik roken in de accommodatie?`,
          a: `Nee, alle accommodaties zijn rookvrij, ook voor e-sigaretten. Op je terras mag je wel roken. Is er binnen gerookt, dan rekenen we ${euro(150)} extra schoonmaakkosten.`,
        },
        {
          q: `Mag er bezoek komen?`,
          a: `Ja, tussen 09:00 en 23:00 uur. Dagbezoekers betalen ${euro(FEES.dayVisitor)} per persoon en mogen dan ook zwemmen. Meld ze aan bij de receptie.`,
        },
        {
          q: `Hoe ver is het strand?`,
          a: `400 meter, ongeveer vijf minuten lopen via het duinpad. Het dichtstbijzijnde vakantiehuis ligt op 250 meter van het strand, het verste op 900 meter.`,
        },
        {
          q: `Kan ik mijn pakketje op het park laten bezorgen?`,
          a: `Ja, laat het bezorgen op ${COMPANY.street}, ${COMPANY.postcode} ${COMPANY.city}, met je naam en huisnummer. Je haalt het op bij de receptie.`,
        },
        {
          q: `Zijn jongerengroepen welkom?`,
          a: `Nee, jongerengroepen onder 25 jaar zonder volwassen begeleiding en vrijgezellenfeesten ontvangen we niet.`,
        },
        {
          q: `Is het park geschikt voor rolstoelgebruikers?`,
          a: `Ja, de zes Boshuizen zijn volledig rolstoeltoegankelijk en het zwembad heeft een tillift. Bij Zilt leen je gratis een strandrolstoel. Kijk op de pagina Toegankelijkheid voor alle details.`,
        },
      ],
    },
  ],
});

const CONTACT = makePage({
  slug: 'contact',
  navLabel: 'Contact',
  title: `Contact`,
  intro: `Heb je een vraag over je boeking of het park? De receptie helpt je graag. Je kunt ons bellen, mailen, appen of gewoon even langskomen.`,
  group: 'praktisch',
  scene: 'duinen',
  description: `Telefoonnummer, e-mail, WhatsApp, adres en openingstijden van de receptie van De Duinhoeve.`,
  sections: [
    {
      heading: `Contactgegevens`,
      bullets: [
        `Telefoon: ${COMPANY.phone}`,
        `WhatsApp: ${COMPANY.whatsapp} (we reageren tijdens openingstijden van de receptie)`,
        `E-mail: ${COMPANY.email} (antwoord binnen één werkdag)`,
        `Groepen en bedrijven: ${COMPANY.groupsEmail}`,
        `Adres: ${COMPANY.street}, ${COMPANY.postcode} ${COMPANY.city}`,
        `KvK-nummer: ${COMPANY.kvk}`,
      ],
    },
    {
      heading: `Openingstijden receptie`,
      bullets: RECEPTION_HOURS,
      paragraphs: [
        `Buiten openingstijden bereik je voor dringende zaken, zoals een lekkage, een stroomstoring of buitensluiting, de avond- en nachtdienst via het noodnummer ${COMPANY.emergencyPhone}. Bel bij levensbedreigende situaties altijd eerst 112.`,
      ],
    },
    {
      heading: `Medische hulp`,
      bullets: [
        `Huisartsenpost Westerduin (fictief), Dorpsstraat 4, op 1,8 km. Op werkdagen open van 08:00 tot 17:00 uur.`,
        `Buiten kantoortijd: de huisartsenpost in Middelburg (16 km). Bel altijd eerst.`,
        `Apotheek Westerduin (fictief), op werkdagen van 08:30 tot 18:00 uur en op zaterdag van 10:00 tot 13:00 uur.`,
        `Ziekenhuis in Vlissingen, 19 km.`,
        `Een EHBO-koffer en AED vind je bij de receptie, het zwembad en strandpaviljoen Zilt.`,
      ],
    },
    {
      heading: `Gevonden voorwerpen`,
      paragraphs: [
        `Iets laten liggen? Bel of mail de receptie. Gevonden voorwerpen bewaren we 3 maanden. Terugsturen kan tegen verzendkosten (vanaf ${euro(7.95)} binnen Nederland).`,
      ],
    },
    {
      heading: `Klachten`,
      paragraphs: [
        `Is er iets niet in orde? Meld het zo snel mogelijk tijdens je verblijf bij de receptie, dan kunnen we het meteen oplossen. Ben je na je verblijf nog niet tevreden, stuur dan binnen een maand na vertrek een e-mail naar ${COMPANY.email}. Komen we er samen niet uit, dan kun je je klacht voorleggen aan de Geschillencommissie Recreatie.`,
      ],
    },
  ],
});

const TERMS = makePage({
  slug: 'algemene-voorwaarden',
  navLabel: 'Algemene voorwaarden',
  title: `Algemene voorwaarden in het kort`,
  intro: `Op alle boekingen zijn de RECRON-voorwaarden van toepassing, aangevuld met onze eigen parkvoorwaarden. Hieronder vind je de belangrijkste punten in gewone taal. De volledige tekst sturen we mee met je bevestiging.`,
  group: 'over',
  scene: 'duinen',
  description: `Samenvatting van de algemene voorwaarden en parkvoorwaarden van De Duinhoeve.`,
  sections: [
    {
      heading: `De boeking`,
      bullets: [
        `Een boeking is definitief zodra je een bevestiging per e-mail hebt ontvangen.`,
        `Controleer de bevestiging meteen. Klopt er iets niet, meld het binnen 7 dagen.`,
        `De hoofdboeker is minimaal 21 jaar en verantwoordelijk voor alle gasten in de boeking.`,
        `Het maximale aantal personen per accommodatie mag niet worden overschreden, ook niet tijdelijk.`,
        `Het is niet toegestaan de accommodatie door te verhuren of de boeking over te dragen zonder onze toestemming.`,
      ],
    },
    {
      heading: `Prijzen en betalen`,
      bullets: [
        `Alle prijzen zijn in euro's en inclusief btw, behalve de zakelijke vergaderarrangementen.`,
        `Prijswijzigingen door overheidsmaatregelen, zoals een hogere toeristenbelasting of btw, mogen we doorberekenen.`,
        `Aanbetaling 30% binnen 7 dagen, restbetaling uiterlijk 6 weken voor aankomst.`,
        `Bij niet tijdig betalen mogen we de boeking annuleren; dan gelden de annuleringskosten.`,
      ],
    },
    {
      heading: `Aansprakelijkheid`,
      bullets: [
        `Je bent aansprakelijk voor schade die jij, je medegasten, je bezoek of je huisdier veroorzaken.`,
        `Wij zijn niet aansprakelijk voor diefstal, verlies of schade aan je eigendommen, tenzij het onze schuld is.`,
        `Gebruik van de speeltuin, het zwembad, de wellness en de sportvelden is op eigen risico.`,
        `Bij storingen in nutsvoorzieningen (water, stroom, wifi) zorgen we zo snel mogelijk voor herstel. Dat geeft geen recht op korting, tenzij de storing langer dan 24 uur duurt.`,
      ],
    },
    {
      heading: `Verwijdering`,
      paragraphs: [
        `Als gasten zich ernstig misdragen, de huisregels herhaaldelijk overtreden of de veiligheid van anderen in gevaar brengen, kunnen we ze vragen het park te verlaten. Je krijgt dan de huur niet terug.`,
      ],
    },
    {
      heading: `Geschillen`,
      paragraphs: [
        `Op alle overeenkomsten is Nederlands recht van toepassing. Een klacht meld je eerst bij ons. Komen we er niet samen uit, dan kun je binnen 12 maanden na vertrek naar de Geschillencommissie Recreatie.`,
      ],
    },
  ],
});

const PRIVACY = makePage({
  slug: 'privacy',
  navLabel: 'Privacy',
  title: `Privacyverklaring`,
  intro: `We gaan zorgvuldig om met je gegevens. In deze verklaring lees je welke gegevens we verzamelen, waarom we dat doen en wat je rechten zijn.`,
  group: 'over',
  scene: 'duinen',
  description: `Privacyverklaring van Vakantiepark De Duinhoeve: welke gegevens we bewaren en waarom.`,
  sections: [
    {
      heading: `Welke gegevens we verzamelen`,
      bullets: [
        `Naam, adres, telefoonnummer en e-mailadres van de hoofdboeker`,
        `Namen en geboortedata van medegasten (voor de toeristenbelasting en het nachtregister, wettelijk verplicht)`,
        `Gegevens over je verblijf, betalingen en eventuele wensen`,
        `Kenteken van je auto, voor de slagboom`,
        `Camerabeelden bij de slagboom, de receptie en de parkeerplaatsen`,
      ],
    },
    {
      heading: `Waarom we ze gebruiken`,
      bullets: [
        `Om je boeking uit te voeren en contact met je op te nemen over je verblijf`,
        `Om te voldoen aan wettelijke verplichtingen, zoals het nachtregister en de belastingadministratie`,
        `Om de veiligheid op het park te bewaken`,
        `Om je onze nieuwsbrief te sturen, alleen als je daar toestemming voor geeft`,
      ],
    },
    {
      heading: `Hoe lang we ze bewaren`,
      table: {
        columns: ['Gegevens', 'Bewaartermijn'],
        rows: [
          ['Boekings- en factuurgegevens', '7 jaar (wettelijke fiscale bewaarplicht)'],
          ['Nachtregister', '1 jaar na vertrek'],
          ['Camerabeelden', '4 weken, tenzij er een incident is'],
          ['Kentekens', '30 dagen na vertrek'],
          ['Nieuwsbrief', 'tot je je afmeldt'],
          ['Chatgesprekken met onze websitechatbot', '90 dagen'],
        ],
      },
    },
    {
      heading: `Je rechten`,
      paragraphs: [
        `Je hebt het recht om je gegevens in te zien, te laten aanpassen of te laten verwijderen, voor zover we ze niet wettelijk moeten bewaren. Stuur je verzoek naar ${COMPANY.privacyEmail}; we reageren binnen 4 weken. Ben je het niet eens met hoe we met je gegevens omgaan, dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens.`,
        `We delen je gegevens alleen met partijen die we nodig hebben voor je verblijf, zoals ons boekingssysteem, de betaalprovider en, als je die afsluit, de annuleringsverzekeraar. We verkopen nooit gegevens aan derden.`,
      ],
    },
    {
      heading: `Cookies`,
      paragraphs: [
        `Onze website gebruikt functionele cookies om de site goed te laten werken en analytische cookies om anoniem te meten hoe de site wordt gebruikt. Marketingcookies plaatsen we alleen met je toestemming.`,
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Alle pagina's
// ---------------------------------------------------------------------------

export const ACCOMMODATION_PAGES: SitePage[] = ACCOMMODATIONS.map(accommodationPage);

export const SITE_PAGES: SitePage[] = [
  HOME,
  ACCOMMODATIONS_OVERVIEW,
  ...ACCOMMODATION_PAGES,
  GROUPS,
  DEALS,
  PRICES,
  BOOKING,
  CANCELLATION,
  ARRIVAL,
  PETS,
  FACILITIES,
  POOL,
  FOOD,
  ACTIVITIES,
  AREA,
  DIRECTIONS,
  SUSTAINABILITY,
  ACCESSIBILITY,
  HOUSE_RULES,
  FAQ,
  CONTACT,
  ABOUT,
  JOBS,
  TERMS,
  PRIVACY,
];

/** Hoofdnavigatie (header). */
export const MAIN_NAV: Array<{ slug: string; label: string }> = [
  { slug: 'accommodaties', label: 'Accommodaties' },
  { slug: 'prijzen', label: 'Prijzen' },
  { slug: 'faciliteiten', label: 'Faciliteiten' },
  { slug: 'restaurant-en-strandpaviljoen', label: 'Eten en drinken' },
  { slug: 'activiteiten', label: 'Activiteiten' },
  { slug: 'omgeving', label: 'Omgeving' },
  { slug: 'veelgestelde-vragen', label: 'Vragen' },
  { slug: 'contact', label: 'Contact' },
];

export const PAGE_GROUP_LABELS: Record<SitePageGroup, string> = {
  verblijf: 'Verblijven',
  park: 'Op het park',
  praktisch: 'Praktisch',
  over: 'Over ons',
};

export function getPageBySlug(slug: string): SitePage | undefined {
  return SITE_PAGES.find((p) => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Platte tekst voor de kennisbank
// ---------------------------------------------------------------------------

/**
 * Zet een pagina om naar schone platte tekst voor de chatbot-kennisbank.
 * Bevat alles wat als content zichtbaar is: titel, intro, kopjes, alinea's,
 * opsommingen, tabelrijen als leesbare regels, vragen en antwoorden en reviews.
 */
export function pageToPlainText(page: SitePage): string {
  const out: string[] = [];
  out.push(page.title);
  out.push(page.intro);

  for (const section of page.sections) {
    out.push('');
    out.push(`## ${section.heading}`);
    for (const p of section.paragraphs ?? []) out.push(p);
    for (const b of section.bullets ?? []) out.push(`- ${b}`);
    if (section.table) {
      const { columns, rows } = section.table;
      for (const row of rows) {
        const [first, ...rest] = row;
        const parts = rest.map((cell, i) => {
          const col = columns[i + 1];
          return col ? `${col}: ${cell}` : cell;
        });
        out.push(`- ${first}${parts.length ? ` | ${parts.join(' | ')}` : ''}`);
      }
    }
    for (const item of section.faq ?? []) {
      out.push(`Vraag: ${item.q}`);
      out.push(`Antwoord: ${item.a}`);
    }
    for (const quote of section.quotes ?? []) {
      out.push(`"${quote.text}" (${quote.author})`);
    }
  }

  return out.join('\n').trim();
}
