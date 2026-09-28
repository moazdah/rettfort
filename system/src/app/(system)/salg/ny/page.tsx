import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { hentOrg, hentSalg, type Kontakt } from '@/lib/tjenester/faktura';
import { FakturaSkjema, type SalgStart, type Videre } from '../FakturaSkjema';

export const metadata = { title: 'Ny faktura' };

export default async function NyFaktura({ searchParams }: { searchParams: Promise<{ utkast?: string; kopi?: string; tilbud?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const sp = await searchParams;
  const org = await hentOrg(d, s.org.id) as Awaited<ReturnType<typeof hentOrg>> & { faktura_tekst: string | null };
  const kunder = await d.q<Kontakt>(`select * from kontakt where organisasjon_id = $1 and type in ('kunde','begge') order by navn`, [s.org.id]);
  let start: SalgStart | undefined;
  const kildeId = sp.utkast ?? sp.kopi ?? sp.tilbud;
  if (kildeId && /^[0-9a-f-]{36}$/.test(kildeId)) {
    const f = await hentSalg(d, s.org.id, kildeId);
    if (f) {
      const erUtkast = !!sp.utkast && f.status === 'utkast';
      start = { id: erUtkast ? f.id : undefined, type: sp.tilbud ? 'faktura' : f.type === 'kreditnota' ? 'faktura' : f.type, kunde: f.kunde, dato: erUtkast ? f.dato : idag(), forfall: erUtkast ? f.forfall : null, levert: erUtkast ? f.levert : null, referanse: sp.tilbud ? `Tilbud ${f.nr}` : f.referanse, linjer: f.linjer, gjentakelse: erUtkast && f.gjentakelse === 'maned' ? 'maned' : null };
    }
  }
  const videre = (await d.q<{ id: string; kontakt: string; navn: string; tekst: string | null; total: number; mva: number; sats: number | null }>(
    `select id, videre_kontakt_id as kontakt, leverandor_navn as navn, tekst, total, mva, sats from kjop where organisasjon_id = $1 and videre_kontakt_id is not null and videre_faktura_id is null and status <> 'utkast'`, [s.org.id]))
    .map<Videre>(k => ({ id: k.id, kontaktId: k.kontakt, tekst: `${k.navn}${k.tekst ? ', ' + k.tekst : ''}`, netto: k.total - k.mva, sats: k.sats ?? 25 }));
  return (
    <div className="stakk" style={{ gap: 22 }}>
      <div className="hode">
        <div><div className="stikk" style={{ color: 'var(--gul-tekst)' }}>Penger inn</div><h1 style={{ marginTop: 4 }}>{start?.id ? 'Fortsett utkastet' : 'Jeg skal sende en faktura'}</h1></div>
        <Link href="/salg" className="knapp hvit">Alle fakturaer</Link>
      </div>
      <FakturaSkjema org={org} kunder={kunder} start={start} idag={idag()} videre={videre} />
    </div>
  );
}
