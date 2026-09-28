import { describe, it, expect } from 'vitest';
import { tilOre, kr, splittBrutto, mvaAvNetto } from '@/lib/penger';
import { mod10, mod11, lagKid, gyldigKid, fakturanrFraKid } from '@/lib/kid';
import { sokKonto, kontoType, KONTOPLAN } from '@/lib/kontoplan';
import { sjekkMvaMotTotal, gjettSats } from '@/lib/mva';
import { byggKjop, byggFaktura, fakturaSummer, byggInnbetaling, reverser, validerBilag, byggMvaOppgjor, byggLonn, beregnAga, byggApningsbalanse, byggBankPost, RegnskapsFeil } from '@/lib/hovedbok';

describe('penger', () => {
  it('tolker norske beløp', () => {
    expect(tilOre('1 234,50')).toBe(123450);
    expect(tilOre('1234.5')).toBe(123450);
    expect(tilOre('1.234,56')).toBe(123456);
    expect(tilOre('1,234.56')).toBe(123456);
    expect(tilOre('12 000')).toBe(1200000);
    expect(tilOre('1.234')).toBe(123400);
    expect(tilOre('-12,00')).toBe(-1200);
    expect(tilOre('12,00-')).toBe(-1200);
    expect(tilOre('(99,90)')).toBe(-9990);
    expect(tilOre('kr 99')).toBe(9900);
    expect(tilOre('abc')).toBeNull();
    expect(tilOre('')).toBeNull();
    expect(tilOre('0,1')).toBe(10);
  });
  it('formaterer norsk', () => {
    expect(kr(1725000)).toBe('17 250,00');
    expect(kr(-4490)).toBe('−44,90');
    expect(kr(5)).toBe('0,05');
  });
  it('går rundt: tilOre(kr(x)) = x for 20 000 tilfeldige beløp', () => {
    for (let i = 0; i < 20000; i++) {
      const x = Math.round((Math.random() - 0.3) * 1e11);
      expect(tilOre(kr(x).replace('−', '-'))).toBe(x);
    }
  });
  it('splitter brutto slik at netto + MVA = brutto (Telenor-eksempelet fra spesifikasjonen)', () => {
    expect(splittBrutto(44900, 25)).toEqual({ netto: 35920, mva: 8980 });
    for (let i = 0; i < 50000; i++) {
      const b = Math.floor(Math.random() * 1e9);
      for (const s of [25, 15, 12, 0]) {
        const { netto, mva } = splittBrutto(b, s);
        expect(netto + mva).toBe(b);
        // MVA skal aldri avvike mer enn en halv øre fra eksakt verdi
        expect(Math.abs(mva - (b * s) / (100 + s))).toBeLessThanOrEqual(0.5);
      }
    }
  });
  it('MVA av netto', () => {
    expect(mvaAvNetto(1380000, 25)).toBe(345000);
    expect(mvaAvNetto(33, 25)).toBe(8); // 8,25 → 8
    expect(mvaAvNetto(2, 25)).toBe(1); // 0,5 → 1 (halv opp)
  });
});

describe('KID', () => {
  it('MOD10 kjent fasit', () => {
    expect(mod10('7992739871')).toBe('3');
    expect(mod10('100230042')).toBe('2');
  });
  it('MOD11 kjent fasit', () => {
    expect(mod11('1234567890')).toBe('3');
  });
  it('lager KID som i prototypen: faktura 10023, kunde 42 → 1002300422', () => {
    expect(lagKid(10023, 42)).toBe('1002300422');
    expect(gyldigKid('1002300422')).toBe(true);
    expect(gyldigKid('1002300423')).toBe(false);
    expect(fakturanrFraKid('1002300422')).toBe(10023);
  });
  it('fanger alle enkeltsifferfeil og de fleste ombyttinger', () => {
    let fanget = 0, total = 0;
    for (let i = 0; i < 3000; i++) {
      const kid = lagKid(1 + Math.floor(Math.random() * 999999), Math.floor(Math.random() * 10000));
      expect(gyldigKid(kid)).toBe(true);
      expect(fakturanrFraKid(kid)).toBe(Number(kid.slice(0, -5)));
      const pos = Math.floor(Math.random() * kid.length);
      const feil = kid.slice(0, pos) + String((Number(kid[pos]) + 1 + Math.floor(Math.random() * 9)) % 10) + kid.slice(pos + 1);
      // Enkeltsifferfeil skal alltid fanges av MOD10 (men gyldigKid godtar også MOD11, så sjekk MOD10 direkte)
      expect(mod10(feil.slice(0, -1)) === feil.slice(-1)).toBe(false);
      total++; if (!gyldigKid(feil)) fanget++;
    }
    expect(fanget).toBe(total);
  });
  it('MOD11-KID er alltid gyldig', () => {
    for (let i = 0; i < 5000; i++) {
      const kid = lagKid(1 + Math.floor(Math.random() * 99999), Math.floor(Math.random() * 10000), 'mod11');
      const g = kid.slice(0, -1);
      expect(mod11(g) ?? '-').toBe(kid.slice(-1));
      expect(gyldigKid(kid, 'mod11')).toBe(true);
    }
  });
});

describe('kontoplan', () => {
  it('finner konto med vanlige ord', () => {
    expect(sokKonto('strøm')[0].nr).toBe(6340);
    expect(sokKonto('kaffe')[0].nr).toBe(5910);
    expect(sokKonto('circle k')[0].nr).toBe(7000);
    expect(sokKonto('telenor')[0].nr).toBe(6900);
    expect(sokKonto('6800')[0].nr).toBe(6800);
    expect(sokKonto('verktøy')[0].nr).toBe(6500);
    expect(sokKonto('xyzzy')).toEqual([]);
    expect(sokKonto('a').length).toBeLessThanOrEqual(8);
  });
  it('har unike kontonumre og riktig type', () => {
    const nr = KONTOPLAN.map(k => k.nr);
    expect(new Set(nr).size).toBe(nr.length);
    expect(kontoType(1920)).toBe('eiendel');
    expect(kontoType(2400)).toBe('gjeld');
    expect(kontoType(3000)).toBe('inntekt');
    expect(kontoType(6800)).toBe('kostnad');
  });
});

describe('MVA-sjekk', () => {
  it('MVA ≈ 20 % av total ved 25 %', () => {
    expect(sjekkMvaMotTotal(44900, 8980, 25).ok).toBe(true);
    expect(sjekkMvaMotTotal(44900, 11225, 25).ok).toBe(false); // 25 % av total er en vanlig feil
  });
  it('gjetter sats', () => {
    expect(gjettSats(44900, 8980)).toBe(25);
    expect(gjettSats(11500, 1500)).toBe(15);
    expect(gjettSats(11200, 1200)).toBe(12);
    expect(gjettSats(10000, 0)).toBe(0);
    expect(gjettSats(10000, 3333)).toBeNull();
  });
});

const sumD = (p: { debet: number }[]) => p.reduce((s, x) => s + x.debet, 0);
const sumK = (p: { kredit: number }[]) => p.reduce((s, x) => s + x.kredit, 0);

describe('hovedbok', () => {
  it('kjøp Telenor 449 kr gir posteringene i spesifikasjonen', () => {
    const p = byggKjop({ linjer: [{ konto: 6900, brutto: 44900, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true });
    const f = (k: number) => p.find(x => x.konto === k)!;
    expect(f(6900).debet).toBe(35920);
    expect(f(2710).debet).toBe(8980);
    expect(f(1920).kredit).toBe(44900);
    expect(f(6900).mvaKode).toBe('1');
  });
  it('representasjon gir ikke fradrag for MVA', () => {
    const p = byggKjop({ linjer: [{ konto: 7350, brutto: 69900, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true });
    expect(p.find(x => x.konto === 2710)).toBeUndefined();
    expect(p.find(x => x.konto === 7350)!.debet).toBe(69900);
  });
  it('ikke MVA-registrert: hele beløpet til kostnad', () => {
    const p = byggKjop({ linjer: [{ konto: 6800, brutto: 12500, sats: 25 }], betaltMed: 'ubetalt', kontaktId: 'L1', mvaRegistrert: false });
    expect(p.find(x => x.konto === 6800)!.debet).toBe(12500);
    expect(p.find(x => x.konto === 2400)!.kontaktId).toBe('L1');
  });
  it('delt kjøp på flere kontoer går i null', () => {
    const p = byggKjop({ linjer: [{ konto: 6800, brutto: 10000, sats: 25 }, { konto: 5910, brutto: 5000, sats: 15 }, { konto: 7130, brutto: 3360, sats: 12 }], betaltMed: 'bank', mvaRegistrert: true });
    expect(sumD(p)).toBe(sumK(p));
    expect(p.find(x => x.konto === 1920)!.kredit).toBe(18360);
  });
  it('faktura fra prototypen: 12 × 1 150 kr + 25 % = 17 250 kr', () => {
    const linjer = [{ beskrivelse: 'Konsulenttimer september', antallMilli: 12000, pris: 115000, sats: 25 }];
    const s = fakturaSummer(linjer, true);
    expect(s).toMatchObject({ netto: 1380000, mva: 345000, total: 1725000 });
    const p = byggFaktura({ linjer, mvaRegistrert: true, kontaktId: 'K1' });
    expect(p.find(x => x.konto === 1500)!.debet).toBe(1725000);
    expect(p.find(x => x.konto === 3000)!.kredit).toBe(1380000);
    expect(p.find(x => x.konto === 2700)!.kredit).toBe(345000);
    expect(p.find(x => x.konto === 2700)!.mvaKode).toBe('3');
  });
  it('faktura med blandede satser og desimalt antall', () => {
    const linjer = [
      { beskrivelse: 'Timer', antallMilli: 1500, pris: 99900, sats: 25 },
      { beskrivelse: 'Mat', antallMilli: 3000, pris: 3333, sats: 15 },
      { beskrivelse: 'Fritatt', antallMilli: 1000, pris: 50000, sats: 0 },
    ];
    const s = fakturaSummer(linjer, true);
    expect(s.netto).toBe(149850 + 9999 + 50000);
    expect(s.mva).toBe(Math.round(149850 * 0.25) + Math.round(9999 * 0.15));
    const p = byggFaktura({ linjer, mvaRegistrert: true, kontaktId: 'K1' });
    expect(sumD(p)).toBe(s.total);
    expect(p.find(x => x.konto === 3100)!.mvaKode).toBe('5');
  });
  it('ikke MVA-registrert faktura har ingen MVA', () => {
    const s = fakturaSummer([{ beskrivelse: 'x', antallMilli: 1000, pris: 10000, sats: 25 }], false);
    expect(s.mva).toBe(0);
  });
  it('kreditnota er speilet av fakturaen', () => {
    const linjer = [{ beskrivelse: 'x', antallMilli: 2000, pris: 12345, sats: 25 }];
    const f = byggFaktura({ linjer, mvaRegistrert: true, kontaktId: 'K' });
    const kn = byggFaktura({ linjer, mvaRegistrert: true, kontaktId: 'K', kreditnota: true });
    for (const x of f) {
      const y = kn.find(z => z.konto === x.konto)!;
      expect(y.debet).toBe(x.kredit);
      expect(y.kredit).toBe(x.debet);
    }
  });
  it('reversering nuller ut', () => {
    const p = byggKjop({ linjer: [{ konto: 6800, brutto: 12345, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true });
    const r = reverser(p);
    const saldo = new Map<number, number>();
    for (const x of [...p, ...r]) saldo.set(x.konto, (saldo.get(x.konto) ?? 0) + x.debet - x.kredit);
    for (const v of saldo.values()) expect(v).toBe(0);
  });
  it('avviser ubalanserte og ugyldige bilag', () => {
    expect(() => validerBilag([{ konto: 1920, debet: 100, kredit: 0 }, { konto: 3000, debet: 0, kredit: 99 }])).toThrow(RegnskapsFeil);
    expect(() => validerBilag([{ konto: 1920, debet: 100, kredit: 100 }, { konto: 3000, debet: 0, kredit: 0 }])).toThrow(RegnskapsFeil);
    expect(() => validerBilag([{ konto: 1920, debet: 100, kredit: 0 }])).toThrow(RegnskapsFeil);
    expect(() => validerBilag([{ konto: 1920, debet: 10.5, kredit: 0 }, { konto: 3000, debet: 0, kredit: 10.5 }])).toThrow(RegnskapsFeil);
    expect(() => validerBilag([{ konto: 99, debet: 1, kredit: 0 }, { konto: 3000, debet: 0, kredit: 1 }])).toThrow(RegnskapsFeil);
  });
  it('innbetaling', () => {
    const p = byggInnbetaling(1725000, 'K1');
    expect(p).toHaveLength(2);
    expect(() => byggInnbetaling(0, null)).toThrow();
  });
  it('MVA-oppgjør nuller 2700 og 2710 og setter differansen på 2740', () => {
    const p = byggMvaOppgjor(-345000, 8980);
    expect(p.find(x => x.konto === 2700)!.debet).toBe(345000);
    expect(p.find(x => x.konto === 2710)!.kredit).toBe(8980);
    expect(p.find(x => x.konto === 2740)!.kredit).toBe(336020);
  });
  it('lønn: AGA 14,1 % og riktig netto', () => {
    expect(beregnAga(5000000, 14.1)).toBe(705000);
    expect(beregnAga(5000000, 7.9)).toBe(395000);
    const p = byggLonn([{ brutto: 5000000, skattetrekk: 1500000, feriepenger: 510000, agaSats: 14.1 }]);
    expect(p.find(x => x.konto === 1920)!.kredit).toBe(3500000);
    expect(p.find(x => x.konto === 2940)!.kredit).toBe(510000);
    expect(p.find(x => x.konto === 2785)!.kredit).toBe(71910);
    expect(sumD(p)).toBe(sumK(p));
  });
  it('åpningsbalanse balanserer mot egenkapital', () => {
    const p = byggApningsbalanse([{ konto: 1920, saldo: 10000000 }, { konto: 2400, saldo: -2500000 }]);
    expect(p.find(x => x.konto === 2050)!.kredit).toBe(7500000);
  });
  it('bankposter', () => {
    expect(byggBankPost('uttak', -500000, 'ENK')[0].konto).toBe(2050);
    expect(byggBankPost('uttak', -500000, 'AS')[0].konto).toBe(1570);
    expect(byggBankPost('gebyr', -4500, 'AS')[0].konto).toBe(7770);
    expect(byggBankPost('renteinntekt', 1234, 'AS')[1].konto).toBe(8040);
  });
});
