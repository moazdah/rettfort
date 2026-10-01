import { describe, it, expect } from 'vitest';
import { tolkKvittering, kronerIOrd, gyldigOrgnr, stoy } from '@/lib/kvittering.js';

const IDAG = { idag: '2026-10-05' };
const kiwi = (total = 'TOTALT 163,80', kort = 'Bankkort 163,80', mva = 'Herav MVA 15% 21,37') => [
  'KIWI MAJORSTUEN', 'Kiwi Norge AS', 'Org.nr 983 045 804 MVA', 'Dato: 03.10.2026 kl 16:42',
  'Kaffe Evergood 500g 89,90', 'Melk lett 1l 24,90', 'Kopper papp 50stk 49,00', total, mva, kort,
].join('\n');

describe('kvitteringer som leses riktig', () => {
  it('vanlig kvittering: total, MVA, dato, leverandør og varer', () => {
    const r = tolkKvittering(kiwi(), IDAG);
    expect(r).toMatchObject({ total: 16380, mva: 2137, sats: 15, dato: '2026-10-03', orgnr: '983045804', lev: 'Kiwi Norge AS', sikker: true });
    expect(r.status.total).toBe('bekreftet');
    expect(r.varer).toHaveLength(3);
  });
  it('faktura fra PDF: netto + MVA = å betale', () => {
    const r = tolkKvittering(['Nordlys Kontor AS', 'Org.nr 923 456 781 MVA', 'Faktura nr 1044', 'Fakturadato 20.09.2026', 'Forfall 04.10.2026', 'Skriverpapir 5 pk 1 000,00', 'Sum eks. mva 1 000,00', 'MVA 25 % 250,00', 'Å betale 1 250,00'].join('\n'), IDAG);
    expect(r).toMatchObject({ total: 125000, mva: 25000, sats: 25, dato: '2026-09-20' });
    expect(r.status.total).toBe('bekreftet');
  });
  it('flere MVA-satser på samme kvittering', () => {
    const r = tolkKvittering(['REMA 1000', 'Brød 30,00', 'Batterier 50,00', 'SUM 80,00', 'MVA 15% 3,91', 'MVA 25% 10,00', 'VISA 80,00'].join('\n'), IDAG);
    expect(r.total).toBe(8000);
    expect(r.mva).toBe(1391);
    expect(r.status.total).toBe('bekreftet');
  });
  it('rabatt trekkes fra i varesummen', () => {
    const r = tolkKvittering(['Clas Ohlson AS', 'Skjøteledning 299,00', 'Rabatt -50,00', 'Totalt 249,00', 'Herav mva 25% 49,80', 'Kort 249,00'].join('\n'), IDAG);
    expect(r).toMatchObject({ total: 24900, mva: 4980, sats: 25 });
  });
  it('punktum som desimaltegn og O i stedet for 0', () => {
    const r = tolkKvittering(['Circle K Norge AS', 'Diesel 612.40', 'TOTALT 612.4O', 'MVA 25% 122.48', 'VISA 612.40'].join('\n'), IDAG);
    expect(r.total).toBe(61240);
    expect(r.status.total).toBe('bekreftet');
  });
});

describe('feil fra tekstgjenkjenningen fanges', () => {
  it('tapt komma i totalen (163,80 → 16380) rettes ut fra kort og varer, men merkes «sjekk»', () => {
    const r = tolkKvittering(kiwi('TOTALT 16380'), IDAG);
    expect(r.total).toBe(16380);
    expect(r.status.total).toBe('sjekk');
    expect(r.sikker).toBe(false);
  });
  it('tapt null i totalen (1 800,00 → 180,00): velger det som stemmer, men ber om sjekk', () => {
    const r = tolkKvittering(['Elkjøp Norge AS', 'Skjerm 27" 1 800,00', 'TOTALT 180,00', 'Herav MVA 25% 360,00', 'Bankkort 1 800,00'].join('\n'), IDAG);
    expect(r.total).toBe(180000);
    expect(r.status.total).toBe('sjekk');
    expect(r.grunn.total).toMatch(/Totalt.*180,00/);
  });
  it('ekstra null i totalen (163,80 → 1638,00) blir ikke godtatt i det stille', () => {
    const r = tolkKvittering(kiwi('TOTALT 1638,00'), IDAG);
    expect(r.total).toBe(16380);
    expect(r.status.total).toBe('sjekk');
  });
  it('bare én kilde for totalen: aldri «bekreftet»', () => {
    const r = tolkKvittering(['Butikk AS', 'SUM 499,00'].join('\n'), IDAG);
    expect(r.total).toBe(49900);
    expect(r.status.total).toBe('sjekk');
    expect(r.sikker).toBe(false);
  });
  it('MVA som ikke passer med totalen merkes', () => {
    const r = tolkKvittering(['Butikk AS', 'Vare 400,00', 'TOTALT 400,00', 'MVA 25% 8,00', 'Kort 400,00'].join('\n'), IDAG);
    expect(r.total).toBe(40000);
    expect(r.status.mva).toBe('sjekk');
    expect(r.sikker).toBe(false);
  });
  it('MVA med tapt komma (21,37 → 2137) godtas ikke', () => {
    const r = tolkKvittering(kiwi(undefined, undefined, 'Herav MVA 15% 2137'), IDAG);
    expect(r.status.mva).toBe('sjekk');
    expect(r.sikker).toBe(false);
  });
  it('dato i fremtiden eller langt tilbake merkes', () => {
    expect(tolkKvittering('Butikk AS\nDato 03.10.2029\nSUM 10,00', IDAG).status.dato).toBe('sjekk');
  });
  it('tom tekst gir «mangler», ikke gjetting', () => {
    const r = tolkKvittering('', IDAG);
    expect(r.total).toBeNull();
    expect(r.status.total).toBe('mangler');
  });
});

describe('stresstest: tilfeldige kvitteringer med tilfeldige lesefeil', () => {
  // En feil som ikke blir fanget («stille feil») er det eneste som ikke er lov.
  let frø = 7;
  const tilf = () => { frø = (frø * 1103515245 + 12345) % 2147483648; return frø / 2147483648; };
  const kr = (o: number) => { const h = Math.floor(o / 100), d = o % 100; return `${String(h).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(d).padStart(2, '0')}`; };
  let rørt = false;
  const feil = (s: string) => {
    const t = tilf();
    const u = feilInner(s, t); if (u !== s) rørt = true; return u;
  };
  const feilInner = (s: string, t: number) => {
    if (t < 0.15) return s.replace(',', '');              // tapt komma
    if (t < 0.25) return s.replace(/0(?=[^0]*$)/, '');     // tapt null
    if (t < 0.32) return s.replace(',', '0,');             // ekstra null
    if (t < 0.38) return s.replace(/\d(?=,)/, '8');        // feil siffer
    if (t < 0.42) return s.replace(',', '.');             // punktum i stedet for komma
    if (t < 0.45) return s.replace(/(\d) (\d{3})/, '$1$2'); // tapt tusenskille
    if (t < 0.48) return s.replace(/,(\d)(\d)/, ',$2$1'); // byttet desimaler
    if (t < 0.50) return s.replace(/\d+,\d{2}/, '');      // tallet mangler helt
    return s;
  };
  it('20 000 kvitteringer med ti ulike frø: ingen stille feil i total eller MVA', () => {
    let riktigSikker = 0, fanget = 0, stille = 0, rene = 0, reneBekreftet = 0;
    const eksempler: string[] = [];
    for (const f of [7, 11, 42, 99, 123, 777, 2026, 31337, 55555, 987654]) { frø = f;
    for (let n = 0; n < 2000; n++) {
      const sats = [25, 15, 12][Math.floor(tilf() * 3)];
      const varer = Array.from({ length: 1 + Math.floor(tilf() * 5) }, () => 100 + Math.floor(tilf() * (tilf() < 0.2 ? 2_000_000 : 50_000)));
      const total = varer.reduce((a, b) => a + b, 0);
      const mva = Math.round((total * sats) / (100 + sats));
      rørt = false;
      const linjer = ['Butikken AS', `Dato ${String(1 + Math.floor(tilf() * 28)).padStart(2, '0')}.09.2026`, ...varer.map((v, i) => feil(`Vare ${i + 1} ${kr(v)}`)),
        feil(`TOTALT ${kr(total)}`), feil(`Herav MVA ${sats}% ${kr(mva)}`), ...(tilf() < 0.7 ? [feil(`Bankkort ${kr(total)}`)] : [])];
      const r = tolkKvittering(linjer.join('\n'), IDAG);
      const riktig = r.total === total && (r.mva === mva || r.mva == null);
      if (!rørt) { rene++; if (r.sikker && riktig) reneBekreftet++; }
      if (r.sikker && riktig) riktigSikker++;
      else if (!r.sikker) fanget++;
      else { stille++; if (eksempler.length < 3) eksempler.push(linjer.join(' | ') + ` → ${r.total}/${r.mva}`); }
    }
    }
    expect(eksempler).toEqual([]);
    expect(stille).toBe(0);
    // De fleste kvitteringer uten lesefeil skal bli bekreftet.
    console.log(`Stresstest: ${riktigSikker} riktige og bekreftet, ${fanget} flagget for sjekk, ${stille} stille feil. Feilfrie kvitteringer: ${reneBekreftet} av ${rene} bekreftet.`);
    // Kvitteringer uten lesefeil skal nesten alltid bli bekreftet.
    expect(reneBekreftet / rene).toBeGreaterThan(0.95);
    void fanget;
  });
});

describe('hjelpere', () => {
  it('beløp i ord gjør nullfeil lette å se', () => {
    expect(kronerIOrd(180000)).toBe('ett tusen åtte hundre kroner');
    expect(kronerIOrd(18000)).toBe('ett hundre og åtti kroner');
    expect(kronerIOrd(16380)).toBe('ett hundre og sekstitre kroner');
    expect(kronerIOrd(125000000)).toBe('én million to hundre og femti tusen kroner');
  });
  it('org.nr med kontrollsiffer', () => {
    expect(gyldigOrgnr('983 045 804')).toBe(true);
    expect(gyldigOrgnr('912345678')).toBe(false);
  });
});

describe('rot fra tekstgjenkjenningen siles bort', () => {
  const rotete = [
    "~ '. ;i |' ,", 'Ae7 rl ~ ;', 'BILTEMA NORGE AS', 'Org.nr 935 948 509 MVA', 'Storgata 12, 9008 Tromsø', 'Tlf 22 00 00 00', 'Dato 26.09.2026 14:12',
    '7350025000123 DRILLSETT 18V 999,20', 'Pant 2,00', 'xKjrtLq vbnm 0,50', 'TOTALT 1 001,70', 'Herav MVA 25% 200,34', 'Bankkort 1 001,70', 'Takk for handelen!',
  ].join('\n');
  it('velger riktig leverandør og hopper over rot, adresse og telefon', () => {
    const r = tolkKvittering(rotete, IDAG);
    expect(r.lev).toBe('Biltema Norge AS');
    expect(r.orgnr).toBe('935948509');
    expect(r.total).toBe(100170);
  });
  it('beskrivelsen har bare lesbare varer, uten strekkode, pant og rot', () => {
    const r = tolkKvittering(rotete, IDAG);
    expect(r.beskrivelse).toBe('Drillsett 18v');
    expect(r.varer.map(v => v.tekst)).not.toContain('xKjrtLq vbnm');
  });
  it('leverandør uten kjent kjede: linjen med selskapsform ved org.nr', () => {
    const r = tolkKvittering(['|| ~~ ,', 'Velkommen!', 'FJELLHEIM SNEKKERSERVICE AS', 'Org.nr 923 456 781', 'Arbeid kjøkken 3 500,00', 'Totalt 4 375,00', 'MVA 25% 875,00'].join('\n'), IDAG);
    expect(r.lev).toBe('Fjellheim Snekkerservice AS');
  });
  it('bare rot gir ingen leverandør, ikke søppel', () => {
    const r = tolkKvittering(['~|; ., ~', 'rl Ii lI |', 'SUM 120,00'].join('\n'), IDAG);
    expect(r.lev).toBeNull();
  });
  it('stoy() skiller tekst fra rot', () => {
    expect(stoy('Kaffe Evergood 500g')).toBeLessThan(0.3);
    expect(stoy("~ '. ;i |' ,")).toBeGreaterThan(0.45);
    expect(stoy('xKjrtLq vbnm')).toBeGreaterThan(0.45);
  });
});

describe('nettsiden bruker samme tolker', () => {
  it('rettfort-kvittering.js i roten er en kopi av src/lib/kvittering.js', async () => {
    const fs = await import('node:fs');
    const a = fs.readFileSync(new URL('../src/lib/kvittering.js', import.meta.url), 'utf8');
    const b = fs.readFileSync(new URL('../../rettfort-kvittering.js', import.meta.url), 'utf8').split('\n').slice(1).join('\n');
    expect(b).toBe(a);
  });
});

describe('systemet bruker samme leser som nettsiden', () => {
  it('public/les er kopier av filene i roten', async () => {
    const fs = await import('node:fs');
    for (const f of ['rettfort-bilag.js', 'rettfort-engine.js']) {
      expect(fs.readFileSync(new URL(`../public/les/${f}`, import.meta.url), 'utf8')).toBe(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
    }
  });
});
