// Logoen til foretaket. Med i alle pakker. Bildet lagres i databasen og vises bare der foretaket har valgt.

import type { Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { lesLogo, ALLE_STEDER, MAKS_BREDDE, MAKS_HOYDE, type LogoSted } from '../logo';

export interface Logo { mime: 'image/png' | 'image/jpeg'; dataUrl: string; bytes: Uint8Array; bredde: number; hoyde: number; bruk: LogoSted[] }

const somLogo = (r: { mime: string; bilde: string; bredde: number; hoyde: number; bruk: string[] | string }): Logo => ({
  mime: r.mime as Logo['mime'], dataUrl: `data:${r.mime};base64,${r.bilde}`, bytes: Uint8Array.from(Buffer.from(r.bilde, 'base64')),
  bredde: Number(r.bredde), hoyde: Number(r.hoyde),
  bruk: (Array.isArray(r.bruk) ? r.bruk : String(r.bruk).replace(/[{}]/g, '').split(',').filter(Boolean)) as LogoSted[],
});

/** Logoen, uansett hvor den er valgt vist. */
export async function hentLogo(t: Sporring, orgId: string): Promise<Logo | null> {
  const r = await t.en<{ mime: string; bilde: string; bredde: number; hoyde: number; bruk: string[] }>('select mime, bilde, bredde, hoyde, bruk from foretak_logo where organisasjon_id = $1', [orgId]);
  return r ? somLogo(r) : null;
}

/** Logoen bare hvis foretaket vil ha den på dette stedet. */
export async function logoFor(t: Sporring, orgId: string, sted: LogoSted): Promise<Logo | null> {
  const l = await hentLogo(t, orgId);
  return l && l.bruk.includes(sted) ? l : null;
}

/** Lagrer en ny logo. Første gang vises den alle steder; ved bytte beholdes valgene. */
export async function lagreLogo(t: Sporring, orgId: string, dataUrl: string, bredde: number, hoyde: number) {
  const l = lesLogo(dataUrl);
  if (!l) throw new RegnskapsFeil('Bildet må være PNG eller JPG og under 400 kB.');
  const b = Math.round(bredde), h = Math.round(hoyde);
  if (!(b > 0 && h > 0 && b <= MAKS_BREDDE && h <= MAKS_HOYDE)) throw new RegnskapsFeil('Bildet har feil størrelse. Prøv å laste det opp på nytt.');
  await t.q(`insert into foretak_logo (organisasjon_id, mime, bilde, bredde, hoyde, bruk) values ($1, $2, $3, $4, $5, $6)
    on conflict (organisasjon_id) do update set mime = excluded.mime, bilde = excluded.bilde, bredde = excluded.bredde, hoyde = excluded.hoyde, endret = now()`, [orgId, l.mime, l.base64, b, h, ALLE_STEDER]);
}

export async function velgLogoSteder(t: Sporring, orgId: string, steder: string[]) {
  const bruk = ALLE_STEDER.filter(s => steder.includes(s));
  const r = await t.en('update foretak_logo set bruk = $2, endret = now() where organisasjon_id = $1 returning 1', [orgId, bruk]);
  if (!r) throw new RegnskapsFeil('Last opp en logo først.');
}

export async function fjernLogo(t: Sporring, orgId: string) {
  await t.q('delete from foretak_logo where organisasjon_id = $1', [orgId]);
}

/** Til e-post: logoen som innebygd bilde (cid), så den vises uten at e-postprogrammet må hente noe. */
export const logoVedlegg = (l: Logo) => ({ filnavn: l.mime === 'image/png' ? 'logo.png' : 'logo.jpg', innhold: l.bytes, cid: 'firmalogo' });

/** Til maler i epost.ts: størrelsen på logoen og vedlegget, eller ingenting når foretaket ikke vil ha logo i e-post. */
export async function epostLogo(t: Sporring, orgId: string): Promise<{ logo?: { bredde: number; hoyde: number }; vedlegg: ReturnType<typeof logoVedlegg>[] }> {
  const l = await logoFor(t, orgId, 'epost');
  return l ? { logo: { bredde: l.bredde, hoyde: l.hoyde }, vedlegg: [logoVedlegg(l)] } : { vedlegg: [] };
}
