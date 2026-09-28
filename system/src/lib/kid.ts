// KID (kundeidentifikasjon) med kontrollsiffer etter MOD10 (Luhn) eller MOD11.

/** Kontrollsiffer etter MOD10 (Luhn): vekter 2,1,2,1 … fra høyre. */
export function mod10(tall: string): string {
  if (!/^\d+$/.test(tall)) throw new Error('KID-grunnlaget kan bare inneholde sifre.');
  let sum = 0;
  let dobbel = true;
  for (let i = tall.length - 1; i >= 0; i--) {
    let d = Number(tall[i]);
    if (dobbel) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dobbel = !dobbel;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Kontrollsiffer etter MOD11: vekter 2,3,4,5,6,7 gjentatt fra høyre.
 * Rest 0 → 0, rest 1 → «-» (ugyldig for KID, grunnlaget må byttes), ellers 11 − rest.
 */
export function mod11(tall: string): string | null {
  if (!/^\d+$/.test(tall)) throw new Error('KID-grunnlaget kan bare inneholde sifre.');
  let sum = 0;
  let vekt = 2;
  for (let i = tall.length - 1; i >= 0; i--) {
    sum += Number(tall[i]) * vekt;
    vekt = vekt === 7 ? 2 : vekt + 1;
  }
  const rest = sum % 11;
  if (rest === 0) return '0';
  if (rest === 1) return null;
  return String(11 - rest);
}

/** Lager KID: fakturanummer + kundenummer (4 siffer) + kontrollsiffer. */
export function lagKid(fakturanr: number, kundenr: number, metode: 'mod10' | 'mod11' = 'mod10'): string {
  if (!Number.isInteger(fakturanr) || fakturanr < 1) throw new Error('Ugyldig fakturanummer.');
  if (!Number.isInteger(kundenr) || kundenr < 0 || kundenr > 9999) throw new Error('Kundenummer må være 0–9999.');
  const grunn = `${fakturanr}${String(kundenr).padStart(4, '0')}`;
  if (metode === 'mod11') {
    // Rest 1 gir kontrollsiffer 10. Etter bankenes KID-standard brukes da «-».
    return grunn + (mod11(grunn) ?? '-');
  }
  return grunn + mod10(grunn);
}

/** Sjekker om en KID har gyldig kontrollsiffer etter valgt metode. */
export function gyldigKid(kid: string, metode: 'mod10' | 'mod11' = 'mod10'): boolean {
  const s = kid.replace(/\s/g, '');
  if (!/^\d{1,24}[\d-]$/.test(s)) return false;
  const grunn = s.slice(0, -1);
  const k = s.slice(-1);
  return metode === 'mod10' ? mod10(grunn) === k : (mod11(grunn) ?? '-') === k;
}

/** Leser fakturanummeret ut av en KID laget med lagKid. */
export function fakturanrFraKid(kid: string, metode: 'mod10' | 'mod11' = 'mod10'): number | null {
  const s = kid.replace(/\s/g, '').replace(/^0+/, '');
  if (!gyldigKid(kid, metode) || s.length < 6) return null;
  const nr = Number(s.slice(0, -5));
  return Number.isInteger(nr) && nr > 0 ? nr : null;
}
