// Sender e-post gjennom Resend (https://resend.com). Nøkkelen legges inn av Vercel-integrasjonen
// som RESEND_API_KEY. Uten nøkkel sendes ingenting, og systemet viser koder og lenker på skjermen i stedet.

import { headers } from 'next/headers';

const nokkel = () => process.env.RESEND_API_KEY || process.env.EPOST_API_KEY || '';
const avsender = () => process.env.EPOST_FRA || `Rettført <post@${process.env.RESEND_EMAIL_DOMAIN || 'xn--rettfrt-u1a.no'}>`;

export const epostPa = () => nokkel() !== '';

export interface Epost {
  til: string;
  emne: string;
  tekst: string;
  svarTil?: string | null;
  vedlegg?: { filnavn: string; innhold: Uint8Array }[];
}

/** Sender én e-post. Gir false (og logger) hvis den ikke kunne sendes, men kaster aldri. */
export async function sendEpost(e: Epost): Promise<boolean> {
  if (!epostPa()) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${nokkel()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: avsender(), to: [e.til], subject: e.emne, text: e.tekst, html: somHtml(e.tekst),
        ...(e.svarTil ? { reply_to: e.svarTil } : {}),
        ...(e.vedlegg?.length ? { attachments: e.vedlegg.map(v => ({ filename: v.filnavn, content: Buffer.from(v.innhold).toString('base64') })) } : {}),
      }),
    });
    if (!r.ok) { console.error('E-post ble ikke sendt:', r.status, await r.text().catch(() => '')); return false; }
    return true;
  } catch (err) {
    console.error('E-post ble ikke sendt:', err);
    return false;
  }
}

/** Enkel, ren HTML-versjon av teksten. Lenker blir klikkbare. */
export function somHtml(tekst: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const avsnitt = esc(tekst).split(/\n{2,}/).map(a => `<p style="margin:0 0 14px">${a.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0B2545">$1</a>')}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B2545;max-width:560px">${avsnitt}<p style="margin:22px 0 0;color:#8A909C;font-size:13px">Rettført · rettført.no</p></div>`;
}

/** Adressen systemet kjører på, for lenker i e-post. */
export async function grunnadresse(): Promise<string> {
  if (process.env.RETTFORT_URL) return process.env.RETTFORT_URL.replace(/\/$/, '');
  const h = await headers();
  const vert = h.get('x-forwarded-host') || h.get('host') || 'min.xn--rettfrt-u1a.no';
  const proto = h.get('x-forwarded-proto') || (vert.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${vert}`;
}

export const maler = {
  bekreftkode: (navn: string, kode: string): Pick<Epost, 'emne' | 'tekst'> => ({
    emne: `Koden din er ${kode}`,
    tekst: `Hei ${navn}!\n\nKoden for å bekrefte e-posten din i Rettført er:\n\n${kode}\n\nHar du ikke laget en konto hos oss, kan du se bort fra denne e-posten.`,
  }),
  invitasjon: (fra: string, foretak: string, rolle: string, lenke: string): Pick<Epost, 'emne' | 'tekst'> => ({
    emne: `${fra} har invitert deg til ${foretak} i Rettført`,
    tekst: `Hei!\n\n${fra} har invitert deg til regnskapet for ${foretak} i Rettført, ${rolle}.\n\nTrykk på lenken for å godta:\n${lenke}\n\nLenken er personlig. Har du ikke ventet denne invitasjonen, kan du se bort fra den.`,
  }),
  faktura: (o: { type: string; nr: number; foretak: string; kunde: string; belop: string; forfall: string | null; kid: string | null; kontonr: string | null }): Pick<Epost, 'emne' | 'tekst'> => {
    const hva = o.type === 'kreditnota' ? 'Kreditnota' : o.type === 'tilbud' ? 'Tilbud' : o.type === 'kvittering' ? 'Kvittering' : 'Faktura';
    const betal = o.type === 'faktura'
      ? `\n\nÅ betale: ${o.belop} kr${o.forfall ? `\nForfall: ${o.forfall}` : ''}${o.kontonr ? `\nKontonummer: ${o.kontonr}` : ''}${o.kid ? `\nKID: ${o.kid}` : ''}`
      : '';
    return {
      emne: `${hva} ${o.nr} fra ${o.foretak}`,
      tekst: `Hei ${o.kunde}!\n\nVedlagt er ${hva.toLowerCase()} ${o.nr} fra ${o.foretak}.${betal}\n\nHar du spørsmål, svar på denne e-posten.\n\nVennlig hilsen\n${o.foretak}`,
    };
  },
};
