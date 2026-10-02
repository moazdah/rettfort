import { describe, it, expect } from 'vitest';
import { parseBank } from '@/lib/motor/rettfort-motor.js';

// Eksportformater fra nettbanken til de største norske bankene (kolonnenavn og tallformat slik bankene lager dem).
const FORMATER: [string, string, number, number][] = [
  ['DNB', 'Dato;Forklaring;Rentedato;Uttak fra konto;Innskudd på konto\n03.10.2026;Varekjøp KIWI MAJORSTUEN;03.10.2026;163,80;\n05.10.2026;Innbetaling Kvam Transport AS;05.10.2026;;17 250,00', -163.8, 17250],
  ['Nordea', 'Bokføringsdato;Beløp;Avsender;Mottaker;Navn;Tittel;Saldo;Valuta\n2026/10/03;-163,80;;;KIWI;Varekjøp KIWI;9836,20;NOK\n2026/10/05;17250,00;;;Kvam Transport AS;Innbetaling;27086,20;NOK', -163.8, 17250],
  ['SpareBank 1', 'Dato;Beskrivelse;Rentedato;Inn;Ut;Til konto;Fra konto\n03.10.2026;KIWI MAJORSTUEN;03.10.2026;;-163,80;;\n05.10.2026;Kvam Transport AS;05.10.2026;17250,00;;;', -163.8, 17250],
  ['Sbanken', 'BOKFØRINGSDATO\tRENTEDATO\tARKIVREFERANSE\tTYPE\tTEKST\tUT FRA KONTO\tINN PÅ KONTO\n03.10.2026\t03.10.2026\t123\tVARER\tKIWI MAJORSTUEN\t163,80\t\n05.10.2026\t05.10.2026\t124\tGIRO\tKvam Transport AS\t\t17250,00', -163.8, 17250],
  ['Handelsbanken', 'Reskontrodato;Transaksjonsdato;Tekst;Beløp;Saldo\n2026-10-03;2026-10-03;KIWI MAJORSTUEN;-163,80;9836,20\n2026-10-05;2026-10-05;Kvam Transport AS;17 250,00;27086,20', -163.8, 17250],
  ['Danske Bank / Bulder', 'Dato;Kategori;Underkategori;Tekst;Beløp;Saldo;Status;Avstemt\n03.10.2026;Mat;Dagligvarer;KIWI MAJORSTUEN;-163,80;9836,20;Utført;Nei\n05.10.2026;Inntekt;;Kvam Transport AS;17.250,00;27086,20;Utført;Nei', -163.8, 17250],
];

describe('kontoutskrift fra nettbanken', () => {
  for (const [bank, fil, ut, inn] of FORMATER) {
    it(`${bank}: dato, tekst og beløp leses riktig`, () => {
      const k = parseBank(fil);
      expect(k.lines).toHaveLength(2);
      const [a, b] = [...k.lines].sort((x, y) => x.date.localeCompare(y.date));
      expect(a.date).toBe('2026-10-03');
      expect(a.amount).toBeCloseTo(ut, 2);
      expect(a.text).toMatch(/KIWI/);
      expect(b.amount).toBeCloseTo(inn, 2);
    });
  }
});

describe('samme motor overalt', () => {
  it('systemets motor og nettleserkopien er lik rettfort-engine.js i roten', async () => {
    const fs = await import('node:fs');
    const rot = fs.readFileSync(new URL('../../rettfort-engine.js', import.meta.url), 'utf8');
    expect(fs.readFileSync(new URL('../src/lib/motor/rettfort-motor.js', import.meta.url), 'utf8').split('\n').slice(2).join('\n')).toBe(rot);
    expect(fs.readFileSync(new URL('../public/les/rettfort-engine.js', import.meta.url), 'utf8')).toBe(rot);
  });
});
