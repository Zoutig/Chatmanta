// Gedeelde types en vaste lijsten van het leads-dashboard (/v1/leads).
// Geen runtime-afhankelijkheden: veilig in client- én servercode.

export const LEAD_STATUSSEN = [
  'open',
  'terugbellen',
  'opvolgen',
  'kans',
  'klant',
  'geen_interesse',
  'niet_bellen',
  'heeft_chatbot',
  'archief',
] as const;
export type LeadStatus = (typeof LEAD_STATUSSEN)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  open: 'Open',
  terugbellen: 'Terugbellen',
  opvolgen: 'Opvolgen',
  kans: 'Kans',
  klant: 'Klant',
  geen_interesse: 'Geen interesse',
  niet_bellen: 'Niet bellen',
  heeft_chatbot: 'Heeft chatbot',
  archief: 'Archief',
};

export const UITKOMSTEN = [
  'niet_opgenomen',
  'terugbellen',
  'wil_mail',
  'interesse',
  'geen_interesse',
  'niet_bellen',
] as const;
export type Uitkomst = (typeof UITKOMSTEN)[number];

export const UITKOMST_LABEL: Record<Uitkomst, string> = {
  niet_opgenomen: 'Niet opgenomen',
  terugbellen: 'Terugbellen',
  wil_mail: 'Wil een mail',
  interesse: 'Interesse',
  geen_interesse: 'Geen interesse',
  niet_bellen: 'Niet bellen',
};

export const BEZWAREN = [
  'geen_interesse',
  'chatbots_irritant',
  'heeft_chatbot',
  'wil_mens',
  'te_duur',
  'te_klein',
  'te_ingewikkeld',
  'vertrouwt_ai_niet',
  'volgende_maand',
] as const;
export type Bezwaar = (typeof BEZWAREN)[number];

export const BEZWAAR_LABEL: Record<Bezwaar, string> = {
  geen_interesse: 'Geen interesse',
  chatbots_irritant: 'Chatbots zijn irritant',
  heeft_chatbot: 'Heeft al een chatbot',
  wil_mens: 'Klanten willen een mens',
  te_duur: 'Te duur',
  te_klein: 'Te klein',
  te_ingewikkeld: 'Te ingewikkeld',
  vertrouwt_ai_niet: 'Vertrouwt AI niet',
  volgende_maand: 'Bel volgende maand',
};

export const NIET_BELLEN_REDENEN = [
  'verkeerd_nummer',
  'geen_doelgroep',
  'al_klant',
  'bestaat_niet_meer',
  'heeft_chatbot',
] as const;
export type NietBellenReden = (typeof NIET_BELLEN_REDENEN)[number];

export const NIET_BELLEN_LABEL: Record<NietBellenReden, string> = {
  verkeerd_nummer: 'Verkeerd nummer',
  geen_doelgroep: 'Geen doelgroep',
  al_klant: 'Al klant',
  bestaat_niet_meer: 'Bestaat niet meer',
  heeft_chatbot: 'Heeft al een chatbot',
};

export const OPVOLG_SITUATIES = ['info', 'test', 'kennis', 'klaar', 'herinnering'] as const;
export type OpvolgSituatie = (typeof OPVOLG_SITUATIES)[number];

export const OPVOLG_SITUATIE_LABEL: Record<OpvolgSituatie, { titel: string; uitleg: string }> = {
  info: { titel: 'Interesse, wil meer weten', uitleg: 'Info plus aanbod van een gratis testversie' },
  test: { titel: 'Testversie afgesproken', uitleg: 'Bevestiging; jij zet hem klaar' },
  kennis: { titel: 'Wil eerst kennismaken', uitleg: 'Kort gesprek voorstellen' },
  klaar: { titel: 'Testversie staat klaar', uitleg: 'Link naar hun eigen chatbot' },
  herinnering: { titel: 'Korte herinnering', uitleg: 'Na 3 à 4 werkdagen zonder reactie' },
};

export const ACTIVITEIT_SOORTEN = ['belpoging', 'mail', 'notitie', 'status', 'kennismaking', 'import'] as const;
export type ActiviteitSoort = (typeof ACTIVITEIT_SOORTEN)[number];

/** De "stand"-kolommen van een lead: wat een uitkomst verandert en wat ongedaan maken terugzet. */
export type Stand = {
  status: LeadStatus;
  status_reden: string | null;
  volgende_actie_op: string | null; // ISO
  volgende_actie_notitie: string | null;
  pogingen_niet_opgenomen: number;
  laatste_poging_op: string | null;
  kennismaking_op: string | null;
  opvolgmail_gestuurd_op: string | null;
  opvolgmail_situatie: OpvolgSituatie | null;
};

export const STAND_KOLOMMEN = [
  'status',
  'status_reden',
  'volgende_actie_op',
  'volgende_actie_notitie',
  'pogingen_niet_opgenomen',
  'laatste_poging_op',
  'kennismaking_op',
  'opvolgmail_gestuurd_op',
  'opvolgmail_situatie',
] as const satisfies readonly (keyof Stand)[];

export function pakStand(l: Stand): Stand {
  return {
    status: l.status,
    status_reden: l.status_reden,
    volgende_actie_op: l.volgende_actie_op,
    volgende_actie_notitie: l.volgende_actie_notitie,
    pogingen_niet_opgenomen: l.pogingen_niet_opgenomen,
    laatste_poging_op: l.laatste_poging_op,
    kennismaking_op: l.kennismaking_op,
    opvolgmail_gestuurd_op: l.opvolgmail_gestuurd_op,
    opvolgmail_situatie: l.opvolgmail_situatie,
  };
}

export type Lead = Stand & {
  id: string;
  domein: string | null;
  telefoon: string | null;
  bedrijfsnaam: string;
  website_url: string | null;
  niche: string | null;
  plaats: string | null;
  provincie: string | null;
  telefoons_extra: string[];
  email: string | null;
  emails_gevonden: string[];
  contactpersoon: string | null;
  aanspreekvorm: 'je' | 'u';
  haakje: string | null;
  notitie: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  heeft_chatbot: boolean | null;
  chatbot_naam: string | null;
  platform: string | null;
  woorden: number | null;
  score: number | null;
  score_max: number | null;
  score_redenen: string[];
  score_voorlopig: boolean;
  labels: string[];
  geclaimd_door: string | null;
  geclaimd_tot: string | null;
  bron: string;
  created_at: string;
  updated_at: string;
};

/** Velden die de beller zelf mag bewerken (detail + belmodus). */
export const BEWERKBARE_VELDEN = [
  'bedrijfsnaam',
  'website_url',
  'niche',
  'plaats',
  'telefoon',
  'email',
  'contactpersoon',
  'aanspreekvorm',
  'haakje',
  'notitie',
] as const satisfies readonly (keyof Lead)[];
export type BewerkbaarVeld = (typeof BEWERKBARE_VELDEN)[number];

export type Activiteit = {
  id: string;
  lead_id: string;
  user_id: string | null;
  soort: ActiviteitSoort;
  uitkomst: Uitkomst | null;
  details: Record<string, unknown>;
  vorige_staat: Stand | null;
  ongedaan_op: string | null;
  created_at: string;
};

export type Afzender = {
  naam: string;
  voornaam: string;
  functie: string;
  telefoon: string;
  email: string;
  fotoUrl: string | null;
};

export const LABEL_TEKST: Record<string, string> = {
  keten: 'Keten/vestiging',
  generieke_naam: 'Generieke naam',
  site_onbereikbaar: 'Site onbereikbaar',
  weinig_tekst: 'Weinig tekst',
};
