import type { Sporring } from '@/lib/db';
import type { Fakta } from '@/lib/assistent';
import { rapportData } from './rapport';
import { aktuellTermin, mvaStatus } from './mva';
import { nesteFrister } from './oversikt';
import { hentOrg } from './faktura';

/** Samler tallene assistenten svarer ut fra. Alt kommer fra regnskapet. */
export async function hentFakta(t: Sporring, orgId: string, idag: string): Promise<Fakta> {
  const ar = Number(idag.slice(0, 4));
  const d = await rapportData(t, orgId, ar, idag);
  const org = await hentOrg(t, orgId);
  let mva: Fakta['mva'] = null;
  if (org.mva_registrert) {
    const termin = await aktuellTermin(t, orgId, idag);
    if (termin) { const st = await mvaStatus(t, orgId, termin); mva = { fra: termin.fra, til: termin.til, aBetale: st.sendt ? st.sendt.aBetale : st.tall.aBetale, sendt: !!st.sendt, mangler: st.antallMangler }; }
  }
  const frister = (await nesteFrister(t, orgId, idag, 6)).map(f => ({ dato: f.dato, tittel: f.tittel }));
  const r = (x: { inntekter: number; kostnader: number; resultat: number }) => ({ inntekter: x.inntekter, kostnader: x.kostnader, resultat: x.resultat });
  return {
    idag, ar, bank: d.bank,
    kunder: d.kundePoster.map(k => ({ nr: k.nr, kunde: k.kunde, forfall: k.forfall, rest: k.rest })),
    leverandorer: d.levPoster.map(l => ({ navn: l.navn, forfall: l.forfall, total: l.total })),
    resultat: r(d.res), ifjor: d.ifjor ? r(d.ifjor) : null,
    storsteKostnader: d.ut.filter(k => k.belop > 0).map(k => ({ navn: k.navn, belop: k.belop })),
    mva, skyldigMva: d.mvaSkyld, trekk: d.trekk, aga: d.aga, frister,
  };
}
