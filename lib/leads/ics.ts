// Minimale iCalendar-afspraak (RFC 5545) voor "Zet in agenda". Geen library.

function stempel(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function maakIcs(o: {
  uid: string;
  start: Date;
  duurMinuten: number;
  titel: string;
  beschrijving: string;
  nu?: Date;
}): string {
  const eind = new Date(o.start.getTime() + o.duurMinuten * 60_000);
  const regels = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChatManta//Leads//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.uid}@chatmanta.nl`,
    `DTSTAMP:${stempel(o.nu ?? new Date())}`,
    `DTSTART:${stempel(o.start)}`,
    `DTEND:${stempel(eind)}`,
    `SUMMARY:${escIcs(o.titel)}`,
    `DESCRIPTION:${escIcs(o.beschrijving)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return regels.join('\r\n') + '\r\n';
}
