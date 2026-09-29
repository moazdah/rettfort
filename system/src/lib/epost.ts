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
  html?: string;
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
        from: avsender(), to: [e.til], subject: e.emne, text: e.tekst, html: e.html ?? somHtml(e.tekst),
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

// ---------- Maler ----------
// Tabeller og innebygde stiler, fordi e-postprogrammene ikke forstår moderne CSS.
// Fargene er de samme som på forsiden: blå #0B2545, beige #F4F1EA, gul #F6DF6E.

const BLA = '#0B2545', BEIGE = '#F4F1EA', GUL = '#F6DF6E', MUT = '#586174', LINJE = '#E4DFD4';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const bilder = () => (process.env.RETTFORT_URL || 'https://min.xn--rettfrt-u1a.no').replace(/\/$/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rammen rundt alle e-poster: logo og figur øverst, innholdet i et hvitt kort. */
export function ramme(o: { tittel: string; innhold: string; bunn?: string; forhandsvisning?: string }): string {
  const b = bilder();
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.tittel)}</title></head>
<body style="margin:0;padding:0;background:${BEIGE}">
${o.forhandsvisning ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.forhandsvisning)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BEIGE}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 0 12px"><img src="${b}/epost/topp.png" width="520" alt="Rettført" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:16px"></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINJE};border-radius:16px;padding:32px 28px;font-family:${FONT};color:${BLA}">
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:${BLA}">${esc(o.tittel)}</h1>
${o.innhold}
</td></tr>
<tr><td align="center" style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#8A909C">${o.bunn ?? 'Rettført · rettført.no'}</td></tr>
</table></td></tr></table></body></html>`;
}

const avsnitt = (t: string, stil = '') => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${BLA};${stil}">${t}</p>`;
const liten = (t: string) => `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUT}">${t}</p>`;
const knapp = (tekst: string, href: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px"><tr><td style="background:${BLA};border-radius:99px"><a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:99px">${esc(tekst)}</a></td></tr></table>`;

export interface Mal { emne: string; tekst: string; html: string }

export const maler = {
  bekreftkode: (navn: string, kode: string): Mal => ({
    emne: `Koden din er ${kode}`,
    tekst: `Hei ${navn}!\n\nKoden for å bekrefte e-posten din i Rettført er:\n\n${kode}\n\nHar du ikke laget en konto hos oss, kan du se bort fra denne e-posten.`,
    html: ramme({
      tittel: 'Koden din', forhandsvisning: `${kode} er koden din`,
      innhold: avsnitt(`Hei ${esc(navn)}! Skriv inn koden for å bekrefte e-posten.`)
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${BEIGE};border-radius:12px;padding:20px 12px"><span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${BLA};background:linear-gradient(transparent 62%,${GUL} 62%);padding:0 4px">${esc(kode)}</span></td></tr></table>`
        + liten('Har du ikke laget en konto hos oss, kan du se bort fra denne e-posten.'),
    }),
  }),
  invitasjon: (fra: string, foretak: string, rolle: string, lenke: string): Mal => ({
    emne: `${fra} har invitert deg til ${foretak} i Rettført`,
    tekst: `Hei!\n\n${fra} har invitert deg til regnskapet for ${foretak} i Rettført, ${rolle}.\n\nTrykk på lenken for å godta:\n${lenke}\n\nLenken er personlig. Har du ikke ventet denne invitasjonen, kan du se bort fra den.`,
    html: ramme({
      tittel: `Invitasjon til ${foretak}`, forhandsvisning: `${fra} har invitert deg ${rolle}`,
      innhold: avsnitt(`<b>${esc(fra)}</b> har invitert deg til regnskapet for <b>${esc(foretak)}</b>, ${esc(rolle)}.`)
        + knapp('Godta invitasjonen', lenke)
        + liten('Lenken er personlig. Har du ikke ventet denne invitasjonen, kan du se bort fra den.'),
    }),
  }),
  faktura: (o: { type: string; nr: number; foretak: string; kunde: string; belop: string; forfall: string | null; kid: string | null; kontonr: string | null }): Mal => {
    const hva = o.type === 'kreditnota' ? 'Kreditnota' : o.type === 'tilbud' ? 'Tilbud' : o.type === 'kvittering' ? 'Kvittering' : 'Faktura';
    const erFaktura = o.type === 'faktura';
    const betal = erFaktura
      ? `\n\nÅ betale: ${o.belop} kr${o.forfall ? `\nForfall: ${o.forfall}` : ''}${o.kontonr ? `\nKontonummer: ${o.kontonr}` : ''}${o.kid ? `\nKID: ${o.kid}` : ''}`
      : '';
    const rad = (k: string, v: string, stor = false) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:14px;color:${MUT}">${k}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:${stor ? 20 : 15}px;font-weight:${stor ? 700 : 600};color:${BLA};font-family:${stor ? FONT : "'SFMono-Regular',Menlo,Consolas,monospace"}">${esc(v)}</td></tr>`;
    const tabell = erFaktura
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:1px solid ${LINJE}">${rad('Å betale', `${o.belop} kr`, true)}${o.forfall ? rad('Forfall', o.forfall) : ''}${o.kontonr ? rad('Kontonummer', o.kontonr) : ''}${o.kid ? rad('KID', o.kid) : ''}</table>`
      : '';
    return {
      emne: `${hva} ${o.nr} fra ${o.foretak}`,
      tekst: `Hei ${o.kunde}!\n\nVedlagt er ${hva.toLowerCase()} ${o.nr} fra ${o.foretak}.${betal}\n\nHar du spørsmål, svar på denne e-posten.\n\nVennlig hilsen\n${o.foretak}`,
      html: ramme({
        tittel: `${hva} ${o.nr} fra ${o.foretak}`, forhandsvisning: erFaktura ? `${o.belop} kr${o.forfall ? ` · forfall ${o.forfall}` : ''}` : `${hva} ${o.nr}`,
        innhold: tabell + avsnitt(`${{ Faktura: 'Fakturaen', Kreditnota: 'Kreditnotaen', Tilbud: 'Tilbudet', Kvittering: 'Kvitteringen' }[hva]} ligger vedlagt som PDF.`, 'margin:0') + liten('Har du spørsmål, svar på denne e-posten.'),
        bunn: `Sendt av ${esc(o.foretak)} med Rettført`,
      }),
    };
  },
  lonnslipp: (o: { navn: string; foretak: string; periode: string; netto: string; utbetalt: string; lenke?: string | null; passordTekst?: string }): Mal => ({
    emne: `Lønnslipp for ${o.periode} fra ${o.foretak}`,
    tekst: `Hei ${o.navn}!\n\nLønnslippen din for ${o.periode} er klar.\n\nUtbetalt: ${o.netto} kr\nDato: ${o.utbetalt}\n\n${o.lenke ? `Åpne lønnslippen her:\n${o.lenke}\n\nDu trenger ${o.passordTekst ?? 'passordet'} for å åpne den.` : 'Lønnslippen ligger vedlagt som PDF.'}\n\nHar du spørsmål, svar på denne e-posten.\n\nVennlig hilsen\n${o.foretak}`,
    html: ramme({
      tittel: `Lønnslipp for ${o.periode}`, forhandsvisning: `${o.netto} kr utbetales ${o.utbetalt}`,
      innhold: avsnitt(`Hei ${esc(o.navn)}! Her er lønnslippen din fra ${esc(o.foretak)}.`)
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:1px solid ${LINJE}"><tr><td style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:14px;color:${MUT}">Utbetalt</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:20px;font-weight:700;color:${BLA};font-family:${FONT}">${esc(o.netto)} kr</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:14px;color:${MUT}">Dato</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${LINJE};font-size:15px;font-weight:600;color:${BLA};font-family:'SFMono-Regular',Menlo,Consolas,monospace">${esc(o.utbetalt)}</td></tr></table>`
        + (o.lenke
          ? knapp('Åpne lønnslippen', o.lenke) + liten(`Du trenger ${esc(o.passordTekst ?? 'passordet')} for å åpne den. Lønnslippen ligger ikke i e-posten, så den er trygg selv om noen andre ser innboksen din.`)
          : avsnitt('Lønnslippen ligger vedlagt som PDF.', 'margin:0') + liten('Har du spørsmål, svar på denne e-posten.')),
      bunn: `Sendt av ${esc(o.foretak)} med Rettført`,
    }),
  }),
  skannelenke: (o: { navn: string | null; foretak: string; type: 'klient' | 'ansatt'; lenke: string }): Mal => {
    const ansatt = o.type === 'ansatt';
    const hva = ansatt ? `utlegg til ${o.foretak}` : `kvitteringer og fakturaer til ${o.foretak}`;
    return {
      emne: ansatt ? `Send utlegg til ${o.foretak}` : `Send bilag til ${o.foretak}`,
      tekst: `Hei${o.navn ? ` ${o.navn.split(' ')[0]}` : ''}!\n\nMed denne lenken kan du sende ${hva} rett fra mobilen. Ta bilde av kvitteringen, så er det gjort.\n\n${o.lenke}\n\nLenken er personlig. Tips: legg den til på hjemskjermen, så har du den alltid for hånden.`,
      html: ramme({
        tittel: ansatt ? 'Send utlegg med mobilen' : 'Send bilag med mobilen', forhandsvisning: `Ta bilde av kvitteringen, så er det sendt til ${o.foretak}`,
        innhold: avsnitt(`Hei${o.navn ? ` ${esc(o.navn.split(' ')[0])}` : ''}! Med denne lenken kan du sende ${esc(hva)} rett fra mobilen. Ta bilde av kvitteringen, så er det gjort.`)
          + knapp(ansatt ? 'Send et utlegg' : 'Send en kvittering', o.lenke)
          + liten(`${ansatt ? 'Du ser også om utleggene dine er godkjent og betalt. ' : ''}Lenken er personlig. Tips: legg den til på hjemskjermen, så har du den alltid for hånden.`),
        bunn: `Sendt av ${esc(o.foretak)} med Rettført`,
      }),
    };
  },
};
