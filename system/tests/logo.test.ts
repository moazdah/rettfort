import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { nyTestDb } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import { lesLogo, ALLE_STEDER } from '@/lib/logo';
import { hentLogo, logoFor, lagreLogo, velgLogoSteder, fjernLogo, epostLogo } from '@/lib/tjenester/logo';
import { lagFakturaPdf, lagLonnslippPdf } from '@/lib/pdf';
import { maler } from '@/lib/epost';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Logo', () => {
  it('godtar bare ekte PNG og JPEG', () => {
    expect(lesLogo(PNG)?.mime).toBe('image/png');
    expect(lesLogo('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    // Feil innhold bak riktig type stoppes
    expect(lesLogo(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`)).toBeNull();
    expect(lesLogo(`data:image/jpeg;base64,${PNG.split(',')[1]}`)).toBeNull();
    expect(lesLogo(`data:image/png;base64,${Buffer.alloc(500 * 1024, 1).toString('base64')}`)).toBeNull();
  });

  it('lagres for alle pakker, vises alle steder først, og bare der foretaket velger', async () => {
    const db = await nyTestDb();
    const b = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('l@example.com','L','x',true) returning id`))!.id;
    const org = await lagTestfirma(db, b, 'Logo AS', '2026-10-05');
    expect(await hentLogo(db, org)).toBeNull();
    await expect(lagreLogo(db, org, 'data:image/gif;base64,R0lGOD', 1, 1)).rejects.toThrow(/PNG eller JPG/);
    await expect(lagreLogo(db, org, PNG, 5000, 1)).rejects.toThrow(/størrelse/);
    await lagreLogo(db, org, PNG, 1, 1);
    expect((await hentLogo(db, org))!.bruk).toEqual(ALLE_STEDER);
    await velgLogoSteder(db, org, ['faktura', 'ukjent']);
    expect((await hentLogo(db, org))!.bruk).toEqual(['faktura']);
    expect(await logoFor(db, org, 'faktura')).not.toBeNull();
    expect(await logoFor(db, org, 'meny')).toBeNull();
    expect((await epostLogo(db, org)).vedlegg).toEqual([]);
    // Ny logo beholder valgene
    await lagreLogo(db, org, PNG, 1, 1);
    expect((await hentLogo(db, org))!.bruk).toEqual(['faktura']);
    await fjernLogo(db, org);
    expect(await hentLogo(db, org)).toBeNull();
    await expect(velgLogoSteder(db, org, ['faktura'])).rejects.toThrow(/Last opp en logo/);
  });

  it('kommer med i PDF-ene og e-posten', async () => {
    const l = lesLogo(PNG)!;
    const av = { navn: 'Logo AS', orgnr: null, adresse: null, postnr: null, poststed: null, kontonr: null, epost: null, telefon: null, tekst: null, mvaRegistrert: false, orgform: 'AS' };
    const linjer = [{ beskrivelse: 'Arbeid', antallMilli: 1000, pris: 10000, sats: 0, konto: 3000 }];
    const uten = await lagFakturaPdf({ type: 'faktura', nr: 1, dato: '2026-10-05', forfall: null, levert: null, referanse: null, kid: null, avsender: av, kunde: null, linjer });
    const med = await lagFakturaPdf({ type: 'faktura', nr: 1, dato: '2026-10-05', forfall: null, levert: null, referanse: null, kid: null, avsender: av, kunde: null, linjer, logo: l });
    expect(med.length).toBeGreaterThan(uten.length);
    expect((await PDFDocument.load(med)).getPageCount()).toBe(1);
    // Et ødelagt bilde stopper ikke fakturaen
    await expect(lagFakturaPdf({ type: 'faktura', nr: 1, dato: '2026-10-05', forfall: null, levert: null, referanse: null, kid: null, avsender: av, kunde: null, linjer, logo: { mime: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } })).resolves.toBeInstanceOf(Uint8Array);
    const slipp = await lagLonnslippPdf({ foretak: { navn: 'Logo AS', orgnr: null, adresse: null, postnr: null, poststed: null }, ansatt: { navn: 'Kari', stilling: null, kontonr: null }, periodeTekst: 'oktober 2026', utbetalt: '2026-10-20', skatteprosent: 30, linjer: [{ tekst: 'Lønn', belop: 100000 }], brutto: 100000, skatt: 30000, netto: 70000, feriepenger: 12000, feriePst: 12, logo: l });
    expect(slipp.length).toBeGreaterThan(1000);
    const m = maler.faktura({ type: 'faktura', nr: 1, foretak: 'Logo AS', kunde: 'Kunde', belop: '100,00', forfall: null, kid: null, kontonr: null, logo: { bredde: 400, hoyde: 100 } });
    expect(m.html).toContain('src="cid:firmalogo" width="192" height="48"');
    expect(maler.faktura({ type: 'faktura', nr: 1, foretak: 'Logo AS', kunde: 'Kunde', belop: '100,00', forfall: null, kid: null, kontonr: null }).html).not.toContain('firmalogo');
  });
});
