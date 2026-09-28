import { fakturaSummer, linjeNetto, type FakturaLinje } from '@/lib/hovedbok';
import { formaterOrgnr } from '@/lib/brreg';
import { kr, nd, antallTekst, formaterKontonr } from '@/lib/vis';

export interface DokAvsender { navn: string; orgnr?: string | null; adresse?: string | null; postnr?: string | null; poststed?: string | null; kontonr?: string | null; epost?: string | null; telefon?: string | null; tekst?: string | null; mvaRegistrert: boolean; orgform?: string }
export interface DokKunde { navn: string; orgnr?: string | null; adresse?: string | null; postnr?: string | null; poststed?: string | null }

const TITTEL: Record<string, string> = { faktura: 'Faktura', tilbud: 'Tilbud', kvittering: 'Kvittering', kreditnota: 'Kreditnota' };

/** Fakturaen slik kunden ser den. Brukes i forhåndsvisning, på detaljsiden og ved utskrift. */
export function FakturaDokument({ type, nr, dato, forfall, levert, referanse, kid, avsender, kunde, linjer, kreditgrunn }: {
  type: string; nr?: number | null; dato: string; forfall?: string | null; levert?: string | null; referanse?: string | null; kid?: string | null;
  avsender: DokAvsender; kunde: DokKunde | null; linjer: FakturaLinje[]; kreditgrunn?: string | null;
}) {
  const s = fakturaSummer(linjer.filter(l => l.beskrivelse.trim() || linjeNetto(l)), avsender.mvaRegistrert);
  const orgTekst = avsender.orgnr ? `Org.nr ${formaterOrgnr(avsender.orgnr)}${avsender.mvaRegistrert ? ' MVA' : ''}` : 'Org.nr mangler';
  return (
    <div className="dokument">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ lineHeight: 1.5, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{avsender.navn || 'Firmanavn'}</div>
          <div className="mut">{[avsender.adresse, [avsender.postnr, avsender.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Adresse mangler'}</div>
          <div className="mut">{orgTekst}</div>
          {avsender.orgform === 'AS' && <div className="mut">Foretaksregisteret</div>}
          <div className="mut">{[avsender.epost, avsender.telefon].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.6, flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{TITTEL[type] ?? 'Faktura'}</div>
          <div className="mut">Nr. {nr ?? 'gis ved sending'}</div>
          <div className="mut">Dato {nd(dato)}</div>
          {levert && <div className="mut">Levert {levert}</div>}
          {type === 'faktura' && <div className="mut">Forfall {forfall ? nd(forfall) : '–'}</div>}
          {type === 'tilbud' && forfall && <div className="mut">Gyldig til {nd(forfall)}</div>}
          {kid && <div className="mono">KID {kid}</div>}
          {referanse && <div className="mut">Ref. {referanse}</div>}
        </div>
      </div>
      <div style={{ margin: '20px 0 16px' }}>
        <div className="stikk faint" style={{ fontSize: 10.5 }}>Til</div>
        <div style={{ fontWeight: 600 }}>{kunde?.navn || 'Velg kunde'}</div>
        {kunde && <div className="mut">{[kunde.adresse, [kunde.postnr, kunde.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ')}{kunde.orgnr ? ` · org.nr ${formaterOrgnr(kunde.orgnr)}` : ''}</div>}
      </div>
      {kreditgrunn && <p style={{ marginBottom: 10 }}>Grunn: {kreditgrunn}</p>}
      <table>
        <thead><tr><th>Beskrivelse</th><th style={{ textAlign: 'right' }}>Antall</th><th style={{ textAlign: 'right' }}>Pris</th>{avsender.mvaRegistrert && <th style={{ textAlign: 'right' }}>MVA</th>}<th style={{ textAlign: 'right' }}>Beløp</th></tr></thead>
        <tbody>
          {linjer.filter(l => l.beskrivelse.trim() || linjeNetto(l)).map((l, i) => (
            <tr key={i}><td>{l.beskrivelse || '–'}</td><td style={{ textAlign: 'right' }}>{antallTekst(l.antallMilli)}</td><td className="belop" style={{ textAlign: 'right' }}>{kr(l.pris)}</td>{avsender.mvaRegistrert && <td style={{ textAlign: 'right' }}>{l.sats} %</td>}<td className="belop" style={{ textAlign: 'right' }}>{kr(linjeNetto(l))}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: 'auto', maxWidth: 280, marginTop: 12, lineHeight: 1.8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">Netto</span><span className="belop">{kr(s.netto)}</span></div>
        {s.perSats.filter(g => g.sats > 0).map(g => <div key={g.sats} style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">MVA {g.sats} % av {kr(g.grunnlag)}</span><span className="belop">{kr(g.mva)}</span></div>)}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--linje)', paddingTop: 4, marginTop: 4 }}>
          <span>{type === 'kvittering' ? 'Betalt' : type === 'kreditnota' ? 'Til gode' : type === 'tilbud' ? 'Totalt' : 'Å betale'}</span><span className="belop">{kr(s.total)} kr</span>
        </div>
      </div>
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid var(--linje-3)', fontSize: 12 }} className="mut">
        {avsender.tekst && <div style={{ marginBottom: 4 }}>{avsender.tekst}</div>}
        {type === 'faktura' && <div>Betal til konto <span className="mono">{formaterKontonr(avsender.kontonr) || '–'}</span>{kid ? <> med KID <span className="mono">{kid}</span></> : null}{forfall ? ` innen ${nd(forfall)}` : ''}.</div>}
        {!avsender.mvaRegistrert && <div>Foretaket er ikke registrert i Merverdiavgiftsregisteret.</div>}
      </div>
    </div>
  );
}
