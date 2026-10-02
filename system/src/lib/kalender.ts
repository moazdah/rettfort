// Frister som iCalendar (RFC 5545), for abonnement i Google, Apple og Outlook.

import type { Frist } from './frister';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const dt = (d: string) => d.replace(/-/g, '');

export function lagIcs(firma: string, frister: Frist[], lenke: string): string {
  const naa = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const linjer = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rettfort//Frister//NO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`Frister ${firma}`)}`, 'X-WR-TIMEZONE:Europe/Oslo', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H'];
  for (const f of frister) {
    const neste = new Date(Date.parse(f.dato + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    linjer.push('BEGIN:VEVENT', `UID:${f.id}@rettfort.no`, `DTSTAMP:${naa}`, `DTSTART;VALUE=DATE:${dt(f.dato)}`, `DTEND;VALUE=DATE:${dt(neste)}`,
      `SUMMARY:${esc(f.tittel)}`, `DESCRIPTION:${esc(`${f.beskrivelse}\n${lenke}`)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(f.tittel)}`, 'TRIGGER:-P3D', 'END:VALARM', 'END:VEVENT');
  }
  linjer.push('END:VCALENDAR');
  // Linjer over 75 oktetter brettes.
  return linjer.map(l => { const ut: string[] = []; let r = l; while (Buffer.byteLength(r) > 74) { let n = 74; while (Buffer.byteLength(r.slice(0, n)) > 74) n--; ut.push(r.slice(0, n)); r = ' ' + r.slice(n); } ut.push(r); return ut.join('\r\n'); }).join('\r\n') + '\r\n';
}
