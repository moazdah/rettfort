// Logoen til foretaket: hvor den kan vises, og kontroll av bildet. Brukes både i nettleseren og på serveren.

export const LOGO_STEDER = [
  ['faktura', 'Fakturaer, tilbud og kreditnotaer', 'Øverst til venstre på PDF-en og i forhåndsvisningen.'],
  ['epost', 'E-poster til kunder og ansatte', 'Øverst i e-posten med fakturaen, påminnelsen og lønnslippen.'],
  ['lonnslipp', 'Lønnslipper', 'Øverst på lønnslippen de ansatte får.'],
  ['vaktplan', 'Vaktplanen for ansatte', 'Det de ansatte ser når de åpner vaktplanen.'],
  ['meny', 'Menyen i systemet', 'Ved navnet på foretaket øverst til høyre.'],
] as const;
export type LogoSted = (typeof LOGO_STEDER)[number][0];
export const ALLE_STEDER: LogoSted[] = LOGO_STEDER.map(s => s[0]);

/** Største filen vi tar imot etter at bildet er gjort mindre i nettleseren. */
export const MAKS_BYTES = 400 * 1024;
/** Logoen gjøres så liten før den lagres. Nok til skarp utskrift i fakturahodet. */
export const MAKS_BREDDE = 800, MAKS_HOYDE = 300;

/** Leser en data-URL og sjekker at innholdet faktisk er PNG eller JPEG (ikke SVG eller annet som kan kjøre kode). */
export function lesLogo(dataUrl: string): { mime: 'image/png' | 'image/jpeg'; base64: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl.trim());
  if (!m) return null;
  const bytes = Uint8Array.from(Buffer.from(m[2], 'base64'));
  if (!bytes.length || bytes.length > MAKS_BYTES) return null;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (m[1] === 'image/png' ? !png : !jpg) return null;
  return { mime: m[1] as 'image/png' | 'image/jpeg', base64: m[2], bytes };
}
