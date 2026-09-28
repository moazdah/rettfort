// Stresstest: simulerer mange tilfeldige regnskapsår og sammenligner rapportene
// med en uavhengig fasit som føres ved siden av (uten å gå via hovedboken).

import { describe, it, expect } from 'vitest';
import { byggKjop, byggFaktura, byggInnbetaling, byggLonn, beregnAga, reverser, byggMvaOppgjor, fakturaSummer, validerBilag, type Postering } from '@/lib/hovedbok';
import { balanse, resultatregnskap, mvaMelding, saldobalanse, type PostRad } from '@/lib/rapporter';
import { splittBrutto } from '@/lib/penger';
import { konto } from '@/lib/kontoplan';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const KJOPSKONTOER = [6300, 6340, 6420, 6540, 6800, 6900, 7000, 7130, 7350, 5910, 4000, 7500];

function dato(r: () => number, ar = 2026) {
  const m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return `${ar}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const termin = (d: string) => Math.floor((Number(d.slice(5, 7)) - 1) / 2); // 0..5

describe('stresstest hovedbok', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`regnskapsår ${seed}: rapportene stemmer med fasit`, () => {
      const r = rng(seed * 7919);
      const rader: PostRad[] = [];
      let bilagNr = 0;
      const bokfor = (d: string, p: Postering[]) => { validerBilag(p); bilagNr++; for (const x of p) rader.push({ ...x, dato: d, bilagNr, mvaKode: x.mvaKode ?? null, mvaGrunnlag: x.mvaGrunnlag ?? null }); };

      const fasit = { inntekt: 0, kostnad: 0, utg: Array(6).fill(0), inng: Array(6).fill(0), kundefordring: 0, bank: 0, leverandorgjeld: 0 };
      const apneFakturaer: { total: number; kunde: string; d: string }[] = [];

      const n = 150 + Math.floor(r() * 250);
      for (let i = 0; i < n; i++) {
        const d = dato(r);
        const t = termin(d);
        const valg = r();
        if (valg < 0.4) {
          // Kjøp
          const kontoNr = KJOPSKONTOER[Math.floor(r() * KJOPSKONTOER.length)];
          const def = konto(kontoNr)!;
          const sats = def.mvaKjop === '13' ? 12 : def.mvaKjop === '11' ? 15 : def.mvaKjop === '0' ? 0 : [25, 25, 25, 15, 12][Math.floor(r() * 5)];
          const brutto = 100 + Math.floor(r() * 5_000_000);
          const betaltMed = r() < 0.7 ? 'bank' : 'ubetalt';
          const p = byggKjop({ linjer: [{ konto: kontoNr, brutto, sats }], betaltMed, kontaktId: 'L', mvaRegistrert: true });
          bokfor(d, p);
          const fradrag = !def.ikkeFradrag && sats > 0;
          const { netto, mva } = fradrag ? splittBrutto(brutto, sats) : { netto: brutto, mva: 0 };
          fasit.kostnad += netto; fasit.inng[t] += mva;
          if (betaltMed === 'bank') fasit.bank -= brutto; else fasit.leverandorgjeld += brutto;
        } else if (valg < 0.75) {
          // Faktura
          const linjer = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ beskrivelse: 'x', antallMilli: 250 + Math.floor(r() * 20000), pris: 100 + Math.floor(r() * 300000), sats: [25, 25, 15, 12, 0][Math.floor(r() * 5)] }));
          const s = fakturaSummer(linjer, true);
          const betaltNa = r() < 0.15;
          bokfor(d, byggFaktura({ linjer, mvaRegistrert: true, kontaktId: 'K', betaltNa }));
          fasit.inntekt += s.netto; fasit.utg[t] += s.mva;
          if (betaltNa) fasit.bank += s.total; else { fasit.kundefordring += s.total; apneFakturaer.push({ total: s.total, kunde: 'K', d }); }
        } else if (valg < 0.85 && apneFakturaer.length) {
          // Innbetaling
          const f = apneFakturaer.splice(Math.floor(r() * apneFakturaer.length), 1)[0];
          const dd = d > f.d ? d : f.d;
          bokfor(dd, byggInnbetaling(f.total, f.kunde));
          fasit.kundefordring -= f.total; fasit.bank += f.total;
        } else if (valg < 0.92) {
          // Lønn
          const brutto = 2_000_000 + Math.floor(r() * 6_000_000);
          const skatt = Math.floor(brutto * (0.2 + r() * 0.2));
          const ferie = Math.round(brutto * 0.102);
          const sats = [14.1, 10.6, 6.4, 5.1, 7.9, 0][Math.floor(r() * 6)];
          bokfor(d, byggLonn([{ brutto, skattetrekk: skatt, feriepenger: ferie, agaSats: sats }]));
          fasit.kostnad += brutto + ferie + beregnAga(brutto, sats) + beregnAga(ferie, sats);
          fasit.bank -= brutto - skatt;
        } else {
          // Korrigering: reverser et tidligere kjøp og før det på nytt (resultat uendret)
          const p = byggKjop({ linjer: [{ konto: 6800, brutto: 12500, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true });
          bokfor(d, p);
          bokfor(d, reverser(p));
        }
      }

      // 1) Balansen går alltid opp, på tilfeldige datoer gjennom året
      for (let k = 0; k < 12; k++) expect(balanse(rader, dato(r)).differanse).toBe(0);
      expect(balanse(rader, '2026-12-31').differanse).toBe(0);

      // 2) Resultatet stemmer med fasit
      const res = resultatregnskap(rader, '2026-01-01', '2026-12-31');
      expect(res.inntekter).toBe(fasit.inntekt);
      expect(res.kostnader).toBe(fasit.kostnad);
      expect(res.resultat).toBe(fasit.inntekt - fasit.kostnad);

      // 3) Saldoer
      const sb = saldobalanse(rader);
      expect(sb.get(1500)?.saldo ?? 0).toBe(fasit.kundefordring);
      expect(sb.get(1920)?.saldo ?? 0).toBe(fasit.bank);
      expect(-(sb.get(2400)?.saldo ?? 0)).toBe(fasit.leverandorgjeld);

      // 4) MVA-meldingen per termin stemmer med fasit og med MVA-kontoene
      const grenser = [['01-01', '02-28'], ['03-01', '04-30'], ['05-01', '06-30'], ['07-01', '08-31'], ['09-01', '10-31'], ['11-01', '12-31']];
      grenser.forEach(([fra, til], i) => {
        const m = mvaMelding(rader, `2026-${fra}`, `2026-${til}`);
        expect(m.utgaende).toBe(fasit.utg[i]);
        expect(m.inngaende).toBe(fasit.inng[i]);
        const sbT = saldobalanse(rader, `2026-${fra}`, `2026-${til}`);
        expect(m.aBetale).toBe(-((sbT.get(2700)?.saldo ?? 0) + (sbT.get(2710)?.saldo ?? 0)));
        // Grunnlaget for 25 % utgående skal gi MVA innen avrunding per faktura
        const l3 = m.linjer.find(l => l.kode === '3');
        if (l3) expect(Math.abs(l3.mva - Math.round(l3.grunnlag * 0.25))).toBeLessThanOrEqual(n);
      });

      // 5) MVA-oppgjør for en termin nuller kontoene
      const sbT1 = saldobalanse(rader, '2026-01-01', '2026-02-28');
      const s27 = sbT1.get(2700)?.saldo ?? 0, s2710 = sbT1.get(2710)?.saldo ?? 0;
      if (s27 !== 0 || s2710 !== 0) {
        bokfor('2026-02-28', byggMvaOppgjor(s27, s2710));
        const etter = saldobalanse(rader, '2026-01-01', '2026-02-28');
        expect(etter.get(2700)?.saldo ?? 0).toBe(0);
        expect(etter.get(2710)?.saldo ?? 0).toBe(0);
        expect(balanse(rader, '2026-12-31').differanse).toBe(0);
      }
    });
  }
});
