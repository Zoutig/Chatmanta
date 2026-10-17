// Alle regels "wat gebeurt er na uitkomst X" op één plek, puur en getest.
// De server action past alleen het resultaat toe en logt `details`.

import type { Bezwaar, NietBellenReden, OpvolgSituatie, Stand } from './types';
import { isOchtend, plusMaandenOm, plusWerkdagenOm, volgendeWerkdagOm } from './werkdagen';

export const MAX_POGINGEN = 3;

export type UitkomstOpties =
  | { uitkomst: 'niet_opgenomen'; voicemail?: boolean; naDerde?: 'mail' | 'archief' }
  | { uitkomst: 'terugbellen'; op: string; notitie?: string | null }
  | { uitkomst: 'wil_mail' }
  | { uitkomst: 'interesse'; mail: boolean; kennismakingOp: string | null }
  | { uitkomst: 'geen_interesse'; bezwaar: Bezwaar | null; opnieuwOver3Maanden: boolean }
  | { uitkomst: 'niet_bellen'; reden: NietBellenReden };

export type Overgang = {
  stand: Stand;
  details: Record<string, unknown>;
  /** Welke opvolgmail-situatie de UI meteen moet openen (of null). */
  opentMail: OpvolgSituatie | null;
  /** True als er een kennismaking is gepland (extra activiteit 'kennismaking'). */
  kennismaking: boolean;
};

export function isLaatstePoging(s: Pick<Stand, 'pogingen_niet_opgenomen'>): boolean {
  return s.pogingen_niet_opgenomen + 1 >= MAX_POGINGEN;
}

function geldigeDatum(iso: string, fout: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(fout);
  return d;
}

export function volgendeStand(huidig: Stand, o: UitkomstOpties, nu: Date): Overgang {
  const basis: Stand = {
    ...huidig,
    laatste_poging_op: nu.toISOString(),
    volgende_actie_notitie: null,
    status_reden: null,
    // Elke uitkomst behalve niet_opgenomen betekent contact: teller terug naar 0.
    pogingen_niet_opgenomen: 0,
  };
  const zonder = { opentMail: null, kennismaking: false } as const;

  switch (o.uitkomst) {
    case 'niet_opgenomen': {
      const poging = huidig.pogingen_niet_opgenomen + 1; // uit huidig: basis zet de teller op 0
      const details = { voicemail: Boolean(o.voicemail), poging };
      if (poging >= MAX_POGINGEN) {
        if (o.naDerde === 'mail') {
          return {
            stand: { ...basis, pogingen_niet_opgenomen: poging, status: 'opvolgen', volgende_actie_op: nu.toISOString() },
            details: { ...details, naDerde: 'mail' },
            opentMail: 'info',
            kennismaking: false,
          };
        }
        if (o.naDerde === 'archief') {
          return {
            stand: {
              ...basis,
              pogingen_niet_opgenomen: poging,
              status: 'archief',
              status_reden: '3x niet opgenomen',
              volgende_actie_op: null,
            },
            details: { ...details, naDerde: 'archief' },
            ...zonder,
          };
        }
        throw new Error('Bij de laatste poging is een keuze nodig: mail sturen of archiveren.');
      }
      const volgende = isOchtend(nu) ? volgendeWerkdagOm(nu, 13) : volgendeWerkdagOm(nu, 9);
      return {
        stand: { ...basis, pogingen_niet_opgenomen: poging, status: 'open', volgende_actie_op: volgende.toISOString() },
        details,
        ...zonder,
      };
    }

    case 'terugbellen': {
      const op = geldigeDatum(o.op, 'Kies een moment in de toekomst.');
      if (op.getTime() <= nu.getTime()) throw new Error('Kies een moment in de toekomst.');
      const notitie = o.notitie?.trim() || null;
      return {
        stand: { ...basis, status: 'terugbellen', volgende_actie_op: op.toISOString(), volgende_actie_notitie: notitie },
        details: { op: op.toISOString(), notitie },
        ...zonder,
      };
    }

    case 'wil_mail':
      return {
        stand: { ...basis, status: 'opvolgen', volgende_actie_op: plusWerkdagenOm(nu, 3, 10).toISOString() },
        details: {},
        opentMail: 'info',
        kennismaking: false,
      };

    case 'interesse': {
      if (!o.mail && !o.kennismakingOp) throw new Error('Kies mail sturen, kennismaking of allebei.');
      let km: string | null = null;
      if (o.kennismakingOp) {
        const d = geldigeDatum(o.kennismakingOp, 'Ongeldige datum voor de kennismaking.');
        if (d.getTime() <= nu.getTime()) throw new Error('Kies een moment in de toekomst.');
        km = d.toISOString();
      }
      return {
        stand: {
          ...basis,
          status: 'kans',
          kennismaking_op: km ?? huidig.kennismaking_op,
          volgende_actie_op: km ?? plusWerkdagenOm(nu, 3, 10).toISOString(),
        },
        details: { mail: o.mail, kennismaking_op: km },
        opentMail: o.mail ? (km ? 'kennis' : 'info') : null,
        kennismaking: km !== null,
      };
    }

    case 'geen_interesse': {
      const details = { bezwaar: o.bezwaar ?? null, opnieuw: o.opnieuwOver3Maanden };
      if (o.opnieuwOver3Maanden) {
        return {
          stand: {
            ...basis,
            status: 'terugbellen',
            status_reden: o.bezwaar ?? null,
            volgende_actie_op: plusMaandenOm(nu, 3, 10).toISOString(),
            volgende_actie_notitie: 'Over 3 maanden opnieuw proberen',
          },
          details,
          ...zonder,
        };
      }
      return {
        stand: { ...basis, status: 'geen_interesse', status_reden: o.bezwaar ?? null, volgende_actie_op: null },
        details,
        ...zonder,
      };
    }

    case 'niet_bellen':
      return {
        stand: {
          ...basis,
          status: o.reden === 'heeft_chatbot' ? 'heeft_chatbot' : 'niet_bellen',
          status_reden: o.reden,
          volgende_actie_op: null,
        },
        details: { reden: o.reden },
        ...zonder,
      };

    default: {
      const nooit: never = o;
      throw new Error(`Onbekende uitkomst: ${JSON.stringify(nooit)}`);
    }
  }
}

/** Na "Verstuurd? → ja" in de mail-pop-up. */
export function naMailVerstuurd(huidig: Stand, situatie: OpvolgSituatie, nu: Date): Stand {
  const blijft = huidig.status === 'kans' || huidig.status === 'klant';
  const kmToekomst = huidig.kennismaking_op && new Date(huidig.kennismaking_op).getTime() > nu.getTime();
  return {
    ...huidig,
    status: blijft ? huidig.status : 'opvolgen',
    opvolgmail_gestuurd_op: nu.toISOString(),
    opvolgmail_situatie: situatie,
    volgende_actie_op:
      huidig.status === 'kans' && kmToekomst ? huidig.kennismaking_op : plusWerkdagenOm(nu, 3, 10).toISOString(),
  };
}

export type HandmatigeStatus = 'open' | 'archief' | 'niet_bellen' | 'klant' | 'geen_interesse';

/** Knoppen in lijst/detail: archiveren, terug naar open, klant geworden, afgehaakt, niet bellen. */
export function handmatigeStatus(huidig: Stand, naar: HandmatigeStatus, reden: string | null = null): Stand {
  return {
    ...huidig,
    status: naar,
    status_reden: reden,
    volgende_actie_op: null,
    volgende_actie_notitie: null,
    pogingen_niet_opgenomen: naar === 'open' ? 0 : huidig.pogingen_niet_opgenomen,
  };
}
