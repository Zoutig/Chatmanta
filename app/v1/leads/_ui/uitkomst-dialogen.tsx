'use client';

import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { Chips, Dialoog } from './dialoog';
import { BEZWAREN, BEZWAAR_LABEL, NIET_BELLEN_REDENEN, NIET_BELLEN_LABEL, type Bezwaar, type NietBellenReden } from '@/lib/leads/types';
import type { UitkomstOpties } from '@/lib/leads/volgende-stand';
import { amsDelen, amsTijdstip, plusMaandenOm, plusWerkdagenOm } from '@/lib/leads/werkdagen';
import { maakIcs } from '@/lib/leads/ics';

export type DialoogSoort = 'niet_opgenomen_laatste' | 'terugbellen' | 'interesse' | 'geen_interesse' | 'niet_bellen' | null;

/** "2026-10-19T14:00" (datetime-local, Amsterdam) ↔ ISO */
function naarLokaal(d: Date): string {
  const p = amsDelen(d);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.jaar}-${z(p.maand)}-${z(p.dag)}T${z(p.uur)}:${z(p.minuut)}`;
}
function vanLokaal(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return amsTijdstip(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString();
}

export function UitkomstDialogen({
  soort,
  bedrijfsnaam,
  telefoonTekst,
  notitie,
  leadId,
  onSluit,
  onKies,
}: {
  soort: DialoogSoort;
  bedrijfsnaam: string;
  telefoonTekst: string;
  notitie: string | null;
  leadId: string;
  onSluit: () => void;
  onKies: (o: UitkomstOpties) => void;
}) {
  const nu = new Date();
  const [moment, setMoment] = useState(naarLokaal(plusWerkdagenOm(nu, 1, 10)));
  const [terugNotitie, setTerugNotitie] = useState('');
  const [mail, setMail] = useState(true);
  const [km, setKm] = useState(false);
  const [kmMoment, setKmMoment] = useState(naarLokaal(plusWerkdagenOm(nu, 2, 10)));
  const [bezwaar, setBezwaar] = useState<Bezwaar | null>(null);
  const [reden, setReden] = useState<NietBellenReden | null>(null);

  const snel: { label: string; op: Date }[] = [
    { label: 'Over 2 uur', op: new Date(nu.getTime() + 2 * 3600_000) },
    { label: 'Morgen', op: plusWerkdagenOm(nu, 1, 10) },
    { label: 'Volgende week', op: plusWerkdagenOm(nu, 5, 10) },
    { label: 'Over 3 maanden', op: plusMaandenOm(nu, 3, 10) },
  ];

  function downloadIcs() {
    const op = vanLokaal(kmMoment);
    if (!op) return;
    const ics = maakIcs({
      uid: `${leadId}-${op}`,
      start: new Date(op),
      duurMinuten: 30,
      titel: `Kennismaking ${bedrijfsnaam}`,
      beschrijving: `Tel: ${telefoonTekst}${notitie ? `\nNotitie: ${notitie}` : ''}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kennismaking-${bedrijfsnaam.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Dialoog
        open={soort === 'niet_opgenomen_laatste'}
        titel="Derde keer niet opgenomen"
        onSluit={onSluit}
        voet={
          <>
            <Button variant="secondary" onClick={() => onKies({ uitkomst: 'niet_opgenomen', naDerde: 'archief' })}>Archiveren</Button>
            <Button onClick={() => onKies({ uitkomst: 'niet_opgenomen', naDerde: 'mail' })}>Mail sturen</Button>
          </>
        }
      >
        <p>Drie keer geprobeerd. Een mail sturen of deze lead archiveren?</p>
      </Dialoog>

      <Dialoog
        open={soort === 'terugbellen'}
        titel="Terugbellen"
        onSluit={onSluit}
        voet={
          <Button
            onClick={() => {
              const op = vanLokaal(moment);
              if (op) onKies({ uitkomst: 'terugbellen', op, notitie: terugNotitie });
            }}
          >
            Opslaan
          </Button>
        }
      >
        <div className="ld-chips">
          {snel.map((s) => (
            <button key={s.label} type="button" className="ld-chip" aria-pressed={moment === naarLokaal(s.op)} onClick={() => setMoment(naarLokaal(s.op))}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="v1-field">
          <span className="v1-label">Moment</span>
          <input className="v1-input" type="datetime-local" value={moment} onChange={(e) => setMoment(e.target.value)} />
        </label>
        <label className="v1-field">
          <span className="v1-label">Notitie</span>
          <input className="v1-input" value={terugNotitie} onChange={(e) => setTerugNotitie(e.target.value)} placeholder="Vraag naar Jan, na 14:00" />
        </label>
      </Dialoog>

      <Dialoog
        open={soort === 'interesse'}
        titel="Interesse"
        onSluit={onSluit}
        voet={
          <Button
            disabled={!mail && !km}
            onClick={() => onKies({ uitkomst: 'interesse', mail, kennismakingOp: km ? vanLokaal(kmMoment) : null })}
          >
            Opslaan
          </Button>
        }
      >
        <label className="v1-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> Mail sturen
        </label>
        <label className="v1-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={km} onChange={(e) => setKm(e.target.checked)} /> Kennismaking gepland
        </label>
        {km ? (
          <>
            <label className="v1-field">
              <span className="v1-label">Wanneer</span>
              <input className="v1-input" type="datetime-local" value={kmMoment} onChange={(e) => setKmMoment(e.target.value)} />
            </label>
            <Button variant="secondary" size="sm" onClick={downloadIcs}>Zet in agenda (.ics)</Button>
          </>
        ) : null}
      </Dialoog>

      <Dialoog
        open={soort === 'geen_interesse'}
        titel="Geen interesse"
        onSluit={onSluit}
        voet={
          <>
            <Button variant="secondary" onClick={() => onKies({ uitkomst: 'geen_interesse', bezwaar, opnieuwOver3Maanden: true })}>Over 3 maanden opnieuw</Button>
            <Button onClick={() => onKies({ uitkomst: 'geen_interesse', bezwaar, opnieuwOver3Maanden: false })}>Weg</Button>
          </>
        }
      >
        <p className="v1-hint">Waarom? (optioneel)</p>
        <Chips label="Bezwaar" opties={BEZWAREN.map((b) => ({ id: b, label: BEZWAAR_LABEL[b] }))} waarde={bezwaar} onKies={setBezwaar} />
      </Dialoog>

      <Dialoog
        open={soort === 'niet_bellen'}
        titel="Niet bellen"
        onSluit={onSluit}
        voet={<Button disabled={!reden} onClick={() => reden && onKies({ uitkomst: 'niet_bellen', reden })}>Opslaan</Button>}
      >
        <Chips label="Reden" opties={NIET_BELLEN_REDENEN.map((r) => ({ id: r, label: NIET_BELLEN_LABEL[r] }))} waarde={reden} onKies={setReden} />
      </Dialoog>
    </>
  );
}
