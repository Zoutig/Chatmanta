import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakIcs } from '../ics';

test('maakIcs: geldige VEVENT met UTC-tijden, escaping en CRLF', () => {
  const ics = maakIcs({
    uid: 'lead-123',
    start: new Date('2026-10-20T08:00:00Z'),
    duurMinuten: 30,
    titel: 'Kennismaking Bouwbedrijf Jansen',
    beschrijving: 'Tel: 06 12345678\nNotitie: wil demo; vraag naar Jan, na 14:00',
    nu: new Date('2026-10-16T08:30:00Z'),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261020T080000Z\r\n/);
  assert.match(ics, /DTEND:20261020T083000Z\r\n/);
  assert.match(ics, /DTSTAMP:20261016T083000Z\r\n/);
  assert.match(ics, /UID:lead-123@chatmanta\.nl\r\n/);
  assert.match(ics, /DESCRIPTION:Tel: 06 12345678\\nNotitie: wil demo\\; vraag naar Jan\\, na 14:00\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
